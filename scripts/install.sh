#!/usr/bin/env bash
# =============================================================================
# VisoMaster — Cross-platform Install Script
# Supports: Linux, macOS, Windows (Git Bash / MSYS2 / WSL)
#
# Usage:
#   bash scripts/install.sh [--dev | --full] [--cuda 124 | --cuda 118]
#
# Modes:
#   --dev   Download only the default models needed for development (default)
#   --full  Download all available models
#
# CUDA versions:
#   --cuda 124  Use CUDA 12.4 requirements (default)
#   --cuda 118  Use CUDA 11.8 requirements (older GPUs)
#
# Conda environment:
#   Creates and uses a conda env named "visomaster" (Python 3.10.13).
#   If conda is not available, falls back to the active Python interpreter.
# =============================================================================

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
MODEL_MODE="dev"
CUDA_VER="124"
CONDA_ENV_NAME="visomaster"
CONDA_PYTHON_VERSION="3.10.13"

# ── Parse arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dev)    MODEL_MODE="dev";  shift ;;
        --full)   MODEL_MODE="full"; shift ;;
        --cuda)   CUDA_VER="$2";     shift 2 ;;
        --cuda=*) CUDA_VER="${1#*=}"; shift ;;
        -h|--help)
            echo "Usage: bash scripts/install.sh [--dev|--full] [--cuda 124|--cuda 118]"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Detect OS ─────────────────────────────────────────────────────────────────
OS="linux"
case "$(uname -s)" in
    Darwin*)              OS="macos" ;;
    MINGW*|MSYS*|CYGWIN*) OS="windows" ;;
esac

# ── Resolve project root ──────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

echo ""
echo "============================================================"
echo "  VisoMaster Installer"
echo "  OS: $OS | CUDA: $CUDA_VER | Models: $MODEL_MODE"
echo "============================================================"
echo ""

# ── Step 1: Conda environment ─────────────────────────────────────────────────
# Locate conda — checks CONDA_EXE, common install paths, and PATH.
find_conda() {
    if [[ -n "${CONDA_EXE:-}" ]] && [[ -x "$CONDA_EXE" ]]; then
        echo "$CONDA_EXE"; return 0
    fi
    local candidates=(
        "$HOME/miniconda3/bin/conda"
        "$HOME/anaconda3/bin/conda"
        "$HOME/miniforge3/bin/conda"
        "/opt/conda/bin/conda"
        "/usr/local/conda/bin/conda"
    )
    for c in "${candidates[@]}"; do
        [[ -x "$c" ]] && { echo "$c"; return 0; }
    done
    command -v conda 2>/dev/null && return 0
    return 1
}

CONDA_BIN=""
if CONDA_BIN=$(find_conda); then
    echo "[1/5] Conda found: $CONDA_BIN"

    # Source conda's shell integration so 'conda activate' works in this script
    CONDA_BASE=$("$CONDA_BIN" info --base 2>/dev/null)
    # shellcheck disable=SC1091
    source "${CONDA_BASE}/etc/profile.d/conda.sh" 2>/dev/null || true

    # Create the env if it doesn't exist yet
    if "$CONDA_BIN" env list | grep -qE "^${CONDA_ENV_NAME}\s"; then
        echo "      Conda env '${CONDA_ENV_NAME}' already exists — skipping creation."
    else
        echo "      Creating conda env '${CONDA_ENV_NAME}' (Python ${CONDA_PYTHON_VERSION})..."
        "$CONDA_BIN" create -n "$CONDA_ENV_NAME" python="$CONDA_PYTHON_VERSION" -y
        echo "      Done."
    fi

    # Install CUDA runtime + cuDNN into the env (CUDA 12.4 only; 11.8 ships its own)
    if [[ "$CUDA_VER" == "124" ]]; then
        echo "      Installing CUDA 12.4 runtime + cuDNN into conda env..."
        "$CONDA_BIN" install -n "$CONDA_ENV_NAME" -c "nvidia/label/cuda-12.4.1" cuda-runtime -y --quiet || true
        "$CONDA_BIN" install -n "$CONDA_ENV_NAME" -c conda-forge cudnn -y --quiet || true
        echo "      Done."
    fi

    # Point PYTHON at the env's interpreter for all subsequent steps
    CONDA_ENV_PREFIX=$("$CONDA_BIN" run -n "$CONDA_ENV_NAME" python -c "import sys; print(sys.prefix)")
    PYTHON="${CONDA_ENV_PREFIX}/bin/python"
    [[ -x "$PYTHON" ]] || PYTHON="${CONDA_ENV_PREFIX}/bin/python3"
    PIP_FLAGS=""

    echo "      Using Python: $PYTHON"
else
    echo "[1/5] Conda not found — falling back to active Python interpreter."
    echo "      To use conda, install Miniconda: https://docs.conda.io/en/latest/miniconda.html"
    echo ""

    # Fallback: use whatever python is on PATH
    if command -v python3 &>/dev/null; then
        PYTHON="python3"
    elif command -v python &>/dev/null; then
        PYTHON="python"
    else
        echo "[ERROR] Python not found. Install Python 3.10+ or conda first."
        exit 1
    fi

    # Need --break-system-packages when running as root outside conda on modern distros
    PIP_FLAGS=""
    if [[ "$EUID" -eq 0 ]] && [[ -z "${CONDA_DEFAULT_ENV:-}" ]]; then
        PIP_FLAGS="--break-system-packages"
    fi
