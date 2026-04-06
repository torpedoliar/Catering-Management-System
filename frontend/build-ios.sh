#!/bin/bash

# HalloFood iOS Build Script
# Usage:
#   ./build-ios.sh              # Build web + sync
#   ./build-ios.sh --open       # Build web + sync + open Xcode

echo ""
echo "=========================================="
echo "  HalloFood iOS Build Script"
echo "=========================================="
echo ""

# Export NVM if it exists
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

echo "[1/3] Building web assets..."
npm run build
if [ $? -ne 0 ]; then
    echo "ERROR: Web build failed!"
    exit 1
fi
echo "  Web build complete."
echo ""

echo "[2/3] Syncing to iOS..."
npx cap sync ios
if [ $? -ne 0 ]; then
    echo "ERROR: Capacitor sync failed!"
    exit 1
fi
echo "  Sync complete."
echo ""

if [ "$1" == "--open" ]; then
    echo "[3/3] Opening Xcode..."
    npx cap open ios
else
    echo "[3/3] Complete! To test in simulator, run: ./build-ios.sh --open"
    echo "=========================================="
    echo "  SYNC COMPLETE!"
    echo "=========================================="
fi
