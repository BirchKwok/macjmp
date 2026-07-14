// swift-tools-version: 5.10

import PackageDescription

let package = Package(
    name: "MacJMPNative",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "MacJMPNative", targets: ["MacJMPNative"])
    ],
    targets: [
        .executableTarget(
            name: "MacJMPNative",
            path: "Sources/MacJMPNative"
        )
    ]
)
