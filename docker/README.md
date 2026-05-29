# VisoMaster — Docker / Headless VNC Container

Run VisoMaster on cloud GPU services (RunPod, Vast.ai, Lambda Labs) or any Linux machine with an NVIDIA GPU — no local display required.

## What's included

| Service | Port | Protocol | URL |
|---|---|---|---|
| TigerVNC | 5901 | TCP | `vnc://host:5901` |
| noVNC (browser VNC) | 6901 | TCP | `http://host:6901/vnc.html` |
| VisoMaster API + Web UI | 8000 | TCP | `http://host:8000` |
| Vite dev server (React UI) | 5173 | TCP | `http://host:5173` |
| filebrowser | 8585 | TCP | `http://host:8585` |
| **WS preview stream** | **8765** | **TCP** | `ws://host:8765/ws/preview` |
| streamrelay WebRTC HTTP | 9091 | TCP | `http://host:9091` |
| streamrelay WebRTC HTTPS | 9090 | TCP | `https://host:9090` |
| WebRTC media | 10000 | UDP | — |
| **UDP input** | **5000** | **UDP** | `udp://host:5000` |
| **UDP output** | **5001** | **UDP** | `udp://host:5001` |

Desktop icons on the Xfce4 VNC desktop:
- **VisoMaster** — opens the Web UI
- **OBS Studio** — launches OBS (virtual camera output)
- **File Browser** — opens filebrowser
- **Terminal** — Xfce4 terminal

## Quick start

### Docker Compose (recommended)

```bash
git clone https://github.com/your-org/VisoMaster.git
cd VisoMaster
git submodule update --init --recursive

docker compose -f docker/docker-compose.yml up -d
docker compose -f docker/docker-compose.yml logs -f visomaster
```

Open `http://localhost:6901/vnc.html` (password: `visomaster`).

### docker run

```bash
docker run -d --gpus all \
  -p 5901:5901 -p 6901:6901 \
  -p 8000:8000 -p 8585:8585 \
  -p 8765:8765 \
  -p 9090:9090 -p 9091:9091 \
  -p 10000:10000/udp \
  -p 5000:5000/udp -p 5001:5001/udp \
  -v visomaster_data:/workspace/data \
  -e VNC_PW=visomaster \
  --privileged \
  visomaster:latest
```

### Build from source

```bash
# CUDA 12.4 (default — RTX 30xx/40xx)
docker build -f docker/Dockerfile -t visomaster:latest .

# CUDA 11.8 (older GPUs — RTX 20xx and below)
docker build -f docker/Dockerfile.cuda118 -t visomaster:cu118 .
```

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `VNC_PW` | `visomaster` | VNC password |
| `VNC_PASSWORDLESS` | `false` | Set `true` to disable VNC auth |
| `VNC_RESOLUTION` | `1280x800` | Desktop resolution |
| `SKIP_MODEL_DOWNLOAD` | `0` | Set `1` to skip auto model download on first start |
| `TAILSCALE_AUTHKEY` | _(empty)_ | Tailscale auth key — enables Tailscale on startup |

## Streaming ports

### WebSocket preview (port 8765)

The WS preview stream starts automatically at launch. Connect any WebSocket client to receive processed frames as JPEG:

```bash
python preview-ws.py                              # default ws://localhost:8765/ws/preview
python preview-ws.py ws://100.x.x.x:8765/ws/preview  # via Tailscale
```

### UDP input (port 5000)

Push MPEG-TS video into VisoMaster from any sender:

```bash
# From FFmpeg
ffmpeg -re -i input.mp4 -c:v libx264 -f mpegts udp://host:5000

# From OBS: Settings → Stream → Custom → udp://host:5000
```

Start the UDP input source from the **Source → Streaming → UDP** panel in the UI.

### UDP output (port 5001)

Pull the processed stream from VisoMaster:

```bash
ffplay -fflags nobuffer -flags low_delay udp://localhost:5001
vlc udp://@:5001
```

Start UDP output from the **Output → Stream → UDP Output** panel in the UI.

### WebRTC (ports 9090, 9091, 10000)

- **WHIP endpoint**: `http://host:9091/whip` (or `https://host:9090/whip`)
- **Browser camera client**: `http://host:9091/`
- **Media channel**: port 10000 UDP

WebRTC is started on-demand when you activate the **Streaming → Browser/WebRTC** source in the UI.

## Persistent data (volume)

Mount `/workspace/data` to a network volume to persist:

- `model_assets/` — downloaded ONNX models (~15 GB)
- `tensorrt-engines/` — auto-built TRT engines (~10 GB)
- `output/` — recorded videos and snapshots
- `last_workspace.json` — session state

On first start, models are downloaded automatically into the volume in the background. Check `/workspace/logs/model_download.log` for progress.

## RunPod setup

1. **Container image**: build and push to Docker Hub, or use the image tag directly.
2. **Docker options**:
   ```
   -p 5901:5901 -p 6901:6901 -p 8000:8000 -p 8585:8585
   -p 8765:8765 -p 9090:9090 -p 9091:9091
   -p 10000:10000/udp
   -p 5000:5000/udp -p 5001:5001/udp
   ```
