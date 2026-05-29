"""
app/processors/stream_ingester.py
──────────────────────────────────
UDP stream ingestion via FFmpeg.

FFmpeg reads from a UDP socket and writes raw BGR24 frames to stdout.
A reader thread pulls those frames into a thread-safe queue that
VideoProcessor polls via _process_next_ingester_frame().

Supported input formats over UDP
─────────────────────────────────
MPEG-TS  — most common; used by OBS, FFmpeg, VLC
           ffmpeg -i udp://0.0.0.0:5000
H.264 ES — raw Annex-B elementary stream
           ffmpeg -f h264 -i udp://0.0.0.0:5000
MJPEG    — motion JPEG over UDP
           ffmpeg -f mjpeg -i udp://0.0.0.0:5000

The sender specifies the format; VisoMaster auto-detects via FFmpeg.
"""
from __future__ import annotations

import queue
import subprocess
import threading
import time
from typing import Optional

import numpy as np

from app.helpers.miscellaneous import get_ffmpeg_path

_QUEUE_MAXSIZE = 4


class UDPIngester:
    """
    Receives a UDP stream via FFmpeg and delivers BGR frames to a queue.

    State machine
    ─────────────
    IDLE → start() → CONNECTING → first frame → STREAMING → stop() → IDLE

    All transitions are logged with [UDPIngester] prefix.
    """

    STATE_IDLE       = "idle"
    STATE_CONNECTING = "connecting"
    STATE_STREAMING  = "streaming"
    STATE_ERROR      = "error"

    def __init__(self) -> None:
        self.port: int = 0
        self.host: str = "0.0.0.0"
        self.url: str = ""
        self.width: int = 1280
        self.height: int = 720
        self.fps: float = 30.0
        self.input_format: str = ""   # '' = auto-detect, 'h264', 'mjpeg', etc.

        self.frame_queue: queue.Queue[np.ndarray] = queue.Queue(maxsize=_QUEUE_MAXSIZE)

        self._proc: Optional[subprocess.Popen] = None
        self._reader_thread: Optional[threading.Thread] = None
        self._running = False

        self.state: str = self.STATE_IDLE
        self.frames_received: int = 0
        self.connect_time: float = 0.0
        self._fps_count: int = 0
        self._fps_last_log: float = 0.0

    # ── Public API ────────────────────────────────────────────────────────────

    def start(
        self,
        port: int = 5000,
        host: str = "0.0.0.0",
        width: int = 1280,
        height: int = 720,
        fps: float = 30.0,
        input_format: str = "",
        buffer_size: int = 4096,
    ) -> None:
        """Start listening for a UDP stream on *host*:*port*.

        Parameters
        ----------
        port:          UDP port to listen on.
        host:          Bind address (default 0.0.0.0 = all interfaces).
        width/height:  Output frame dimensions (FFmpeg scales to this).
        fps:           Output frame rate.
        input_format:  Force input format: '' (auto), 'h264', 'mjpeg', 'mpegts'.
        buffer_size:   UDP socket receive buffer in KB (default 4096 = 4 MB).
        """
        self.stop()
        self.port = port
        self.host = host
        self.width = width + (width % 2)
        self.height = height + (height % 2)
        self.fps = fps if fps > 0 else 30.0
        self.input_format = input_format
        self.url = f"udp://{host}:{port}"
        self.frames_received = 0
        self.connect_time = time.time()
        self.state = self.STATE_CONNECTING

        ffmpeg = get_ffmpeg_path()
        args = [ffmpeg, "-hide_banner", "-loglevel", "warning"]

        # UDP socket options — larger buffer reduces packet loss
        udp_url = f"udp://{host}:{port}?overrun_nonfatal=1&fifo_size={buffer_size * 1024}"

        # Optional input format override
        if input_format:
            args += ["-f", input_format]

        args += ["-i", udp_url]
        args += [
            "-vf", f"scale={self.width}:{self.height}",
            "-r", str(self.fps),
            "-f", "rawvideo",
            "-pix_fmt", "bgr24",
            "-an",
            "pipe:1",
        ]

        print(f"[UDPIngester] Launching FFmpeg:")
        print(f"  {' '.join(args)}")
        print(f"[UDPIngester] Listening on udp://{host}:{port} — waiting for sender...")

        self._proc = subprocess.Popen(
            args,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=0,
        )
        self._running = True

        threading.Thread(target=self._log_stderr, daemon=True,
                         name="udp-ingester-stderr").start()
        self._reader_thread = threading.Thread(
            target=self._read_frames, daemon=True, name="udp-ingester-reader"
        )
        self._reader_thread.start()
        print(f"[UDPIngester] Started — output: {self.width}x{self.height} @ {self.fps:.0f}fps BGR24")

    def stop(self) -> None:
        if self._running or self._proc is not None:
            print(f"[UDPIngester] Stopping (state={self.state}, frames={self.frames_received})")
        self._running = False
        self.state = self.STATE_IDLE

        if self._proc is not None:
            try:
                self._proc.terminate()
                self._proc.wait(timeout=3)
            except Exception:
                try:
                    self._proc.kill()
                except Exception:
                    pass
            self._proc = None

        if self._reader_thread is not None and self._reader_thread.is_alive():
            self._reader_thread.join(timeout=3)
        self._reader_thread = None

        while not self.frame_queue.empty():
            try:
                self.frame_queue.get_nowait()
            except queue.Empty:
                break

        self.port = 0
        self.url = ""
        self.frames_received = 0
        print("[UDPIngester] Stopped.")

    @property
    def running(self) -> bool:
        return self._running and self._proc is not None and self._proc.poll() is None

    # ── Internal ──────────────────────────────────────────────────────────────

    def _read_frames(self) -> None:
        if self._proc is None or self._proc.stdout is None:
            return

        frame_bytes = self.width * self.height * 3
        buf = bytearray()
        stdout = self._proc.stdout
        print(f"[UDPIngester] Reader started — {frame_bytes} bytes/frame")

        while self._running:
            try:
                chunk = stdout.read(frame_bytes - len(buf))
                if not chunk:
                    if self._running:
                        elapsed = time.time() - self.connect_time
                        if self.frames_received == 0:
                            print(f"[UDPIngester] FFmpeg exited before any frames "
                                  f"(waited {elapsed:.1f}s). Is anything sending to "
                                  f"udp://{self.host}:{self.port}?")
                        else:
                            print(f"[UDPIngester] Stream ended after "
                                  f"{self.frames_received} frames ({elapsed:.1f}s)")
                        self.state = self.STATE_ERROR
                    break

                buf.extend(chunk)

                if len(buf) >= frame_bytes:
                    frame = np.frombuffer(
                        bytes(buf[:frame_bytes]), dtype=np.uint8
                    ).reshape((self.height, self.width, 3)).copy()
                    buf = buf[frame_bytes:]

                    if self.frames_received == 0:
                        ms = (time.time() - self.connect_time) * 1000
                        self.state = self.STATE_STREAMING
                        print(f"[UDPIngester] ✓ First frame! Connected in {ms:.0f}ms — UDP stream is live")

                    self.frames_received += 1
                    self._fps_count += 1

                    now = time.time()
                    if now - self._fps_last_log >= 5.0:
                        if self._fps_last_log > 0:
                            fps = self._fps_count / (now - self._fps_last_log)
                            print(f"[UDPIngester] {self.frames_received} frames total, {fps:.1f} fps")
                        self._fps_count = 0
                        self._fps_last_log = now

                    if self.frame_queue.full():
                        try:
                            self.frame_queue.get_nowait()
                        except queue.Empty:
                            pass
                    try:
                        self.frame_queue.put_nowait(frame)
                    except queue.Full:
                        pass

            except Exception as exc:
                if self._running:
                    print(f"[UDPIngester] Read error: {exc}")
                break

        self._running = False
        print(f"[UDPIngester] Reader exited (frames={self.frames_received}, state={self.state})")

    def _log_stderr(self) -> None:
        if self._proc is None or self._proc.stderr is None:
            return
        try:
            for line in self._proc.stderr:
                decoded = line.decode("utf-8", errors="replace").rstrip()
                if decoded:
                    print(f"[FFmpeg/UDP-in] {decoded}")
        except Exception:
            pass
