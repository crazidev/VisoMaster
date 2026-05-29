"""
app/processors/stream_output.py
────────────────────────────────
UDP stream output via FFmpeg.

Processed BGR frames are piped to FFmpeg which encodes and sends them
as MPEG-TS over UDP — the same pattern used for file recording, just
with a UDP destination instead of a file.

Receiving the output
─────────────────────
ffplay udp://127.0.0.1:5001
ffmpeg -i udp://127.0.0.1:5001 -c copy output.mp4
vlc udp://@:5001
"""
from __future__ import annotations

import queue
import subprocess
import threading
import time
from typing import Optional

import numpy as np

from app.helpers.miscellaneous import get_ffmpeg_path

_CODEC_ARGS: dict[str, list[str]] = {
    "h264": ["-c:v", "libx264", "-preset", "ultrafast", "-tune", "zerolatency"],
    "h265": ["-c:v", "libx265", "-preset", "ultrafast", "-tune", "zerolatency",
             "-x265-params", "log-level=error"],
}


class UDPOutput:
    """
    Streams processed BGR frames to a UDP destination via FFmpeg.

    Frames are pushed via push_frame(bgr_ndarray) from any thread.
    An internal writer thread drains the queue and pipes raw bytes to
    FFmpeg's stdin, which encodes and sends MPEG-TS over UDP.
    """

    def __init__(self) -> None:
        self.host: str = ""
        self.port: int = 0
        self.url: str = ""
        self.width: int = 0
        self.height: int = 0
        self.fps: float = 30.0
        self.bitrate_kbps: int = 4000
        self.codec: str = "h264"

        self._proc: Optional[subprocess.Popen] = None
        self._writer_thread: Optional[threading.Thread] = None
        self._running = False
        self._frame_queue: queue.Queue[np.ndarray] = queue.Queue(maxsize=4)

        self._fps_count = 0
        self._fps_start = 0.0
        self.current_fps: float = 0.0

    # ── Public API ────────────────────────────────────────────────────────────

    def start(
        self,
        host: str = "127.0.0.1",
        port: int = 5001,
        codec: str = "h264",
        bitrate_kbps: int = 4000,
        fps: float = 30.0,
        width: int = 0,
        height: int = 0,
    ) -> None:
        """Start streaming processed frames to *host*:*port* over UDP.

        Parameters
        ----------
        host:         Destination IP address.
        port:         Destination UDP port.
        codec:        'h264' (default) or 'h265'.
        bitrate_kbps: Target video bitrate in kbps.
        fps:          Output frame rate.
        width/height: Resize output. 0 = use source frame dimensions.
        """
        self.stop()
        self.host = host
        self.port = port
        self.url = f"udp://{host}:{port}"
        self.codec = codec
        self.bitrate_kbps = bitrate_kbps
        self.fps = fps
        self.width = width
        self.height = height
        self._running = True
        self._fps_start = 0.0
        self._fps_count = 0

        self._writer_thread = threading.Thread(
            target=self._write_loop,
            daemon=True,
            name="udp-output-writer",
        )
        self._writer_thread.start()
        print(f"[UDPOutput] Writer started → udp://{host}:{port} ({codec}, {bitrate_kbps}kbps)")

    def stop(self) -> None:
        self._running = False
        if self._proc is not None:
            try:
                if self._proc.stdin:
                    self._proc.stdin.close()
            except Exception:
                pass
            try:
                self._proc.wait(timeout=3)
            except Exception:
                try:
                    self._proc.kill()
                except Exception:
                    pass
            self._proc = None
        if self._writer_thread is not None and self._writer_thread.is_alive():
            self._writer_thread.join(timeout=3)
        self._writer_thread = None
        while not self._frame_queue.empty():
            try:
                self._frame_queue.get_nowait()
            except queue.Empty:
                break
        self.host = ""
        self.port = 0
        self.url = ""
        print("[UDPOutput] Stopped.")

    def push_frame(self, frame_bgr: np.ndarray) -> None:
        """Push a BGR frame (non-blocking, latest-wins).

        Frames are accepted as soon as start() is called, even before
        FFmpeg has launched (the writer thread waits for the first frame
        to determine dimensions before spawning FFmpeg).
        """
        if not self._running:
            return
        if self.width > 0 and self.height > 0:
            h, w = frame_bgr.shape[:2]
            if w != self.width or h != self.height:
                import cv2
                frame_bgr = cv2.resize(frame_bgr, (self.width, self.height))
        if self._frame_queue.full():
            try:
                self._frame_queue.get_nowait()
            except queue.Empty:
                pass
        try:
            self._frame_queue.put_nowait(frame_bgr)
        except queue.Full:
            pass

    @property
    def running(self) -> bool:
        return self._running and self._proc is not None and self._proc.poll() is None

    # ── Internal ──────────────────────────────────────────────────────────────

    def _write_loop(self, ) -> None:
        # Wait for first frame to know dimensions.
        # Poll with short timeouts so we can check _running and exit cleanly.
        first: Optional[np.ndarray] = None
        print("[UDPOutput] Waiting for first processed frame...")
        while self._running:
            try:
                first = self._frame_queue.get(timeout=0.5)
                break
            except queue.Empty:
                continue

        if first is None:
            print("[UDPOutput] Stopped before receiving any frames.")
            self._running = False
            return

        h, w = first.shape[:2]
        if self.width == 0 or self.height == 0:
            self.width = w
            self.height = h

        # Ensure even dimensions (H.264 requirement)
        self.width  = self.width  + (self.width  % 2)
        self.height = self.height + (self.height % 2)

        ffmpeg = get_ffmpeg_path()
        codec_args = _CODEC_ARGS.get(self.codec, _CODEC_ARGS["h264"])

        args = [
            ffmpeg, "-hide_banner", "-loglevel", "warning",
            "-f", "rawvideo",
            "-pix_fmt", "bgr24",
            "-s", f"{self.width}x{self.height}",
            "-r", str(self.fps),
            "-i", "pipe:0",
            *codec_args,
            "-b:v", f"{self.bitrate_kbps}k",
            "-maxrate", f"{int(self.bitrate_kbps * 1.5)}k",
            "-bufsize", f"{self.bitrate_kbps * 2}k",
            "-pix_fmt", "yuv420p",
            # Force a keyframe every second so receivers can sync quickly
            # without waiting for the next GOP boundary.
            "-g", str(max(1, int(self.fps))),
            "-keyint_min", str(max(1, int(self.fps))),
            # Embed SPS/PPS in every keyframe (required for UDP mid-stream join)
            "-flags", "+global_header",
            "-an",
            "-f", "mpegts",
            self.url,
        ]

        print(f"[UDPOutput] FFmpeg: {' '.join(args)}")

        try:
            self._proc = subprocess.Popen(
                args, stdin=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0
            )
        except Exception as exc:
            print(f"[UDPOutput] Failed to launch FFmpeg: {exc}")
            self._running = False
            return

        threading.Thread(target=self._log_stderr, daemon=True,
                         name="udp-output-stderr").start()

        self._write_frame(first)

        while self._running and self._proc.poll() is None:
            try:
                frame = self._frame_queue.get(timeout=0.1)
                self._write_frame(frame)
            except queue.Empty:
                continue
            except Exception as exc:
                print(f"[UDPOutput] Write error: {exc}")
                break

        self._running = False
        print("[UDPOutput] Write loop exited.")

    def _write_frame(self, frame_bgr: np.ndarray) -> None:
        if self._proc is None or self._proc.stdin is None:
            return
        try:
            if self.width > 0 and self.height > 0:
                h, w = frame_bgr.shape[:2]
                if w != self.width or h != self.height:
                    import cv2
                    frame_bgr = cv2.resize(frame_bgr, (self.width, self.height))
            self._proc.stdin.write(frame_bgr.tobytes())

            self._fps_count += 1
            now = time.time()
            if self._fps_start == 0:
                self._fps_start = now
            elapsed = now - self._fps_start
            if elapsed >= 1.0:
                self.current_fps = self._fps_count / elapsed
                self._fps_count = 0
                self._fps_start = now
        except BrokenPipeError:
            print("[UDPOutput] FFmpeg stdin closed.")
            self._running = False
        except Exception as exc:
            print(f"[UDPOutput] _write_frame error: {exc}")
            self._running = False

    def _log_stderr(self) -> None:
        if self._proc is None or self._proc.stderr is None:
            return
        try:
            for line in self._proc.stderr:
                decoded = line.decode("utf-8", errors="replace").rstrip()
                if decoded:
                    print(f"[FFmpeg/UDP-out] {decoded}")
        except Exception:
            pass
