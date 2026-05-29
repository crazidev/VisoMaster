"""
POST /api/udp/input/start
POST /api/udp/input/stop
GET  /api/udp/input/status
POST /api/udp/output/start
POST /api/udp/output/stop
GET  /api/udp/output/status
"""
from __future__ import annotations

import socket

from fastapi import APIRouter, Depends, Request

from app.api.deps import get_app_state, get_video_processor
from app.api.schemas import (
    OkResponse,
    UDPInputStartRequest,
    UDPInputStartResponse,
    UDPInputStatusResponse,
    UDPOutputStartRequest,
    UDPOutputStatusResponse,
    WsOutputStartRequest,
    WsOutputStatusResponse,
)
from app.core.state import AppState

router = APIRouter(prefix="/api/udp", tags=["udp-streaming"])


def _local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


# ── UDP input ─────────────────────────────────────────────────────────────────

def _get_ingester(request: Request):
    if not hasattr(request.app.state, "udp_ingester") or request.app.state.udp_ingester is None:
        from app.processors.stream_ingester import UDPIngester
        request.app.state.udp_ingester = UDPIngester()
    return request.app.state.udp_ingester


@router.post("/input/start", response_model=UDPInputStartResponse)
def start_udp_input(
    body: UDPInputStartRequest,
    request: Request,
    vp=Depends(get_video_processor),
):
    """Start listening for a UDP stream and feed frames into the pipeline.

    The sender pushes MPEG-TS (or raw H.264/MJPEG) to udp://<this-ip>:<port>.
    FFmpeg auto-detects the container/codec unless input_format is specified.

    Example senders:
        ffmpeg -re -i input.mp4 -c:v libx264 -f mpegts udp://192.168.1.x:5000
        ffmpeg -f lavfi -i testsrc2 -c:v libx264 -f mpegts udp://192.168.1.x:5000
        obs → Settings → Stream → Custom → udp://192.168.1.x:5000
    """
    ingester = _get_ingester(request)

    vp.stop_processing()
    if vp.media_capture:
        vp.media_capture.release()
        vp.media_capture = None

    ingester.start(
        port=body.port,
        host=body.host,
        width=body.width,
        height=body.height,
        fps=body.fps,
        input_format=body.input_format,
        buffer_size=body.buffer_size,
    )

    vp.file_type = "udp"
    vp.media_path = f"UDP:{body.port}"
    vp.media_capture = None
    vp.fps = ingester.fps
    vp.max_frame_number = 999_999
    vp.current_frame_number = 0
    vp._ingester = ingester
    vp.process_video()

    ip = _local_ip()
    return UDPInputStartResponse(
        url=f"udp://{ip}:{body.port}",
        port=body.port,
        width=ingester.width,
        height=ingester.height,
        fps=ingester.fps,
    )


@router.post("/input/stop", response_model=OkResponse)
def stop_udp_input(
    request: Request,
    vp=Depends(get_video_processor),
):
    vp.stop_processing()
    ingester = getattr(request.app.state, "udp_ingester", None)
    if ingester:
        ingester.stop()
    vp.file_type = None
    return OkResponse(message="UDP input stopped")


@router.get("/input/status", response_model=UDPInputStatusResponse)
def udp_input_status(request: Request):
    ingester = getattr(request.app.state, "udp_ingester", None)
    if ingester and ingester.running:
        return UDPInputStatusResponse(
            running=True,
            url=ingester.url,
            port=ingester.port,
            state=ingester.state,
            frames_received=ingester.frames_received,
        )
    return UDPInputStatusResponse(running=False)


# ── UDP output ────────────────────────────────────────────────────────────────

def _get_output(request: Request):
    if not hasattr(request.app.state, "udp_output") or request.app.state.udp_output is None:
        from app.processors.stream_output import UDPOutput
        request.app.state.udp_output = UDPOutput()
    return request.app.state.udp_output


def _wire_output(udp_output, vp) -> None:
    existing = vp.on_frame_done

    def _combined(fn, f, s, _out=udp_output):
        existing(fn, f, s)
        if _out._running:   # use _running flag, not .running property
            _out.push_frame(f)

    vp.on_frame_done = _combined
    vp._udp_output_cb = _combined
    vp._udp_output_orig_cb = existing


def _unwire_output(vp) -> None:
    orig = getattr(vp, "_udp_output_orig_cb", None)
    if orig is not None:
        vp.on_frame_done = orig
        vp._udp_output_cb = None
        vp._udp_output_orig_cb = None


