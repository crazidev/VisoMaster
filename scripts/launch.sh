#!/usr/bin/env bash
# =============================================================================
# VisoMaster — Cross-platform Launch Script
# Supports: Linux, macOS, Windows (Git Bash / MSYS2 / WSL)
#
# Usage:
#   bash scripts/launch.sh [--mode <mode>] [-- <extra args>]
#
# Modes:
#   qt        Native Qt desktop UI (main.py)                        [default]
#   webview   Native Qt window with embedded web UI (web_main.py)
#   web       Headless API server + React frontend in browser
#
# Extra args are forwarded to the Python entry point (webview mode only):
#   bash scripts/launch.sh --mode webview -- --skip-workspace
#   bash scripts/launch.sh --mode webview -- --workspace path/to/ws.json
# =============================================================================

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
MODE="qt"
EXTRA_ARGS=()

# ── Parse arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --mode)   MODE="$2"; shift 2 ;;
        --mode=*) MODE="${1#*=}"; shift ;;
        --)       shift; EXTRA_ARGS=("$@"); break ;;
        -h|--help)
            echo "Usage: bash scripts/launch.sh [--mode qt|webview|web] [-- <extra args>]"
            echo ""
            echo "Modes:"
            echo "  qt        Native Qt desktop UI (default)"
            echo "  webview   Qt window with embedded React web UI"
            echo "  web       Headless API server + React frontend in browser"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Resolve project root ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# ── Detect Python ─────────────────────────────────────────────────────────────
if command -v python3 &>/dev/null; then
    PYTHON="python3"
elif command -v python &>/dev/null; then
    PYTHON="python"
else
    echo "[ERROR] Python not found. Activate your conda environment first."
    exit 1
fi

# ── Load .env if present ──────────────────────────────────────────────────────
if [[ -f ".env" ]]; then
    set -o allexport
    # shellcheck disable=SC1091
    source .env
    set +o allexport
fi

# ── Detect OS for PATH additions ──────────────────────────────────────────────
case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
        # Add bundled dependencies to PATH on Windows
        if [[ -d "dependencies" ]]; then
            export PATH="$PROJECT_ROOT/dependencies:$PATH"
        fi ;;
esac

# ── Helper: free a TCP port ───────────────────────────────────────────────────
free_port() {
    local port="$1"
    if command -v fuser &>/dev/null; then
        fuser -k "${port}/tcp" 2>/dev/null || true
    elif command -v lsof &>/dev/null; then
        local pids
        pids=$(lsof -ti:"${port}" 2>/dev/null) || true
        [[ -n "$pids" ]] && kill -9 $pids 2>/dev/null || true
    fi
}

echo ""
echo "============================================================"
echo "  VisoMaster — mode: $MODE"
echo "============================================================"
echo ""