3. **Volume mount path**: `/workspace/data`
4. **Expose HTTP ports**: `6901,8000,8585,9091,8765`
5. **Expose TCP ports**: `5901,9090`
6. **Expose UDP ports**: `10000,5000,5001`
7. **Environment variables**: `VNC_PW=yourpassword`
8. **Container disk**: minimum 30 GB
9. **Volume disk**: 50+ GB recommended

### On-start script (RunPod)

```bash
env | grep _ >> /etc/environment; echo 'starting up'
/dockerstartup/vnc_startup.sh
sleep infinity
```

## Vast.ai setup

- **Image path/tag**: `your-dockerhub/visomaster:latest`
- **Docker options**:
  ```
  -p 5901:5901 -p 6901:6901 -p 8000:8000 -p 8585:8585
  -p 8765:8765 -p 9090:9090 -p 9091:9091
  -p 10000:10000/udp
  -p 5000:5000/udp -p 5001:5001/udp
  -e VNC_PASSWORDLESS=true -e VNC_RESOLUTION=1280x800
  ```
- **Launch mode**: `Run interactive shell server, SSH` → check `Use direct SSH connection`
- **On-start script**: same as RunPod above

## OBS Studio

OBS is installed from the official `obsproject/obs-studio` PPA. Launch it from the desktop icon or run `obs` in the terminal.

To use VisoMaster's virtual camera output in OBS:
1. Start VisoMaster and enable **Virtual Camera** in the settings panel.
2. Open OBS → Add Source → **Video Capture Device** → select the v4l2loopback device (default `/dev/video10`).

The container runs `--privileged` so `v4l2loopback` can be loaded for the virtual camera. If your host already has the module, you can drop `--privileged` and pass `--device /dev/video10` instead.

## Tailscale and WebRTC UDP

### Why UDP matters for WebRTC

VisoMaster's `streamrelay` uses WebRTC for camera ingestion (Larix, OBS WHIP). WebRTC sends video over **UDP port 10000**. RunPod's HTTP proxy only forwards TCP — raw UDP never reaches your container through the public URL. This is why WebRTC fails on RunPod without extra networking.

### Tailscale modes

Tailscale is pre-installed in the image. It has two modes:

| Mode | How it works | WebRTC UDP | Requires |
|---|---|---|---|
| **Kernel** | Creates a real `tun0` interface via `/dev/net/tun` | ✅ Works | `--privileged` or `NET_ADMIN` + `/dev/net/tun` |
| **Userspace** | Routes all traffic over TCP/WebSocket through DERP relays | ❌ UDP blocked | Nothing extra |

The container already runs `--privileged` (for v4l2loopback). That's all Tailscale kernel mode needs — `/dev/net/tun` is accessible inside a privileged container. The startup script detects this automatically and picks kernel mode.

### Enabling Tailscale

1. Create a free account at [tailscale.com](https://tailscale.com)
2. Generate a reusable ephemeral auth key at [login.tailscale.com/admin/settings/keys](https://login.tailscale.com/admin/settings/keys)
   - Check **Reusable** and **Ephemeral** (auto-expires when the pod stops)
3. Set the env var:

```bash
# docker compose
TAILSCALE_AUTHKEY=tskey-auth-xxxxx docker compose up -d

# docker run
docker run ... -e TAILSCALE_AUTHKEY=tskey-auth-xxxxx visomaster:latest
```

On startup the container logs the Tailscale IP and all service URLs:

```
╔══════════════════════════════════════════════════════════╗
  Tailscale connected
  Mode:            kernel (full UDP — WebRTC works)
  Tailscale IP:    100.x.x.x
  VisoMaster:      http://100.x.x.x:8000
  WS Preview:      ws://100.x.x.x:8765/ws/preview
  WebRTC WHIP:     http://100.x.x.x:9091/whip
  UDP input:       udp://100.x.x.x:5000
  UDP output:      udp://100.x.x.x:5001
  filebrowser:     http://100.x.x.x:8585
  noVNC:           http://100.x.x.x:6901/vnc.html
╚══════════════════════════════════════════════════════════╝
```

Install Tailscale on your PC and join the same tailnet. You can reach the pod directly at its `100.x.x.x` address — no port forwarding, no proxy, full UDP.

### RunPod: confirming kernel mode

On RunPod, `--privileged` pods have `/dev/net/tun` available. Verify after the pod starts:

```bash
ls -la /dev/net/tun
tailscale --socket=/tmp/tailscale.sock status
```

If the logs show `userspace` instead of `kernel`, the pod was not started privileged. In RunPod's template UI make sure `--privileged` is in the Docker options field.

### Tailscale state persistence

The Tailscale state file lives at `/workspace/data/tailscale-state` — inside the persistent volume. The node stays registered across pod restarts without re-authenticating, as long as the auth key is still valid.

## WebRTC streaming (Larix / OBS)

- **WHIP endpoint**: `http://<tailscale-ip>:9091/whip`
- **Browser camera client**: `http://<tailscale-ip>:9091/`

## Logs

All service logs are written to `/workspace/logs/`:

| File | Service |
|---|---|
| `vnc_startup.log` | VNC startup |
| `xfce4.log` | Xfce4 desktop |
| `novnc.log` | noVNC websockify |
| `visomaster_api.log` | FastAPI server |
| `filebrowser.log` | filebrowser |
| `tailscale.log` | Tailscale daemon |
| `model_download.log` | First-run model download |
