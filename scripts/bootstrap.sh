#!/usr/bin/env bash
# =============================================================================
# VisoMaster — Bootstrap Script
# Clones the repo (if not already present) and runs the install script.
#
# Run this on a fresh machine / RunPod instance:
#   bash <(curl -fsSL https://raw.githubusercontent.com/crazidev/VisoMaster/main/scripts/bootstrap.sh)
#
# Or after manually downloading this file:
#   bash bootstrap.sh [--dir <path>] [--branch <branch>] [--dev|--full] [--cuda 124|--cuda 118] [--mode <mode>]
#
# Options:
#   --dir <path>       Where to clone the repo (default: ~/VisoMaster)
#   --branch <branch>  Git branch to clone (default: main)
#   --dev / --full     Model download mode passed to install.sh (default: --dev)
#   --cuda 124|118     CUDA version passed to install.sh (default: 124)
#   --mode <mode>      Launch mode after install: qt, webview, web (default: no auto-launch)
#   --launch           Auto-launch after install using --mode (requires --mode)
# =============================================================================

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
REPO_URL="https://github.com/crazidev/VisoMaster.git"
INSTALL_DIR="${HOME}/VisoMaster"
BRANCH="main"
MODEL_MODE="--dev"
CUDA_VER="124"
LAUNCH_MODE=""
AUTO_LAUNCH=false

# ── Parse arguments ───────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --dir)      INSTALL_DIR="$2"; shift 2 ;;
        --dir=*)    INSTALL_DIR="${1#*=}"; shift ;;
        --branch)   BRANCH="$2"; shift 2 ;;
        --branch=*) BRANCH="${1#*=}"; shift ;;
        --dev)      MODEL_MODE="--dev"; shift ;;
        --full)     MODEL_MODE="--full"; shift ;;
        --cuda)     CUDA_VER="$2"; shift 2 ;;
        --cuda=*)   CUDA_VER="${1#*=}"; shift ;;
        --mode)     LAUNCH_MODE="$2"; shift 2 ;;
        --mode=*)   LAUNCH_MODE="${1#*=}"; shift ;;
        --launch)   AUTO_LAUNCH=true; shift ;;
        -h|--help)
            echo "Usage: bash bootstrap.sh [--dir <path>] [--branch <branch>] [--dev|--full] [--cuda 124|118] [--mode qt|webview|web] [--launch]"
            exit 0 ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

echo ""
echo "============================================================"
echo "  VisoMaster Bootstrap"
echo "  Repo:   $REPO_URL"
echo "  Dir:    $INSTALL_DIR"
echo "  Branch: $BRANCH"
echo "  CUDA:   $CUDA_VER"
echo "  Models: $MODEL_MODE"
echo "============================================================"
echo ""

# ── Step 1: Ensure git is available ──────────────────────────────────────────
if ! command -v git &>/dev/null; then
    echo "[ERROR] git is required. Install it first:"
    echo "        apt-get install -y git   # Debian/Ubuntu"
    echo "        yum install -y git       # RHEL/CentOS"
    exit 1
fi

# ── Step 2: Clone or update the repo ─────────────────────────────────────────
if [[ -d "$INSTALL_DIR/.git" ]]; then
    echo "[1/2] Repo already exists at $INSTALL_DIR — pulling latest changes..."
    git -C "$INSTALL_DIR" fetch origin
    git -C "$INSTALL_DIR" checkout "$BRANCH"
    git -C "$INSTALL_DIR" pull origin "$BRANCH"
    echo "      Done."
else
    echo "[1/2] Cloning VisoMaster into $INSTALL_DIR ..."
    git clone --branch "$BRANCH" --recurse-submodules "$REPO_URL" "$INSTALL_DIR"
    echo "      Done."
fi

cd "$INSTALL_DIR"

// Ensure scripts are executable
chmod +x scripts/*

# ── Step 3: Run install script ────────────────────────────────────────────────
echo "[2/2] Running install script..."
echo ""
bash scripts/install.sh "$MODEL_MODE" --cuda "$CUDA_VER"

# ── Step 4: Auto-launch (optional) ───────────────────────────────────────────
if [[ "$AUTO_LAUNCH" == true ]]; then
    if [[ -z "$LAUNCH_MODE" ]]; then
        echo "[WARN] --launch requires --mode <qt|webview|web>. Skipping auto-launch."
    else
        echo ""
        echo "Launching VisoMaster in '$LAUNCH_MODE' mode..."
        bash scripts/launch.sh --mode "$LAUNCH_MODE"
    fi
else
    echo ""
    echo "============================================================"
    echo "  Bootstrap complete!"
    echo ""
    echo "  cd $INSTALL_DIR"
    echo "  conda activate visomaster"
    echo ""
    echo "  Then launch:"
    echo "    bash scripts/launch.sh --mode webview   # Qt + web UI"
    echo "    bash scripts/launch.sh --mode web       # Headless API + browser"
    echo "    bash scripts/launch.sh --mode qt        # Native Qt UI"
    echo "============================================================"
    echo ""
fi