@router.post("/output/start", response_model=OkResponse)
def start_udp_output(
    body: UDPOutputStartRequest,
    request: Request,
    vp=Depends(get_video_processor),
):
    """Stream processed frames to *host*:*port* as MPEG-TS over UDP.

    Receive with:
        ffplay udp://127.0.0.1:<port>
        ffmpeg -i udp://127.0.0.1:<port> -c copy output.mp4
        vlc udp://@:<port>
    """
    udp_output = _get_output(request)
    udp_output.stop()

    udp_output.start(
        host=body.host,
        port=body.port,
        codec=body.codec,
        bitrate_kbps=body.bitrate_kbps,
        fps=body.fps,
        width=body.width,
        height=body.height,
    )

    _wire_output(udp_output, vp)
    return OkResponse(message=f"UDP output started → udp://{body.host}:{body.port}")


@router.post("/output/stop", response_model=OkResponse)
def stop_udp_output(
    request: Request,
    vp=Depends(get_video_processor),
):
    udp_output = getattr(request.app.state, "udp_output", None)
    if udp_output:
        udp_output.stop()
    _unwire_output(vp)
    return OkResponse(message="UDP output stopped")


@router.get("/output/status", response_model=UDPOutputStatusResponse)
def udp_output_status(request: Request):
    udp_output = getattr(request.app.state, "udp_output", None)
    if udp_output and udp_output.running:
        return UDPOutputStatusResponse(
            running=True,
            url=udp_output.url,
            codec=udp_output.codec,
            bitrate_kbps=udp_output.bitrate_kbps,
            fps=udp_output.fps,
            current_fps=round(udp_output.current_fps, 1),
        )
    return UDPOutputStatusResponse(running=False)


# ── WebSocket output ──────────────────────────────────────────────────────────
# A separate standalone WebSocket server (not /ws/preview) that only runs when
# explicitly started. Clients connect to ws://<host>:<port> and receive raw
# JPEG bytes — identical protocol to /ws/preview.

ws_output_router = APIRouter(prefix="/api/ws-output", tags=["ws-output"])


def _get_ws_output(request: Request):
    if not hasattr(request.app.state, "ws_output") or request.app.state.ws_output is None:
        from app.processors.ws_output import WsOutput
        request.app.state.ws_output = WsOutput()
    return request.app.state.ws_output


def _wire_ws_output(ws_out, vp) -> None:
    existing = vp.on_frame_done

    def _combined(fn, f, s, _out=ws_out):
        existing(fn, f, s)
        if _out._running:
            _out.push_frame(f)

    vp.on_frame_done = _combined
    vp._ws_output_cb = _combined
    vp._ws_output_orig_cb = existing


def _unwire_ws_output(vp) -> None:
    orig = getattr(vp, "_ws_output_orig_cb", None)
    if orig is not None:
        vp.on_frame_done = orig
        vp._ws_output_cb = None
        vp._ws_output_orig_cb = None


@ws_output_router.post("/start", response_model=OkResponse)
def start_ws_output(
    body: WsOutputStartRequest,
    request: Request,
    vp=Depends(get_video_processor),
):
    """Start a standalone WebSocket server that pushes processed frames as JPEG.

    Connect with:
        python preview-ws.py  # ws://localhost:<port>
        Any WebSocket client that reads binary messages as JPEG images.
    """
    ws_out = _get_ws_output(request)
    ws_out.stop()
    ws_out.start(host=body.host, port=body.port, quality=body.quality)
    _wire_ws_output(ws_out, vp)
    return OkResponse(message=f"WS output started → ws://{body.host}:{body.port}")


@ws_output_router.post("/stop", response_model=OkResponse)
def stop_ws_output(
    request: Request,
    vp=Depends(get_video_processor),
):
    ws_out = getattr(request.app.state, "ws_output", None)
    if ws_out:
        ws_out.stop()
    _unwire_ws_output(vp)
    return OkResponse(message="WS output stopped")


@ws_output_router.get("/status", response_model=WsOutputStatusResponse)
def ws_output_status(request: Request):
    ws_out = getattr(request.app.state, "ws_output", None)
    if ws_out and ws_out.running:
        return WsOutputStatusResponse(
            running=True,
            url=ws_out.url,
            quality=ws_out.quality,
            clients=ws_out.client_count,
            current_fps=round(ws_out.current_fps, 1),
        )
    return WsOutputStatusResponse(running=False)
