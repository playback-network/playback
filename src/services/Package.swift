// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "RedactionServices",
    platforms: [
        .macOS(.v13)
    ],
    dependencies: [
        .package(url: "https://github.com/vapor/vapor.git", from: "4.113.2")
    ],
    targets: [
        .executableTarget(
            name: "OCRServer",
            dependencies: [
                .product(name: "Vapor", package: "vapor")
            ],
            path: "Sources",
            sources: ["main.swift"]
        ),
        .executableTarget(
            name: "Eventlogger",
            path: "Sources",
            sources:  ["eventlogger.swift"]
        ),
        .executableTarget(
            name: "StressTest",
            path: "stress",
            sources: ["stress_test.swift"]
        )
    ]
)
