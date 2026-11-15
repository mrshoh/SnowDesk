import Cocoa

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor {
    NSColor(calibratedRed: r, green: g, blue: b, alpha: a)
}

func render(_ px: Int) -> Data {
    let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: px, pixelsHigh: px, bitsPerSample: 8,
                               samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                               colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let g = NSGraphicsContext(bitmapImageRep: rep)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = g
    let ctx = g.cgContext
    ctx.scaleBy(x: CGFloat(px) / 1024, y: CGFloat(px) / 1024)

    let tile = NSRect(x: 100, y: 100, width: 824, height: 824)
    let bg = NSBezierPath(roundedRect: tile, xRadius: 185, yRadius: 185)
    NSGradient(colors: [rgb(0.10, 0.16, 0.36), rgb(0.22, 0.38, 0.66), rgb(0.55, 0.74, 0.92)])?.draw(in: bg, angle: 270)

    ctx.saveGState()
    bg.addClip()
    NSGradient(colors: [rgb(1, 1, 1, 0.30), rgb(1, 1, 1, 0)])?
        .draw(fromCenter: NSPoint(x: 512, y: 570), radius: 0, toCenter: NSPoint(x: 512, y: 570), radius: 430, options: [])
    let hill = NSBezierPath()
    hill.move(to: NSPoint(x: 100, y: 100))
    hill.line(to: NSPoint(x: 100, y: 235))
    hill.curve(to: NSPoint(x: 924, y: 245), controlPoint1: NSPoint(x: 340, y: 175), controlPoint2: NSPoint(x: 640, y: 305))
    hill.line(to: NSPoint(x: 924, y: 100))
    hill.close()
    NSColor.white.withAlphaComponent(0.93).setFill()
    hill.fill()
    ctx.restoreGState()

    ctx.saveGState()
    ctx.translateBy(x: 512, y: 575)
    ctx.setLineCap(.round)
    for pass in 0..<2 {
        ctx.setStrokeColor(pass == 0 ? rgb(0.62, 0.80, 1, 0.35).cgColor : NSColor.white.cgColor)
        for k in 0..<6 {
            ctx.saveGState()
            ctx.rotate(by: CGFloat(k) * CGFloat.pi / 3)
            ctx.setLineWidth(pass == 0 ? 74 : 34)
            ctx.move(to: .zero)
            ctx.addLine(to: CGPoint(x: 0, y: 265))
            ctx.strokePath()
            ctx.setLineWidth(pass == 0 ? 56 : 24)
            for (y, len) in [(CGFloat(120), CGFloat(95)), (CGFloat(195), CGFloat(65))] {
                ctx.move(to: CGPoint(x: 0, y: y))
                ctx.addLine(to: CGPoint(x: len * 0.866, y: y + len * 0.5))
                ctx.move(to: CGPoint(x: 0, y: y))
                ctx.addLine(to: CGPoint(x: -len * 0.866, y: y + len * 0.5))
            }
            ctx.strokePath()
            ctx.restoreGState()
        }
    }
    ctx.restoreGState()

    NSColor.white.withAlphaComponent(0.85).setFill()
    let dots: [(CGFloat, CGFloat, CGFloat)] = [(220, 760, 14), (800, 800, 12), (170, 560, 9), (860, 520, 10),
                                               (300, 880, 9), (700, 880, 15), (860, 690, 8), (150, 700, 11)]
    for (x, y, r) in dots {
        NSBezierPath(ovalIn: NSRect(x: x - r, y: y - r, width: r * 2, height: r * 2)).fill()
    }
    NSGraphicsContext.restoreGraphicsState()
    return rep.representation(using: .png, properties: [:])!
}

let outDir = CommandLine.arguments[1]
try? FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true)
let sizes: [(String, Int)] = [("icon_16x16", 16), ("icon_16x16@2x", 32), ("icon_32x32", 32), ("icon_32x32@2x", 64),
                              ("icon_128x128", 128), ("icon_128x128@2x", 256), ("icon_256x256", 256),
                              ("icon_256x256@2x", 512), ("icon_512x512", 512), ("icon_512x512@2x", 1024)]
for (name, px) in sizes {
    try! render(px).write(to: URL(fileURLWithPath: "\(outDir)/\(name).png"))
}
print("icon set written")
