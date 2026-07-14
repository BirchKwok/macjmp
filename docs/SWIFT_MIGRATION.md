# Swift migration

MacJMP keeps the proven Qt/libmpv client as the shipping implementation while the native macOS replacement is developed in `swift-native/`.

## Current prototype

The prototype is a dependency-free Swift Package using AppKit and WebKit. It already validates:

- a native macOS application lifecycle and menu bar;
- persistent Jellyfin server selection;
- HTTP/HTTPS and local-network access;
- navigation, reload, full-screen, and new-window handling;
- an arm64 `.app` bundle assembled by `scripts/build-swift-prototype.sh`.

It currently uses WebKit's media engine. It does **not** yet provide feature parity with the Qt/libmpv client, including broad codec direct play, audio passthrough, mpv configuration, Jellyfin native-shell APIs, or display refresh-rate matching.

## Recommended migration sequence

1. Define a typed Swift bridge for the native-shell API documented in `client-api.md`.
2. Embed libmpv through a small C module target and render through a Metal-compatible `NSView`.
3. Route Jellyfin playback commands from `WKScriptMessageHandler` to the Swift player service.
4. Port media keys, sleep prevention, display-mode switching, and settings to macOS frameworks.
5. Add playback integration tests and compare the device profile with `native/nativeshell.js`.
6. Make the Swift target the release application only after playback and settings parity is measured.

This staged approach keeps the repository usable while making the rewrite testable in small, reversible steps.
