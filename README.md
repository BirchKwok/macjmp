# MacJMP

MacJMP is a macOS-only Jellyfin desktop player. The current application embeds the Jellyfin web client and uses libmpv for broad codec support, direct play, and audio passthrough.

This repository is a macOS-focused refactor of Jellyfin Media Player. Windows, Linux, Raspberry Pi, and OpenELEC are no longer supported build targets. CMake rejects non-macOS hosts, and release builds target native Apple Silicon (`arm64`) on macOS 11 or newer.

## Project status

Two implementations live in this repository:

- **MacJMP (Qt/libmpv):** the usable player and current release path.
- **MacJMP Swift Prototype:** an AppKit/WebKit experiment that establishes a native Swift application shell while libmpv and the native-shell API are migrated incrementally.

The Swift prototype is intentionally labelled as experimental. It can connect to a Jellyfin server and exercise the native app lifecycle, but it does not yet match the Qt/libmpv player's playback capabilities. See [the Swift migration plan](docs/SWIFT_MIGRATION.md).

## Requirements

- Apple Silicon Mac running macOS 11 or newer for the Qt/libmpv app
- CMake, Ninja, Python 3, and pkg-config
- arm64 Qt 5.15 with Qt WebEngine
- Homebrew `mpv` and `sdl3`

Install the non-Qt dependencies with:

```bash
brew install cmake ninja mpv sdl3 pkgconf
```

Homebrew's current Qt 5 formula may not contain Qt WebEngine. Point `QTROOT` at an arm64 Qt 5.15 installation that includes it.

## Build the current player

```bash
QTROOT=/path/to/arm64/Qt/5.15 ./scripts/build-macos-arm64.sh
```

If the complete Qt installation is available at `/opt/homebrew/opt/qt@5`, `QTROOT` can be omitted. The script downloads the bundled web client, builds and bundles dependencies, ad-hoc signs the result, verifies that every Mach-O file is arm64, and creates:

```text
build/output/MacJMP.app
build/macjmp-macos-arm64.zip
```

## Build the Swift prototype

The prototype requires Swift 5.10 or newer and has no third-party package dependencies.

```bash
./scripts/build-swift-prototype.sh
```

The result is `build/swift-prototype/MacJMP Swift Prototype.app`. On first launch, enter the complete HTTP or HTTPS address of a Jellyfin server. You can also pass the address to the executable as its first argument.

## Data locations

- Settings: `~/Library/Application Support/MacJMP/macjmp.conf`
- Logs: `~/Library/Logs/MacJMP/MacJMP.log`
- Optional mpv configuration: `~/Library/Application Support/MacJMP/mpv.conf`

## Web debugger

Start the Qt/libmpv application with `--remote-debugging-port=9222`, then inspect it from Chromium or Chrome at `chrome://inspect/#devices`.

## Lineage and license

MacJMP is derived from Jellyfin Media Player and Plex Media Player. It remains licensed under GPL v2; see [LICENSE](LICENSE). Third-party dependency notices are in `resources/misc/licenses.txt`.
