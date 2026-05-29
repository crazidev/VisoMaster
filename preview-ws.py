"""
VisoMaster WebSocket preview client.

Connects to the WS Output stream and displays processed frames with OpenCV.
Start the stream first from the Output → Stream panel in the UI.
Automatically reconnects if the connection drops.

Default URL: ws://localhost:8765/ws/preview

Usage:
  python preview-ws.py                                    # default port 8765
  python preview-ws.py ws://localhost:8765/ws/preview     # explicit URL
  python preview-ws.py ws://192.168.1.10:8765/ws/preview  # remote host
"""
import asyncio
import sys
import time

import cv2
import numpy as np
import websockets

DEFAULT_URL = 'ws://localhost:8765/ws/preview'
WS_URL = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_URL

WINDOW_NAME = 'VisoMaster Preview'

# Reconnect settings
RECONNECT_DELAY_MIN = 1.0   # seconds before first retry
RECONNECT_DELAY_MAX = 10.0  # cap backoff at this
RECONNECT_BACKOFF   = 1.5   # multiply delay by this on each failure


def fit_frame_to_window(frame: np.ndarray, win_w: int, win_h: int) -> np.ndarray:
    """Resize frame to fill (win_w, win_h) while preserving aspect ratio."""
    fh, fw = frame.shape[:2]
    if fw == 0 or fh == 0 or win_w == 0 or win_h == 0:
        return frame

    scale = min(win_w / fw, win_h / fh)
    new_w = int(fw * scale)
    new_h = int(fh * scale)

    resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

    canvas = np.zeros((win_h, win_w, 3), dtype=np.uint8)
    y_off = (win_h - new_h) // 2
    x_off = (win_w - new_w) // 2
    canvas[y_off:y_off + new_h, x_off:x_off + new_w] = resized
    return canvas


async def receive_frames(ws: websockets.WebSocketClientProtocol) -> None:
    """Receive and display frames from an open WebSocket connection."""
    cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)
    while True:
        data = await ws.recv()
        frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
        if frame is None:
            continue
        _, _, win_w, win_h = cv2.getWindowImageRect(WINDOW_NAME)
        cv2.imshow(WINDOW_NAME, fit_frame_to_window(frame, win_w, win_h))
        if cv2.waitKey(1) & 0xFF == ord('q'):
            raise KeyboardInterrupt


async def run() -> None:
    """Connect and keep reconnecting until the user presses Q."""
    delay = RECONNECT_DELAY_MIN
    total_frames = 0

    while True:
        try:
            print(f"Connecting to {WS_URL} ...")
            async with websockets.connect(WS_URL) as ws:
                print("Connected. Press Q in the preview window to quit.")
                delay = RECONNECT_DELAY_MIN  # reset backoff on successful connect
                await receive_frames(ws)

        except KeyboardInterrupt:
            print(f"\nDone. Received {total_frames} frames.")
            break

        except (
            websockets.ConnectionClosed,
            websockets.InvalidURI,
            websockets.InvalidHandshake,
            OSError,
        ) as exc:
            print(f"Disconnected: {exc}  — retrying in {delay:.1f}s ...")
            await asyncio.sleep(delay)
            delay = min(delay * RECONNECT_BACKOFF, RECONNECT_DELAY_MAX)

        except Exception as exc:
            print(f"Unexpected error: {exc}  — retrying in {delay:.1f}s ...")
            await asyncio.sleep(delay)
            delay = min(delay * RECONNECT_BACKOFF, RECONNECT_DELAY_MAX)

    cv2.destroyAllWindows()


asyncio.run(run())
