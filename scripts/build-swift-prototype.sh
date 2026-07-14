#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PACKAGE_DIR="$ROOT_DIR/swift-native"
BUILD_DIR="${BUILD_DIR:-$ROOT_DIR/build/swift-prototype}"
APP="$BUILD_DIR/MacJMP Swift Prototype.app"

if [[ "$(uname -s)" != "Darwin" ]]; then
    echo "The MacJMP Swift prototype can only be built on macOS." >&2
    exit 1
fi

swift build --package-path "$PACKAGE_DIR" -c release --arch arm64
BIN_DIR="$(swift build --package-path "$PACKAGE_DIR" -c release --arch arm64 --show-bin-path)"

cmake -E rm -rf "$APP"
cmake -E make_directory "$APP/Contents/MacOS" "$APP/Contents/Resources"
cmake -E copy "$BIN_DIR/MacJMPNative" "$APP/Contents/MacOS/MacJMP"
cmake -E copy "$PACKAGE_DIR/AppResources/Info.plist" "$APP/Contents/Info.plist"
cmake -E copy "$ROOT_DIR/bundle/osx/jellyfin.icns" "$APP/Contents/Resources/jellyfin.icns"
chmod +x "$APP/Contents/MacOS/MacJMP"

plutil -lint "$APP/Contents/Info.plist"
codesign --force --deep --sign - --timestamp=none "$APP"

echo "Swift prototype: $APP"
