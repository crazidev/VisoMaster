"""
app/processors/ws_output.py
────────────────────────────
Standalone WebSocket server that pushes processed frames as JPEG to
any connected client.

This is the single external preview streaming path across all launch modes
(Qt desktop, Qt WebEngine, headless API). It only runs when explicitly
started from the Output → Stream panel — no auto-start.

Usage
─────
    ws_out = WsOutput()
    ws_out.start(host="0.0.0.0", port=8765, quality=75)
    ws_out.push_frame(bgr_ndarray)   # called from FrameWorker thread
    ws_out.stop()

Clients connect to ws://<host>:<port>/ws/preview and receive raw JPEG
bytes as binary WebSocket messages.

    python preview-ws.py ws://localhost:8765/ws/preview
"""
from __future__ import annotations

import asyncio
import threading
import time
from typing import Optional, Set

import cv2
import numpy as np

# Path clients connect to — matches the existing /ws/preview convention
WS_PATH = "/ws/preview"


class WsOutput:
    """
    Standalone WebSocket server that pushes JPEG frames to all connected clients.

    Thread-safe: push_frame() is called from FrameWorker threads; the asyncio
    server runs on its own dedicated thread.

    Clients connect to ws://<host>:<port>/ws/preview — same path as the
    built-in /ws/preview endpoint so preview-ws.py works without changes.
    """

    def __init__(self) -> None:
        self.host: str = ""
        self.port: int = 0
        self.quality: int = 75
        self.url: str = ""

        self._running = False
        self._server_thread: Optional[threading.Thread] = None
        self._loop: Optional[asyncio.AbstractEventLoop] = None

        # Latest-frame-wins slot — avoids queue buildup when clients are slow
        self._latest_frame: Optional[bytes] = None

        # Connected client events (one asyncio.Event per client)
        self._clients: Set[asyncio.Event] = set()
        self._clients_lock = threading.Lock()

        self._fps_count = 0
        self._fps_start = 0.0
        self.current_fps: float = 0.0
        self.client_count: int = 0

        # Set when the server is actually listening (not just the thread started)
        self._ready_event = threading.Event()

    # ── Public API ────────────────────────────────────────────────────────────

    def start(
        self,
        host: str = "0.0.0.0",
        port: int = 8765,
        quality: int = 75,
    ) -> None:
        """Start the WebSocket server on *host*:*port*/ws/preview."""
        self.stop()

        # Capture params into locals so the server thread always has the right values
        # even if stop() clears the instance attributes before the thread reads them.
        _host = host
        _port = port
        _quality = max(1, min(100, quality))

        self.host = _host
        self.port = _port
        self.quality = _quality
        self.url = f"ws://{_host}:{_port}/ws/preview"
        self._running = True
        self._ready_event.clear()

        self._server_thread = threading.Thread(
            target=self._run_server,
            args=(_host, _port),
            daemon=True,
            name="ws-output-server",
        )
        self._server_thread.start()
        # Wait up to 3 s for the server to actually bind before returning
        self._ready_event.wait(timeout=3.0)
        print(f"[WsOutput] Server ready on ws://{_host}:{_port}/ws/preview (quality={_quality})")

    def stop(self) -> None:
        """Stop the WebSocket server and disconnect all clients."""
        if not self._running and self._server_thread is None:
            return
        self._running = False
        loop = self._loop
        if loop is not None and not loop.is_closed():
            loop.call_soon_threadsafe(loop.stop)
        thread = self._server_thread
        if thread is not None and thread.is_alive():
            thread.join(timeout=5)
        self._server_thread = None
        self._loop = None
        self._latest_frame = None
        with self._clients_lock:
            self._clients.clear()
        self.client_count = 0
        self.host = ""
        self.port = 0
        self.url = ""
        print("[WsOutput] Stopped.")

    def push_frame(self, frame_bgr: np.ndarray) -> None:
        """Push a BGR frame from any thread (non-blocking, latest-wins)."""
        if not self._running:
            return
        loop = self._loop
        if loop is None or loop.is_closed():
            return
        with self._clients_lock:
            if not self._clients:
                return  # No subscribers — skip encoding

        # Encode to JPEG
        ok, buf = cv2.imencode(
            ".jpg", frame_bgr,
            [cv2.IMWRITE_JPEG_QUALITY, self.quality],
        )
        if not ok:
            return
        jpeg_bytes = buf.tobytes()

        # Store latest frame and wake all client sender coroutines
        self._latest_frame = jpeg_bytes
        if not loop.is_closed():
            loop.call_soon_threadsafe(self._wake_clients)

        # FPS tracking
        self._fps_count += 1
        now = time.time()
        if self._fps_start == 0:
            self._fps_start = now
        elapsed = now - self._fps_start
        if elapsed >= 1.0:
            self.current_fps = self._fps_count / elapsed
            self._fps_count = 0
            self._fps_start = now

    @property
    def running(self) -> bool:
        return self._running and self._server_thread is not None and self._server_thread.is_alive()

    # ── Internal ──────────────────────────────────────────────────────────────

    def _wake_clients(self) -> None:
        """Called on the asyncio thread — set all client events."""
        with self._clients_lock:
            for ev in self._clients:
                ev.set()

    def _run_server(self, host: str, port: int) -> None:
        """Thread body — runs the asyncio event loop.

        host and port are passed as arguments (not read from self) so they
        are captured at start() time and immune to stop() clearing self.host/port.
        """
        try:
            import websockets
            from websockets.server import serve as ws_serve
        except ImportError:
            print("[WsOutput] 'websockets' package not installed — cannot start WS output server.")
            self._running = False
            self._ready_event.set()
            return

        self._loop = asyncio.new_event_loop()
        asyncio.set_event_loop(self._loop)

        async def _handler(websocket, path=None):
            """Handle one client connection regardless of path."""
            client_event = asyncio.Event()
            with self._clients_lock:
                self._clients.add(client_event)
                self.client_count = len(self._clients)
            print(f"[WsOutput] Client connected from {websocket.remote_address} ({self.client_count} total)")

            try:
                while self._running:
                    await client_event.wait()
                    client_event.clear()
                    frame_bytes = self._latest_frame
                    if frame_bytes is None:
                        continue
                    try:
                        await websocket.send(frame_bytes)
                    except Exception:
                        break
            except Exception:
                pass
            finally:
                with self._clients_lock:
                    self._clients.discard(client_event)
                    self.client_count = len(self._clients)
                print(f"[WsOutput] Client disconnected ({self.client_count} remaining)")

        async def _serve():
            # SO_REUSEADDR is set by default in websockets — but give the OS
            # a moment if we just stopped a server on the same port.
            async with ws_serve(_handler, host, port, reuse_address=True):
                print(f"[WsOutput] Listening on ws://{host}:{port}/ws/preview")
                self._ready_event.set()
                while self._running:
                    await asyncio.sleep(0.1)

        try:
            self._loop.run_until_complete(_serve())
        except Exception as exc:
            print(f"[WsOutput] Server error: {exc}")
        finally:
            self._running = False
            self._ready_event.set()  # unblock start() if it's still waiting
            try:
                self._loop.close()
            except Exception:
                pass
            print("[WsOutput] Event loop closed.")

