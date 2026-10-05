import AppKit
import Foundation

guard CommandLine.arguments.count == 3 else {
    fputs("Uso: generate_app_icons.swift <source.png> <output-dir>\n", stderr)
    exit(2)
}

let sourcePath = CommandLine.arguments[1]
let outputDirectory = CommandLine.arguments[2]

guard let source = NSImage(contentsOfFile: sourcePath) else {
    fputs("Nao foi possivel abrir a imagem-fonte: \(sourcePath)\n", stderr)
    exit(3)
}

let fileManager = FileManager.default
try fileManager.createDirectory(
    atPath: outputDirectory,
    withIntermediateDirectories: true
)

let icons: [(String, Int)] = [
    ("iphone-20@2x.png", 40),
    ("iphone-20@3x.png", 60),
    ("iphone-29@2x.png", 58),
    ("iphone-29@3x.png", 87),
    ("iphone-40@2x.png", 80),
    ("iphone-40@3x.png", 120),
    ("iphone-60@2x.png", 120),
    ("iphone-60@3x.png", 180),
    ("ipad-20@1x.png", 20),
    ("ipad-20@2x.png", 40),
    ("ipad-29@1x.png", 29),
    ("ipad-29@2x.png", 58),
    ("ipad-40@1x.png", 40),
    ("ipad-40@2x.png", 80),
    ("ipad-76@1x.png", 76),
    ("ipad-76@2x.png", 152),
    ("ipad-83.5@2x.png", 167),
    ("appstore-1024.png", 1024),
]

func generateIcon(filename: String, pixels: Int) throws {
    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: pixels,
        pixelsHigh: pixels,
        bitsPerSample: 8,
        samplesPerPixel: 3,
        hasAlpha: false,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 24
    ) else {
        throw NSError(
            domain: "VendaMaisIconGenerator",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Falha ao criar bitmap \(pixels)x\(pixels)"]
        )
    }

    bitmap.size = NSSize(width: pixels, height: pixels)

    NSGraphicsContext.saveGraphicsState()
    defer { NSGraphicsContext.restoreGraphicsState() }

    guard let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        throw NSError(
            domain: "VendaMaisIconGenerator",
            code: 2,
            userInfo: [NSLocalizedDescriptionKey: "Falha ao criar contexto grafico"]
        )
    }

    NSGraphicsContext.current = context
    context.imageInterpolation = .high

    let bounds = NSRect(x: 0, y: 0, width: pixels, height: pixels)
    NSColor(
        calibratedRed: 41.0 / 255.0,
        green: 196.0 / 255.0,
        blue: 90.0 / 255.0,
        alpha: 1.0
    ).setFill()
    bounds.fill()

    source.draw(
        in: bounds,
        from: .zero,
        operation: .sourceOver,
        fraction: 1.0,
        respectFlipped: true,
        hints: [.interpolation: NSImageInterpolation.high.rawValue]
    )

    guard let png = bitmap.representation(using: .png, properties: [:]) else {
        throw NSError(
            domain: "VendaMaisIconGenerator",
            code: 3,
            userInfo: [NSLocalizedDescriptionKey: "Falha ao codificar PNG"]
        )
    }

    let destination = URL(fileURLWithPath: outputDirectory)
        .appendingPathComponent(filename)
    try png.write(to: destination, options: .atomic)
}

for (filename, pixels) in icons {
    try generateIcon(filename: filename, pixels: pixels)
}

print("App Icons iOS gerados em \(outputDirectory)")