case "$MODE" in
    # ── Mode 1: Native Qt UI ─────────────────────────────────────────────────
    qt)
        echo "  Starting native Qt UI..."
        exec $PYTHON main.py "${EXTRA_ARGS[@]}"
        ;;

    # ── Mode 2: Qt + embedded web UI ─────────────────────────────────────────
    webview)
        echo "  Starting Qt + WebView UI..."
        echo ""

        VITE_PORT="${VITE_PORT:-5173}"
        UI_PID=""

        # Free the port before starting Vite
        free_port "$VITE_PORT"

        # Trap to kill background Vite process on exit
        cleanup_webview() {
            [[ -n "${UI_PID:-}" ]] && kill "$UI_PID" 2>/dev/null || true
            wait 2>/dev/null || true
        }
        trap cleanup_webview EXIT INT TERM

        # Helper: wait for Vite to be ready (up to 30 s)
        wait_for_vite() {
            local port="$1"
            local retries=30
            echo "  Waiting for Vite on port ${port}..."
            for ((i=1; i<=retries; i++)); do
                if command -v curl &>/dev/null; then
                    curl -sf "http://localhost:${port}" > /dev/null 2>&1 && return 0
                elif command -v wget &>/dev/null; then
                    wget -q --spider "http://localhost:${port}" > /dev/null 2>&1 && return 0
                else
                    # No curl/wget — just sleep and hope
                    sleep 3; return 0
                fi
                sleep 1
            done
            echo "  [WARN] Vite did not respond after ${retries}s — continuing anyway."
        }

        # Use built dist if available, otherwise start dev server
        if [[ -d "visomaster-ui/dist" ]]; then
            echo "  [1/2] Built dist found — starting Vite preview server..."
            if command -v bun &>/dev/null; then
                (cd visomaster-ui && bun run preview --port "$VITE_PORT") &
            elif command -v npm &>/dev/null; then
                (cd visomaster-ui && npm run preview -- --port "$VITE_PORT") &
            else
                echo "  [ERROR] bun or npm required. Install bun: https://bun.sh"
                exit 1
            fi
            UI_PID=$!
            wait_for_vite "$VITE_PORT"
        else
            echo "  [1/2] No dist build found — starting Vite dev server..."
            if command -v bun &>/dev/null; then
                (cd visomaster-ui && bun run dev --port "$VITE_PORT") &
            elif command -v npm &>/dev/null; then
                (cd visomaster-ui && npm run dev -- --port "$VITE_PORT") &
            else
                echo "  [ERROR] bun or npm required. Install bun: https://bun.sh"
                exit 1
            fi
            UI_PID=$!
            wait_for_vite "$VITE_PORT"
        fi

        echo "  [2/2] Starting Qt WebView..."
        echo ""
        exec $PYTHON web_main.py "${EXTRA_ARGS[@]}"
        ;;

    # ── Mode 3: Web-only (API server + React frontend) ────────────────────────
    web)
        echo "  Starting web-only mode (API server + React frontend)..."
        echo ""

        # Trap to kill background processes on exit
        cleanup() {
            echo ""
            echo "  Shutting down..."
            [[ -n "${API_PID:-}" ]] && kill "$API_PID" 2>/dev/null || true
            [[ -n "${UI_PID:-}" ]]  && kill "$UI_PID"  2>/dev/null || true
            wait 2>/dev/null || true
        }
        trap cleanup EXIT INT TERM

        # Start API server in background
        echo "  [1/2] Starting FastAPI server on http://localhost:8000 ..."
        $PYTHON -m app.api.server &
        API_PID=$!

        # Wait briefly for the server to be ready
        sleep 2

        # Use built dist if available, otherwise fall back to dev server
        VITE_PORT="${VITE_PORT:-5173}"
        free_port "$VITE_PORT"
        if [[ -d "visomaster-ui/dist" ]]; then
            echo "  [2/2] Built dist found — starting Vite preview server..."
            if command -v bun &>/dev/null; then
                (cd visomaster-ui && bun run preview --port "$VITE_PORT") &
            elif command -v npm &>/dev/null; then
                (cd visomaster-ui && npm run preview -- --port "$VITE_PORT") &
            else
                echo "  [ERROR] bun or npm required. Install bun: https://bun.sh"
                exit 1
            fi
        else
            echo "  [2/2] No dist build found — starting Vite dev server..."
            if command -v bun &>/dev/null; then
                (cd visomaster-ui && bun run dev) &
            elif command -v npm &>/dev/null; then
                (cd visomaster-ui && npm run dev) &
            else
                echo "  [ERROR] bun or npm required. Install bun: https://bun.sh"
                exit 1
            fi
        fi
        UI_PID=$!

        echo ""
        echo "  ✓ API server:  http://localhost:8000"
        echo "  ✓ Web UI:      http://localhost:5173"
        echo ""
        echo "  Press Ctrl+C to stop both servers."
        echo ""

        # Wait for either process to exit
        wait -n "$API_PID" "$UI_PID" 2>/dev/null || wait
        ;;

    *)
        echo "[ERROR] Unknown mode: $MODE"
        echo "        Valid modes: qt, webview, web"
        exit 1
        ;;
esac
