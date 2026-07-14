#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="${BUILD_DIR:-$ROOT_DIR/build}"
APP="$BUILD_DIR/output/Terminus Player.app"
QTROOT="${QTROOT:-/opt/homebrew/opt/qt@5}"

if [[ "$(uname -m)" != "arm64" ]]; then
    echo "This build must run natively on Apple Silicon (arm64), not through Rosetta." >&2
    exit 1
fi

for command in cmake ninja python3 otool lipo codesign; do
    if ! command -v "$command" >/dev/null; then
        echo "Missing required command: $command" >&2
        exit 1
    fi
done

for dependency in \
    "$QTROOT/lib/QtCore.framework/Versions/5/QtCore" \
    "$QTROOT/lib/QtWebEngine.framework/Versions/5/QtWebEngine" \
    "/opt/homebrew/opt/mpv/lib/libmpv.dylib" \
    "/opt/homebrew/opt/sdl3/lib/libSDL3.0.dylib"; do
    if [[ ! -f "$dependency" ]]; then
        echo "Missing native dependency: $dependency" >&2
        exit 1
    fi
    if [[ "$(lipo -archs "$dependency")" != "arm64" ]]; then
        echo "Dependency is not pure arm64: $dependency" >&2
        exit 1
    fi
done

"$ROOT_DIR/download_webclient.sh"

# Remove the generated bundle before configuring so deleted resources cannot
# survive incremental builds and CMake can regenerate bundle metadata.
cmake -E rm -rf "$BUILD_DIR/src/Terminus Player.app"
cmake -S "$ROOT_DIR" -B "$BUILD_DIR" -GNinja \
    -DQTROOT="$QTROOT" \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX="$BUILD_DIR/output" \
    -DCMAKE_OSX_ARCHITECTURES=arm64 \
    -DCMAKE_OSX_DEPLOYMENT_TARGET=11.0
cmake --build "$BUILD_DIR"
cmake -E rm -rf "$APP"
cmake --install "$BUILD_DIR"

# Homebrew's SDL2 compatibility library loads SDL3 with dlopen(), so
# macdeployqt cannot discover it from the Mach-O dependency table.
cmake -E copy_if_different \
    /opt/homebrew/opt/sdl3/lib/libSDL3.0.dylib \
    "$APP/Contents/Frameworks/libSDL3.0.dylib"
cmake -E rm -f "$APP/Contents/Frameworks/libSDL3.dylib"
cmake -E create_symlink \
    libSDL3.0.dylib "$APP/Contents/Frameworks/libSDL3.dylib"

python3 "$ROOT_DIR/scripts/fix-install-names.py" "$APP"
codesign --force --deep --sign - --timestamp=none "$APP"
python3 "$ROOT_DIR/scripts/verify-macos-arm64.py" "$APP"

ditto -c -k --sequesterRsrc --keepParent \
    "$APP" "$BUILD_DIR/TerminusPlayer-macos-arm64.zip"

echo "Native Apple Silicon app: $APP"
echo "Installable archive: $BUILD_DIR/TerminusPlayer-macos-arm64.zip"
