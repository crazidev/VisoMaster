#!/usr/bin/env bash
# =============================================================================
# fix_submodules.sh — initialise and update all git submodules
#
# Run this if you cloned without --recurse-submodules and
# packages/streamrelay is empty.
#
# Usage:
#   bash scripts/fix_submodules.sh
# =============================================================================
set -euo pipefail

echo "[submodules] Initialising and updating all submodules..."

git submodule sync --recursive
git submodule update --init --recursive

echo ""
echo "[submodules] Done. Submodule status:"
git submodule status