fi

# ── Step 2: Git submodules ────────────────────────────────────────────────────
echo "[2/5] Initializing git submodules..."
if command -v git &>/dev/null; then
    git submodule update --init --recursive
    echo "      Done."
else
    echo "      [WARN] git not found — skipping submodule init."
    echo "             Run 'git submodule update --init --recursive' manually."
fi

# ── Step 3: System dependencies (Linux only) ──────────────────────────────────
if [[ "$OS" == "linux" ]]; then
    echo "[3/6] Installing system dependencies..."
    if command -v apt-get &>/dev/null; then
        apt-get update -qq
        apt-get install -y -qq \
            python3-pip python3-dev ffmpeg \
            libgl1-mesa-glx libglib2.0-0 \
            libxkbcommon0 libdbus-1-3 \
            > /dev/null 2>&1 || true
    elif command -v yum &>/dev/null; then
        yum install -y python3-pip python3-devel ffmpeg mesa-libGL glib2 \
            > /dev/null 2>&1 || true
    fi
    echo "      Done."
elif [[ "$OS" == "macos" ]]; then
    echo "[3/6] Installing system dependencies (macOS)..."
    if command -v brew &>/dev/null; then
        brew install ffmpeg || true
    else
        echo "      [WARN] Homebrew not found. Install ffmpeg manually: https://ffmpeg.org"
    fi
    echo "      Done."
else
    echo "[3/6] Windows detected — skipping system package install."
    echo "      Ensure ffmpeg is available in PATH or in dependencies/."
fi

# ── Step 3: Python dependencies ───────────────────────────────────────────────
REQUIREMENTS="requirements_cu${CUDA_VER}.txt"
if [[ ! -f "$REQUIREMENTS" ]]; then
    echo "[ERROR] Requirements file not found: $REQUIREMENTS"
    echo "        Valid options: requirements_cu124.txt, requirements_cu118.txt"
    exit 1
fi

echo "[4/6] Installing Python dependencies from $REQUIREMENTS..."
$PYTHON -m pip install $PIP_FLAGS --upgrade pip --quiet
$PYTHON -m pip install $PIP_FLAGS -r "$REQUIREMENTS"
echo "      Done."

# ── Helper: install bun ───────────────────────────────────────────────────────
install_bun() {
    echo "      bun not found — installing bun..."

    if [[ "$OS" == "macos" ]] && command -v brew &>/dev/null; then
        brew tap oven-sh/bun
        brew install bun
    elif command -v curl &>/dev/null; then
        if [[ "$OS" == "linux" ]] && command -v apt-get &>/dev/null; then
            apt-get install -y -qq unzip > /dev/null 2>&1 || true
        elif [[ "$OS" == "linux" ]] && command -v yum &>/dev/null; then
            yum install -y unzip > /dev/null 2>&1 || true
        fi
        curl -fsSL https://bun.sh/install | bash
        export BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
        export PATH="$BUN_INSTALL/bin:$PATH"
    else
        echo "      [ERROR] curl is required to install bun automatically."
        echo "              Install bun manually: https://bun.sh/docs/installation"
        return 1
    fi

    if command -v bun &>/dev/null; then
        echo "      bun $(bun --version) installed successfully."
    else
        echo "      [ERROR] bun installation failed. Install manually: https://bun.sh/docs/installation"
        return 1
    fi
}

# ── Step 4: Frontend dependencies ─────────────────────────────────────────────
echo "[5/6] Installing frontend dependencies (visomaster-ui)..."
if [[ -d "visomaster-ui" ]]; then
    if ! command -v bun &>/dev/null; then
        install_bun
    fi

    if command -v bun &>/dev/null; then
        (cd visomaster-ui && bun install && bun run build)
        echo "      Done (bun)."
    elif command -v npm &>/dev/null; then
        echo "      [WARN] Falling back to npm. Install bun for faster installs: https://bun.sh"
        (cd visomaster-ui && npm install && npm run build)
        echo "      Done (npm)."
    else
        echo "      [ERROR] Neither bun nor npm is available. Install bun: https://bun.sh/docs/installation"
        exit 1
    fi
else
    echo "      [SKIP] visomaster-ui directory not found."
fi

# ── Step 5: Download models ───────────────────────────────────────────────────
echo "[6/6] Downloading models (mode: $MODEL_MODE)..."
$PYTHON download_models.py --mode "$MODEL_MODE"
echo "      Done."

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "============================================================"
echo "  Installation complete!"
echo ""
echo "  Copy .env.example to .env and fill in your credentials:"
echo "    cp .env.example .env"
echo ""
if [[ -n "$CONDA_BIN" ]]; then
echo "  Activate the conda environment before launching:"
echo "    conda activate ${CONDA_ENV_NAME}"
echo ""
fi
echo "  Launch VisoMaster:"
echo "    bash scripts/launch.sh --mode qt          # Native Qt UI"
echo "    bash scripts/launch.sh --mode webview     # Qt + embedded web UI"
echo "    bash scripts/launch.sh --mode web         # Web-only (API + browser)"
echo "============================================================"
echo ""
