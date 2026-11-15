// SnowDesk v2 — six weather effects, window-aware landing, pointer interaction,
// procedural wallpapers, power saving. Original code and art.
import Cocoa
import SpriteKit
import QuartzCore
import IOKit.ps
import ApplicationServices
import ServiceManagement

// MARK: - Utilities

struct SplitMix64: RandomNumberGenerator {
    var state: UInt64
    mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
}

func rnd(_ a: CGFloat, _ b: CGFloat) -> CGFloat {
    a <= b ? CGFloat.random(in: a...b) : CGFloat.random(in: b...a)
}

func rgb(_ r: CGFloat, _ g: CGFloat, _ b: CGFloat, _ a: CGFloat = 1) -> NSColor {
    NSColor(calibratedRed: r, green: g, blue: b, alpha: a)
}

enum Effect: String, CaseIterable {
    case snow, rain, sakura, leaves, fireflies, starfall
    var title: String {
        switch self {
        case .snow: return "Snow"
        case .rain: return "Rain"
        case .sakura: return "Sakura"
        case .leaves: return "Leaves"
        case .fireflies: return "Fireflies"
        case .starfall: return "Starfall"
        }
    }
    var symbol: String {
        switch self {
        case .snow: return "snowflake"
        case .rain: return "cloud.rain"
        case .sakura: return "camera.macro"
        case .leaves: return "leaf"
        case .fireflies: return "sparkle"
        case .starfall: return "moon.stars"
        }
    }
}

enum Intensity: String, CaseIterable {
    case light, normal, heavy
    var title: String { rawValue.capitalized }
    var factor: CGFloat {
        switch self {
        case .light: return 0.5
        case .normal: return 1.0
        case .heavy: return 1.7
        }
    }
}

// MARK: - Textures (all drawn in code)

enum Tex {
    static func make(_ w: CGFloat, _ h: CGFloat, _ draw: @escaping (NSRect) -> Void) -> SKTexture {
        let img = NSImage(size: NSSize(width: w, height: h), flipped: false) { rect in
            draw(rect)
            return true
        }
        return SKTexture(image: img)
    }

    static let dot: SKTexture = make(32, 32) { r in
        NSGradient(colorsAndLocations: (NSColor.white, 0.0),
                   (NSColor.white.withAlphaComponent(0.9), 0.45),
                   (NSColor.white.withAlphaComponent(0.0), 1.0))?
            .draw(in: NSBezierPath(ovalIn: r), relativeCenterPosition: .zero)
    }

    static let glow: SKTexture = make(64, 64) { r in
        NSGradient(colorsAndLocations: (NSColor.white, 0.0),
                   (NSColor.white.withAlphaComponent(0.35), 0.3),
                   (NSColor.white.withAlphaComponent(0.0), 1.0))?
            .draw(in: NSBezierPath(ovalIn: r), relativeCenterPosition: .zero)
    }

    static let streak: SKTexture = make(4, 48) { _ in
        let path = NSBezierPath(roundedRect: NSRect(x: 1, y: 0, width: 2, height: 48), xRadius: 1, yRadius: 1)
        NSGradient(starting: NSColor.white, ending: NSColor.white.withAlphaComponent(0))?.draw(in: path, angle: 90)
    }

    static let trail: SKTexture = make(160, 8) { _ in
        let path = NSBezierPath(roundedRect: NSRect(x: 0, y: 2, width: 160, height: 4), xRadius: 2, yRadius: 2)
        NSGradient(colorsAndLocations: (NSColor.white.withAlphaComponent(0), 0.0),
                   (NSColor.white.withAlphaComponent(0.55), 0.8),
                   (NSColor.white, 1.0))?.draw(in: path, angle: 0)
    }

    static let petal: SKTexture = make(18, 22) { _ in
        let p = NSBezierPath()
        p.move(to: NSPoint(x: 9, y: 1))
        p.curve(to: NSPoint(x: 9, y: 19), controlPoint1: NSPoint(x: -3, y: 6), controlPoint2: NSPoint(x: 0, y: 24))
        p.curve(to: NSPoint(x: 9, y: 1), controlPoint1: NSPoint(x: 18, y: 24), controlPoint2: NSPoint(x: 21, y: 6))
        NSGradient(starting: rgb(1, 0.62, 0.76), ending: rgb(1, 0.84, 0.90))?.draw(in: p, angle: 90)
    }

    static let leaf: SKTexture = make(22, 28) { _ in
        let p = NSBezierPath()
        p.move(to: NSPoint(x: 11, y: 0))
        p.curve(to: NSPoint(x: 11, y: 26), controlPoint1: NSPoint(x: -7, y: 8), controlPoint2: NSPoint(x: 1, y: 23))
        p.curve(to: NSPoint(x: 11, y: 0), controlPoint1: NSPoint(x: 21, y: 23), controlPoint2: NSPoint(x: 29, y: 8))
        NSColor.white.setFill()
        p.fill()
        let vein = NSBezierPath()
        vein.move(to: NSPoint(x: 11, y: 0))
        vein.line(to: NSPoint(x: 11, y: 22))
        vein.lineWidth = 1
        NSColor(white: 0.7, alpha: 1).setStroke()
        vein.stroke()
    }

    static let ring: SKTexture = make(32, 32) { r in
        let p = NSBezierPath(ovalIn: r.insetBy(dx: 3, dy: 3))
        p.lineWidth = 2
        NSColor.white.setStroke()
        p.stroke()
    }

    static let snowFill: SKTexture = make(4, 40) { r in
        NSGradient(starting: rgb(1, 1, 1), ending: rgb(0.74, 0.84, 0.95))?.draw(in: r, angle: 270)
    }

    static let bokeh: SKTexture = make(64, 64) { r in
        NSGradient(colorsAndLocations: (NSColor.white.withAlphaComponent(0.55), 0.0),
                   (NSColor.white.withAlphaComponent(0.5), 0.65),
                   (NSColor.white.withAlphaComponent(0.0), 1.0))?
            .draw(in: NSBezierPath(ovalIn: r), relativeCenterPosition: .zero)
    }

    static let puff: SKTexture = make(48, 48) { _ in
        var g = SplitMix64(state: 99)
        for _ in 0..<8 {
            let cx = CGFloat.random(in: 14...34, using: &g)
            let cy = CGFloat.random(in: 14...34, using: &g)
            let rad = CGFloat.random(in: 7...13, using: &g)
            let rect = NSRect(x: cx - rad, y: cy - rad, width: rad * 2, height: rad * 2)
            NSGradient(colorsAndLocations: (NSColor.white.withAlphaComponent(0.9), 0.0),
                       (NSColor.white.withAlphaComponent(0.55), 0.55),
                       (NSColor.white.withAlphaComponent(0.0), 1.0))?
                .draw(in: NSBezierPath(ovalIn: rect), relativeCenterPosition: .zero)
        }
    }

    // six-fold snow crystals
    static func crystal(_ variant: Int) -> SKTexture {
        make(64, 64) { _ in
            guard let ctx = NSGraphicsContext.current?.cgContext else { return }
            ctx.translateBy(x: 32, y: 32)
            ctx.setLineCap(.round)
            ctx.setLineJoin(.round)
            for pass in 0..<2 {
                let halo = pass == 0
                ctx.setStrokeColor(halo ? rgb(0.72, 0.86, 1, 0.38).cgColor : NSColor.white.cgColor)
                ctx.setLineWidth(halo ? 5 : (variant == 2 ? 2.6 : 1.7))
                for k in 0..<6 {
                    ctx.saveGState()
                    ctx.rotate(by: CGFloat(k) * CGFloat.pi / 3)
                    ctx.move(to: .zero)
                    ctx.addLine(to: CGPoint(x: 0, y: 27))
                    let branches: [(CGFloat, CGFloat)] = variant == 0 ? [(10, 9), (17, 8), (23, 5)]
                        : (variant == 1 ? [(14, 8)] : [(18, 7)])
                    for (y, len) in branches {
                        ctx.move(to: CGPoint(x: 0, y: y))
                        ctx.addLine(to: CGPoint(x: len * 0.866, y: y + len * 0.5))
                        ctx.move(to: CGPoint(x: 0, y: y))
                        ctx.addLine(to: CGPoint(x: -len * 0.866, y: y + len * 0.5))
                    }
                    ctx.strokePath()
                    ctx.restoreGState()
                }
                if variant == 1 {
                    ctx.beginPath()
                    for k in 0..<6 {
                        let a = CGFloat(k) * CGFloat.pi / 3 + CGFloat.pi / 6
                        let pt = CGPoint(x: cos(a) * 10, y: sin(a) * 10)
                        if k == 0 { ctx.move(to: pt) } else { ctx.addLine(to: pt) }
                    }
                    ctx.closePath()
                    ctx.strokePath()
                }
            }
        }
    }

    static let crystals: [SKTexture] = [Tex.crystal(0), Tex.crystal(1), Tex.crystal(2)]

    // sakura: (base colour, edge colour)
    static let sakuraPalettes: [(NSColor, NSColor)] = [
        (rgb(1.00, 0.78, 0.86), rgb(1.00, 0.93, 0.96)),   // pale
        (rgb(0.98, 0.62, 0.76), rgb(1.00, 0.85, 0.91)),   // classic pink
        (rgb(0.92, 0.42, 0.62), rgb(1.00, 0.75, 0.85)),   // deep pink
        (rgb(0.98, 0.85, 0.90), rgb(1.00, 0.98, 0.99)),   // white blush
        (rgb(1.00, 0.70, 0.72), rgb(1.00, 0.90, 0.88))    // warm peach pink
    ]
    static var sakuraCache: [Int: SKTexture] = [:]

    private static func petalPath(w: CGFloat, h: CGFloat, notch: CGFloat) -> NSBezierPath {
        let p = NSBezierPath()
        p.move(to: NSPoint(x: 0, y: 0))
        p.curve(to: NSPoint(x: 0, y: h - notch),
                controlPoint1: NSPoint(x: -w * 0.95, y: h * 0.22),
                controlPoint2: NSPoint(x: -w * 0.8, y: h * 1.02))
        p.curve(to: NSPoint(x: 0, y: 0),
                controlPoint1: NSPoint(x: w * 0.8, y: h * 1.02),
                controlPoint2: NSPoint(x: w * 0.95, y: h * 0.22))
        p.close()
        return p
    }

    private static func place(_ p: NSBezierPath, x: CGFloat, y: CGFloat, degrees: CGFloat) -> NSBezierPath {
        let q = p.copy() as! NSBezierPath
        var tf = AffineTransform()
        tf.translate(x: x, y: y)
        tf.rotate(byDegrees: degrees)
        q.transform(using: tf)
        return q
    }

    // 0 wide petal, 1 narrow petal, 2 whole blossom, 3 curled petal
    static func sakuraTex(shape: Int, palette: Int) -> SKTexture {
        let key = shape * 10 + palette
        if let cached = sakuraCache[key] { return cached }
        let pal = sakuraPalettes[palette]
        let deep = rgb(0.85, 0.30, 0.50)
        let tex = make(64, 64) { _ in
            switch shape {
            case 0, 1:
                let wide = shape == 0
                let h: CGFloat = wide ? 48 : 52
                let q = place(petalPath(w: wide ? 24 : 17, h: h, notch: wide ? 6 : 3), x: 32, y: 6, degrees: 0)
                NSGradient(starting: pal.0, ending: pal.1)?.draw(in: q, angle: 90)
                pal.0.withAlphaComponent(0.6).setStroke()
                q.lineWidth = 1
                q.stroke()
                let v = NSBezierPath()
                v.move(to: NSPoint(x: 32, y: 8))
                v.line(to: NSPoint(x: 32, y: 6 + h * 0.8))
                v.move(to: NSPoint(x: 32, y: 8))
                v.line(to: NSPoint(x: 26, y: 6 + h * 0.72))
                v.move(to: NSPoint(x: 32, y: 8))
                v.line(to: NSPoint(x: 38, y: 6 + h * 0.72))
                v.lineWidth = 0.8
                deep.withAlphaComponent(0.3).setStroke()
                v.stroke()
            case 2:
                for k in 0..<5 {
                    let deg = CGFloat(k) * 72
                    let q = place(petalPath(w: 14, h: 28, notch: 4), x: 32, y: 32, degrees: deg)
                    NSGradient(starting: pal.0, ending: pal.1)?.draw(in: q, angle: 90 + deg)
                    pal.0.withAlphaComponent(0.65).setStroke()
                    q.lineWidth = 1
                    q.stroke()
                }
                deep.withAlphaComponent(0.55).setFill()
                NSBezierPath(ovalIn: NSRect(x: 28, y: 28, width: 8, height: 8)).fill()
                for k in 0..<9 {
                    let a = CGFloat(k) * 2 * CGFloat.pi / 9 + 0.3
                    let tip = NSPoint(x: 32 + 8 * cos(a), y: 32 + 8 * sin(a))
                    let st = NSBezierPath()
                    st.move(to: NSPoint(x: 32, y: 32))
                    st.line(to: tip)
                    st.lineWidth = 0.8
                    deep.withAlphaComponent(0.8).setStroke()
                    st.stroke()
                    rgb(0.98, 0.85, 0.35).setFill()
                    NSBezierPath(ovalIn: NSRect(x: tip.x - 1.2, y: tip.y - 1.2, width: 2.4, height: 2.4)).fill()
                }
            default:
                let q = place(petalPath(w: 18, h: 46, notch: 5), x: 32, y: 8, degrees: 12)
                NSGradient(starting: pal.0, ending: pal.1)?.draw(in: q, angle: 102)
                let hl = place(petalPath(w: 7, h: 38, notch: 0), x: 36, y: 10, degrees: 12)
                NSColor.white.withAlphaComponent(0.35).setFill()
                hl.fill()
                let sh = place(petalPath(w: 6, h: 36, notch: 0), x: 27, y: 10, degrees: 12)
                deep.withAlphaComponent(0.22).setFill()
                sh.fill()
                pal.0.withAlphaComponent(0.6).setStroke()
                q.lineWidth = 1
                q.stroke()
            }
        }
        sakuraCache[key] = tex
        return tex
    }

    // (stem-end colour, tip colour, edge/vein colour)
    static let leafPalettes: [(NSColor, NSColor, NSColor)] = [
        (rgb(0.55, 0.08, 0.06), rgb(0.88, 0.20, 0.10), rgb(0.35, 0.04, 0.04)),   // deep red
        (rgb(0.85, 0.35, 0.05), rgb(0.98, 0.60, 0.15), rgb(0.55, 0.20, 0.03)),   // orange
        (rgb(0.90, 0.65, 0.10), rgb(1.00, 0.88, 0.30), rgb(0.60, 0.40, 0.05)),   // golden yellow
        (rgb(0.40, 0.22, 0.10), rgb(0.65, 0.40, 0.18), rgb(0.25, 0.13, 0.05)),   // brown
        (rgb(0.45, 0.55, 0.12), rgb(0.90, 0.55, 0.10), rgb(0.28, 0.32, 0.06)),   // green turning orange
        (rgb(0.70, 0.15, 0.10), rgb(0.95, 0.70, 0.15), rgb(0.42, 0.08, 0.05))    // red to yellow
    ]
    static var leafCache: [Int: SKTexture] = [:]

    static func leafTex(shape: Int, palette: Int) -> SKTexture {
        let key = shape * 10 + palette
        if let cached = leafCache[key] { return cached }
        let pal = leafPalettes[palette]
        let tex = make(64, 64) { _ in
            let (path, veins) = Tex.leafOutline(shape)
            let stem = NSBezierPath()
            stem.move(to: NSPoint(x: 32, y: 1))
            stem.line(to: NSPoint(x: 32, y: 13))
            stem.lineWidth = 2.4
            stem.lineCapStyle = .round
            rgb(0.35, 0.22, 0.10).setStroke()
            stem.stroke()
            NSGradient(starting: pal.0, ending: pal.1)?.draw(in: path, angle: 90)
            pal.2.withAlphaComponent(0.8).setStroke()
            path.lineWidth = 1.3
            path.lineJoinStyle = .round
            path.stroke()
            veins.lineWidth = 1
            pal.2.withAlphaComponent(0.45).setStroke()
            veins.stroke()
        }
        leafCache[key] = tex
        return tex
    }

    private static func profile(_ y0: CGFloat, _ y1: CGFloat, _ steps: Int, _ hw: (CGFloat) -> CGFloat) -> NSBezierPath {
        let p = NSBezierPath()
        p.move(to: NSPoint(x: 32, y: y0))
        for i in 1...steps {
            let u = CGFloat(i) / CGFloat(steps)
            p.line(to: NSPoint(x: 32 + hw(u), y: y0 + (y1 - y0) * u))
        }
        for i in stride(from: steps - 1, through: 1, by: -1) {
            let u = CGFloat(i) / CGFloat(steps)
            p.line(to: NSPoint(x: 32 - hw(u), y: y0 + (y1 - y0) * u))
        }
        p.close()
        return p
    }

    private static func sideVeins(_ y0: CGFloat, _ y1: CGFloat, _ hw: (CGFloat) -> CGFloat) -> NSBezierPath {
        let v = NSBezierPath()
        v.move(to: NSPoint(x: 32, y: y0))
        v.line(to: NSPoint(x: 32, y: y1 - 3))
        for u in [CGFloat(0.2), 0.35, 0.5, 0.65, 0.8] {
            let y = y0 + (y1 - y0) * u
            let w = hw(u) * 0.8
            let yy = y + (y1 - y0) * 0.1
            v.move(to: NSPoint(x: 32, y: y))
            v.line(to: NSPoint(x: 32 + w, y: yy))
            v.move(to: NSPoint(x: 32, y: y))
            v.line(to: NSPoint(x: 32 - w, y: yy))
        }
        return v
    }

    // 0 maple, 1 oak, 2 birch, 3 ginkgo, 4 round (aspen), 5 narrow (willow)
    private static func leafOutline(_ shape: Int) -> (NSBezierPath, NSBezierPath) {
        switch shape {
        case 0:
            let pts: [(CGFloat, CGFloat)] = [(32, 10), (38, 15), (48, 9), (45, 22), (59, 28),
                                             (49, 35), (53, 47), (42, 44), (38, 51), (32, 61)]
            let p = NSBezierPath()
            p.move(to: NSPoint(x: 32, y: 10))
            for q in pts.dropFirst() { p.line(to: NSPoint(x: q.0, y: q.1)) }
            for q in pts.dropLast().reversed() { p.line(to: NSPoint(x: 64 - q.0, y: q.1)) }
            p.close()
            let v = NSBezierPath()
            let tips: [(CGFloat, CGFloat)] = [(46, 12), (57, 28), (52, 45), (32, 58)]
            for t in tips {
                v.move(to: NSPoint(x: 32, y: 12))
                v.line(to: NSPoint(x: t.0, y: t.1))
                v.move(to: NSPoint(x: 32, y: 12))
                v.line(to: NSPoint(x: 64 - t.0, y: t.1))
            }
            return (p, v)
        case 1:
            let hw: (CGFloat) -> CGFloat = { u in
                15 * pow(sin(u * CGFloat.pi), 0.7) * (1 + 0.28 * sin(u * CGFloat.pi * 8))
            }
            return (profile(10, 58, 64, hw), sideVeins(10, 58, hw))
        case 2:
            let hw: (CGFloat) -> CGFloat = { u in
                15 * pow(sin(u * CGFloat.pi), 0.8) * (1 - 0.3 * u) * (1 + 0.05 * sin(u * CGFloat.pi * 36))
            }
            return (profile(10, 60, 64, hw), sideVeins(10, 60, hw))
        case 3:
            let p = NSBezierPath()
            p.move(to: NSPoint(x: 32, y: 8))
            var a: CGFloat = -60
            while a <= 60 {
                let rad = a * CGFloat.pi / 180
                var r: CGFloat = 34 + 1.5 * sin(a * 0.6)
                if abs(a) < 5 { r -= 9 }
                p.line(to: NSPoint(x: 32 + r * sin(rad), y: 8 + r * cos(rad)))
                a += 4
            }
            p.close()
            let v = NSBezierPath()
            for deg in stride(from: CGFloat(-50), through: 50, by: 20) {
                let rad = deg * CGFloat.pi / 180
                v.move(to: NSPoint(x: 32, y: 10))
                v.line(to: NSPoint(x: 32 + 30 * sin(rad), y: 10 + 30 * cos(rad)))
            }
            return (p, v)
        case 4:
            let hw: (CGFloat) -> CGFloat = { u in 17 * pow(sin(u * CGFloat.pi), 0.55) }
            return (profile(10, 56, 64, hw), sideVeins(10, 56, hw))
        default:
            let hw: (CGFloat) -> CGFloat = { u in 8 * pow(sin(u * CGFloat.pi), 0.9) }
            return (profile(6, 60, 64, hw), sideVeins(6, 60, hw))
        }
    }
}

// MARK: - Particle model

struct Surface {
    let id: Int
    let rect: CGRect       // scene coordinates, bottom-left origin
}

final class Particle {
    enum Kind { case main, spark, meteor }
    let node: SKSpriteNode
    var kind: Kind = .main
    var dead = false
    var vel = CGVector.zero
    var age: CGFloat = 0
    var life: CGFloat = 1_000_000
    var baseAlpha: CGFloat = 1
    var phase = CGFloat.random(in: 0...(2 * CGFloat.pi))
    var rock: CGFloat = 0
    var swayAmp: CGFloat = 0
    var swayFreq: CGFloat = 1
    var fall: CGFloat = 50
    // resting on a surface
    var resting = false
    var surfaceID = 0
    var relX: CGFloat = 0
    var restH: CGFloat = 0
    var restTime: CGFloat = 0
    var restLife: CGFloat = 90
    // fireflies
    var curiosity: CGFloat = 1
    var orbit: CGFloat = 40
    var heading = CGFloat.random(in: 0...(2 * CGFloat.pi))
    var pulse: CGFloat = 2
    // snow realism
    var depth: CGFloat = 0.5
    var spinRate: CGFloat = 0
    var area: CGFloat = 1
    var drag: CGFloat = 0
    var chunk = false
    var flip: CGFloat = 0
    var baseRot: CGFloat = 0

    init(_ node: SKSpriteNode) { self.node = node }
}

// MARK: - Snow pile (height-field drift on a surface)

final class SnowPile {
    let id: Int
    let bucket: CGFloat = 4
    let width: CGFloat
    var heights: [CGFloat]
    var caps: [CGFloat]
    var covered: [Bool]
    var rect = CGRect.zero
    var dirty = false
    let container = SKNode()
    private let fill = SKShapeNode()
    private let rim = SKShapeNode()
    static let weights: [CGFloat] = [0.1, 0.2, 0.4, 0.2, 0.1]

    init(id: Int, width: CGFloat, maxH: CGFloat, edgeZone: CGFloat) {
        self.id = id
        self.width = width
        let n = max(4, Int(width / 4) + 1)
        heights = [CGFloat](repeating: 0, count: n)
        covered = [Bool](repeating: false, count: n)
        caps = [CGFloat](repeating: 0, count: n)
        // the drift can only grow to a soft dome: low at the ends, tallest in the middle
        let p1 = rnd(0, 6.28)
        let p2 = rnd(0, 6.28)
        for k in 0..<n {
            let x = (CGFloat(k) + 0.5) * 4
            let dist = min(x, width - x)
            let t = max(0, min(1, dist / max(1, edgeZone)))
            let e = pow(sin(t * CGFloat.pi / 2), 0.85)
            let nz = 0.82 + 0.12 * sin(x * 0.013 + p1) + 0.08 * sin(x * 0.031 + p2)
            caps[k] = max(0, maxH * e * nz)
        }
        container.zPosition = 0.5
        fill.fillColor = .white
        fill.fillTexture = Tex.snowFill
        fill.strokeColor = rgb(0.62, 0.74, 0.9, 0.6)
        fill.lineWidth = 1.2
        fill.isAntialiased = true
        rim.strokeColor = NSColor.white.withAlphaComponent(0.95)
        rim.lineWidth = 1.4
        rim.lineCap = .round
        rim.isAntialiased = true
        rim.zPosition = 1
        container.addChild(fill)
        container.addChild(rim)
    }

    func add(relX: CGFloat, area: CGFloat) {
        guard relX.isFinite, area.isFinite, relX > -1000, relX < 100000 else { return }
        let ci = Int(relX / bucket)
        for k in -2...2 {
            let i = ci + k
            if i < 0 || i >= heights.count { continue }
            heights[i] += area / bucket * SnowPile.weights[k + 2]
        }
        dirty = true
    }

    func reset() {
        for i in 0..<heights.count { heights[i] = 0 }
        dirty = true
    }

    // snow slumps sideways when a slope is too steep, and what does not fit flows inward
    func relax() {
        let n = heights.count
        guard n > 2 else { return }
        let maxDiff: CGFloat = 3.2
        for _ in 0..<3 {
            for i in 0..<(n - 1) {
                let d = heights[i] - heights[i + 1]
                if d > maxDiff {
                    let m = (d - maxDiff) * 0.5
                    heights[i] -= m
                    heights[i + 1] += m
                } else if d < -maxDiff {
                    let m = (-d - maxDiff) * 0.5
                    heights[i] += m
                    heights[i + 1] -= m
                }
            }
        }
        for i in 0..<(n - 1) where heights[i] > caps[i] {
            let ex = heights[i] - caps[i]
            heights[i] = caps[i]
            heights[i + 1] += ex
        }
        var j = n - 1
        while j > 0 {
            if heights[j] > caps[j] {
                let ex = heights[j] - caps[j]
                heights[j] = caps[j]
                heights[j - 1] += ex
            }
            j -= 1
        }
        for i in 0..<n { heights[i] = min(heights[i], caps[i]) }
    }

    func rebuild() {
        dirty = false
        let n = heights.count
        var sh = heights
        if n > 2 {
            for k in 1..<(n - 1) { sh[k] = (heights[k - 1] + 2 * heights[k] + heights[k + 1]) / 4 }
        }
        let fillPath = CGMutablePath()
        let rimPath = CGMutablePath()
        var any = false
        var i = 0
        while i < n {
            if covered[i] || sh[i] < 0.35 { i += 1; continue }
            var j = i
            while j + 1 < n && !covered[j + 1] && sh[j + 1] >= 0.35 { j += 1 }
            var pts: [CGPoint] = [CGPoint(x: CGFloat(i) * bucket, y: sh[i] * 0.4)]
            for k in i...j { pts.append(CGPoint(x: (CGFloat(k) + 0.5) * bucket, y: sh[k])) }
            pts.append(CGPoint(x: CGFloat(j + 1) * bucket, y: sh[j] * 0.4))

            fillPath.move(to: CGPoint(x: pts[0].x, y: -2))
            fillPath.addLine(to: pts[0])
            rimPath.move(to: pts[0])
            for m in 1..<pts.count {
                let mid = CGPoint(x: (pts[m - 1].x + pts[m].x) / 2, y: (pts[m - 1].y + pts[m].y) / 2)
                fillPath.addQuadCurve(to: mid, control: pts[m - 1])
                rimPath.addQuadCurve(to: mid, control: pts[m - 1])
            }
            let last = pts[pts.count - 1]
            fillPath.addLine(to: last)
            rimPath.addLine(to: last)
            fillPath.addLine(to: CGPoint(x: last.x, y: -2))
            fillPath.closeSubpath()
            any = true
            i = j + 1
        }
        fill.path = any ? fillPath : nil
        rim.path = any ? rimPath : nil
    }
}

// MARK: - Weather scene

final class WeatherScene: SKScene {
    static let groundID = -1
    static var lightningStamp = 0
    static var nextLightning: TimeInterval = CACurrentMediaTime() + 8

    var effect: Effect = .snow {
        didSet { if oldValue != effect { resetEffect() } }
    }
    var density: CGFloat = 1
    var landOnWindows = true {
        didSet { if !landOnWindows { clearPiles(except: WeatherScene.groundID) } }
    }
    var screenOrigin = CGPoint.zero

    private var surfaces: [Surface] = []
    private var surfaceIndex: [Int: Int] = [:]
    private var prevRects: [Int: CGRect] = [:]
    private var lastPoll: TimeInterval = 0
    private var piles: [Int: SnowPile] = [:]
    private var pileTimer: CGFloat = 0

    private var particles: [Particle] = []
    private var activeCount = 0
    private var last: TimeInterval = 0
    private var spawnAcc: CGFloat = 0
    private var meteorTimer: CGFloat = 1
    private var wind: CGFloat = 0
    private var seenStamp = 0

    private var mouse = CGPoint.zero
    private var mouseLast = CGPoint.zero
    private var mouseSpeed: CGFloat = 0
    private var stillTime: CGFloat = 0
    private var mouseVel = CGVector.zero

    private let flash = SKSpriteNode(color: rgb(0.82, 0.9, 1), size: CGSize(width: 10, height: 10))

    override init(size: CGSize) {
        super.init(size: size)
        scaleMode = .resizeFill
        backgroundColor = .clear
        flash.anchorPoint = .zero
        flash.size = size
        flash.alpha = 0
        flash.blendMode = .add
        flash.zPosition = 100
        addChild(flash)
    }

    required init?(coder aDecoder: NSCoder) { fatalError("not used") }

    override func didChangeSize(_ oldSize: CGSize) { flash.size = size }

    // MARK: Surfaces from the window tracker

    func setSurfaces(_ new: [Surface]) {
        let now = CACurrentMediaTime()
        let pollDt = max(0.005, CGFloat(now - lastPoll))
        lastPoll = now

        var newIndex: [Int: Int] = [:]
        for (i, s) in new.enumerated() { newIndex[s.id] = i }

        var moved: [Int: CGVector] = [:]
        var gone = Set<Int>()
        for (id, old) in prevRects {
            guard let i = newIndex[id] else { gone.insert(id); continue }
            let r = new[i].rect
            let dx = r.minX - old.minX
            let dy = r.maxY - old.maxY
            if abs(dx) > 1.5 || abs(dy) > 1.5 || abs(r.width - old.width) > 1.5 {
                moved[id] = CGVector(dx: dx / pollDt, dy: dy / pollDt)
            }
        }
        for p in particles where p.resting && !p.dead {
            if gone.contains(p.surfaceID) {
                release(p, CGVector(dx: 0, dy: 0))
            } else if let v = moved[p.surfaceID] {
                release(p, v)          // window dragged: leaves and petals slide off
            }
        }
        // snow drifts: dragged windows shed their snow as clumps
        for (id, pile) in piles {
            if gone.contains(id) {
                pile.container.removeFromParent()
                piles[id] = nil
            } else if let v = moved[id], let old = prevRects[id] {
                slideOff(pile, from: old, velocity: v)
                pile.container.removeFromParent()
                piles[id] = nil
            }
        }
        surfaces = new
        surfaceIndex = newIndex
        var rects: [Int: CGRect] = [:]
        for sf in new { rects[sf.id] = sf.rect }
        prevRects = rects

        // keep drifts attached to their windows and hide the parts behind windows in front
        for (id, pile) in piles {
            guard let i = newIndex[id] else { continue }
            let sf = new[i]
            pile.rect = sf.rect
            pile.container.position = CGPoint(x: sf.rect.minX, y: sf.rect.maxY)
            var cov = [Bool](repeating: false, count: pile.heights.count)
            var j = 0
            while j < i {
                let f = new[j].rect
                if f.minY <= sf.rect.maxY + 1 && f.maxY >= sf.rect.maxY + 1 {
                    let lo = max(0, Int((f.minX - sf.rect.minX) / pile.bucket))
                    let hi = min(cov.count - 1, Int((f.maxX - sf.rect.minX) / pile.bucket))
                    if lo <= hi { for k in lo...hi { cov[k] = true } }
                }
                j += 1
            }
            if cov != pile.covered {
                pile.covered = cov
                pile.dirty = true
            }
        }
    }

    private func release(_ p: Particle, _ v: CGVector) {
        p.resting = false
        p.restTime = 0
        p.node.isHidden = false
        p.node.alpha = p.baseAlpha
        let cap: CGFloat = 1100
        p.vel = CGVector(dx: max(-cap, min(cap, v.dx * 0.8 + rnd(-40, 40))),
                         dy: max(-cap, min(cap, v.dy * 0.6 + rnd(-20, 60))))
    }

    private func findLanding(x: CGFloat, oldY: CGFloat, newY: CGFloat) -> Int? {
        var best: Int? = nil
        var bestTop = -CGFloat.greatestFiniteMagnitude
        for (i, s) in surfaces.enumerated() {
            if !landOnWindows && s.id != WeatherScene.groundID { continue }
            let top = s.rect.maxY
            guard top <= oldY, top >= newY, top > bestTop, x >= s.rect.minX, x <= s.rect.maxX else { continue }
            var covered = false
            var j = 0
            while j < i {
                if surfaces[j].rect.contains(CGPoint(x: x, y: top - 1)) { covered = true; break }
                j += 1
            }
            if !covered { best = i; bestTop = top }
        }
        return best
    }

    // MARK: Frame update

    override func update(_ currentTime: TimeInterval) {
        if last == 0 { last = currentTime }
        let dt = CGFloat(min(max(currentTime - last, 0), 0.05))
        last = currentTime
        guard dt > 0 else { return }

        let t = CGFloat(currentTime)
        wind = 9 * sin(t * 0.17) + 6 * sin(t * 0.53 + 1.0) + 4 * sin(t * 1.3 + 2.0)
        updatePointer(dt)
        plowSnow(dt)
        spawn(dt)

        var active = 0
        for p in particles where !p.dead {
            p.age += dt
            if p.resting { stepResting(p, dt); continue }
            switch p.kind {
            case .main:
                stepMain(p, dt)
                if !p.dead && !p.resting { active += 1 }
            case .spark: stepSpark(p, dt)
            case .meteor: stepMeteor(p, dt)
            }
        }
        activeCount = active
        particles.removeAll { $0.dead }
        pileTimer += dt
        if pileTimer > 0.12 {
            pileTimer = 0
            for pile in piles.values where pile.dirty {
                pile.relax()
                pile.rebuild()
            }
        }
        lightning()
    }

    private func updatePointer(_ dt: CGFloat) {
        let m = NSEvent.mouseLocation
        mouse = CGPoint(x: m.x - screenOrigin.x, y: m.y - screenOrigin.y)
        let d = hypot(mouse.x - mouseLast.x, mouse.y - mouseLast.y)
        mouseSpeed = d / dt
        mouseVel = CGVector(dx: (mouse.x - mouseLast.x) / dt, dy: (mouse.y - mouseLast.y) / dt)
        if d < 2 { stillTime += dt } else { stillTime = 0 }
        mouseLast = mouse
    }

    func debugStats() -> String {
        let moving = particles.filter { !$0.resting && !$0.dead }.count
        let resting = particles.filter { $0.resting && !$0.dead }.count
        let maxH = piles.values.map { $0.heights.max() ?? 0 }.max() ?? 0
        return "particles=\(particles.count) moving=\(moving) resting=\(resting) piles=\(piles.count) maxPile=\(String(format: "%.1f", maxH))"
    }

    // MARK: Pointer plows through the snow

    private func plowSnow(_ dt: CGFloat) {
        guard effect == .snow, mouseSpeed > 40, !piles.isEmpty else { return }
        guard mouse.x >= 0, mouse.x <= size.width, mouse.y >= 0, mouse.y <= size.height else { return }
        let R: CGFloat = 26
        for pile in piles.values {
            let relX = mouse.x - pile.rect.minX
            let relY = mouse.y - pile.rect.maxY
            guard relX > -R, relX < pile.width + R else { continue }
            let ci = Int(max(0, min(CGFloat(pile.heights.count - 1), relX / pile.bucket)))
            if pile.covered[ci] { continue }
            let hc = pile.heights[ci]
            guard relY > -10, relY < hc + 12 else { continue }      // pointer is touching the drift

            let reach = Int(R / pile.bucket)
            let strength = min(1, mouseSpeed * dt / 8)
            var removed: CGFloat = 0
            for k in -reach...reach {
                let i = ci + k
                if i < 0 || i >= pile.heights.count || pile.covered[i] { continue }
                let fall = 1 - abs(CGFloat(k)) / CGFloat(reach + 1)
                let take = pile.heights[i] * 0.55 * fall * strength
                pile.heights[i] -= take
                removed += take * pile.bucket
            }
            guard removed > 0.2 else { continue }

            // part of the snow is shoved ahead of the pointer, the rest flies up as powder
            let dir: CGFloat = mouseVel.dx >= 0 ? 1 : -1
            pile.add(relX: relX + dir * (R + 6), area: removed * 0.4)
            let top = pile.rect.maxY + hc
            let n = min(14, Int(removed / 1.5) + 1)
            for _ in 0..<n {
                let y = max(pile.rect.maxY, min(mouse.y, top)) + rnd(0, 4)
                spawnSpark(at: CGPoint(x: mouse.x + rnd(-R * 0.6, R * 0.6), y: y),
                           vel: CGVector(dx: mouseVel.dx * 0.45 + rnd(-90, 90),
                                         dy: rnd(40, 200) + abs(mouseVel.dy) * 0.2),
                           size: rnd(2, 5.5), color: rgb(0.97, 0.98, 1), gravity: 200,
                           life: rnd(0.7, 1.6), additive: false, drag: 1.4, alpha: rnd(0.55, 0.95))
            }
            pile.relax()
            pile.rebuild()
        }
    }

    // MARK: Spawning

    private func makeSprite(_ tex: SKTexture, _ size: CGSize, _ pos: CGPoint) -> SKSpriteNode {
        let n = SKSpriteNode(texture: tex)
        n.size = size
        n.position = pos
        n.zPosition = 1
        addChild(n)
        return n
    }

    private func emit(_ dt: CGFloat, rate: CGFloat, cap: Int, _ make: () -> Void) {
        if activeCount >= cap || particles.count > 3600 { spawnAcc = 0; return }
        spawnAcc += rate * dt
        while spawnAcc >= 1 { spawnAcc -= 1; make() }
    }

    private func spawn(_ dt: CGFloat) {
        let w = size.width, h = size.height
        let s = (w / 1440) * density
        switch effect {
        case .snow:    emit(dt, rate: 48 * s, cap: Int(900 * s)) { makeSnow(w, h) }
        case .rain:    emit(dt, rate: 650 * s, cap: Int(1100 * s)) { makeRain(w, h) }
        case .sakura:  emit(dt, rate: 5 * s, cap: Int(130 * s)) { makePetal(w, h) }
        case .leaves:  emit(dt, rate: 4.5 * s, cap: Int(110 * s)) { makeLeaf(w, h) }
        case .fireflies:
            let target = Int(42 * s)
            if activeCount < target { makeFirefly(w, h) }
            else if activeCount > Int(Double(target) * 1.3) + 2,
                    let victim = particles.first(where: { !$0.dead && $0.kind == .main }) {
                removeParticle(victim)
            }
        case .starfall:
            meteorTimer -= dt
            if meteorTimer <= 0 {
                makeMeteor(w, h)
                if CGFloat.random(in: 0...1) < 0.25 { makeMeteor(w, h) }
                meteorTimer = rnd(0.5, 2.2) / max(0.4, density)
            }
        }
    }

    private func makeSnow(_ w: CGFloat, _ h: CGFloat) {
        let roll = CGFloat.random(in: 0...1)
        let depth: CGFloat = roll < 0.55 ? 0 : (roll < 0.90 ? 0.5 : 1)
        let pos = CGPoint(x: rnd(-80, w + 80), y: h + 40)
        let n: SKSpriteNode
        let fall: CGFloat
        let amp: CGFloat
        var area: CGFloat = 1
        var spin: CGFloat = 0
        if depth == 0 {
            // far: tiny and dim
            let d = rnd(2.5, 4.5)
            n = makeSprite(Tex.dot, CGSize(width: d, height: d), pos)
            n.alpha = rnd(0.45, 0.75)
            fall = rnd(22, 40)
            amp = rnd(5, 12)
            area = 2.2
        } else if depth == 0.5 {
            // middle: fluffy flakes and crystals
            let kind = Int.random(in: 0..<10)
            let d: CGFloat
            if kind < 5 {
                d = rnd(7, 13)
                n = makeSprite(Tex.puff, CGSize(width: d, height: d), pos)
                n.zRotation = rnd(0, 6.28)
            } else if kind < 8 {
                d = rnd(9, 16)
                n = makeSprite(Tex.crystals[Int.random(in: 0..<3)], CGSize(width: d, height: d), pos)
                n.zRotation = rnd(0, 6.28)
                spin = rnd(-0.9, 0.9)
            } else {
                d = rnd(5, 8)
                n = makeSprite(Tex.dot, CGSize(width: d, height: d), pos)
            }
            n.alpha = rnd(0.7, 0.95)
            fall = rnd(45, 75)
            amp = rnd(10, 24)
            area = 5.0 + d * 0.3
        } else {
            // near: big out-of-focus flakes and a few sharp crystals, in front of everything
            if Int.random(in: 0..<10) < 6 {
                let d = rnd(16, 36)
                n = makeSprite(Tex.bokeh, CGSize(width: d, height: d), pos)
                n.alpha = rnd(0.16, 0.32)
            } else {
                let d = rnd(22, 34)
                n = makeSprite(Tex.crystals[Int.random(in: 0..<3)], CGSize(width: d, height: d), pos)
                n.zRotation = rnd(0, 6.28)
                n.alpha = rnd(0.5, 0.8)
                spin = rnd(-0.7, 0.7)
            }
            n.zPosition = 2
            fall = rnd(100, 160)
            amp = rnd(18, 40)
        }
        let p = Particle(n)
        p.baseAlpha = n.alpha
        p.depth = depth
        p.fall = fall
        p.swayAmp = amp
        p.swayFreq = rnd(0.5, 1.5)
        p.spinRate = spin
        p.area = area
        p.vel = CGVector(dx: 0, dy: -fall)
        particles.append(p)
    }

    private func makeRain(_ w: CGFloat, _ h: CGFloat) {
        let n = makeSprite(Tex.streak, CGSize(width: rnd(1.2, 2), height: rnd(14, 26)),
                           CGPoint(x: rnd(-100, w + 160), y: h + 30))
        n.color = rgb(0.75, 0.88, 1)
        n.colorBlendFactor = 1
        n.alpha = rnd(0.25, 0.55)
        let p = Particle(n)
        p.baseAlpha = n.alpha
        p.vel = CGVector(dx: -rnd(60, 110), dy: -rnd(900, 1300))
        n.zRotation = atan2(p.vel.dx, -p.vel.dy)
        particles.append(p)
    }

    private func makePetal(_ w: CGFloat, _ h: CGFloat) {
        let roll = Int.random(in: 0..<100)
        let shape = roll < 45 ? 0 : (roll < 65 ? 1 : (roll < 80 ? 2 : 3))
        let palette = Int.random(in: 0..<5)
        let d: CGFloat = shape == 2 ? rnd(18, 26) : rnd(12, 18)
        let n = makeSprite(Tex.sakuraTex(shape: shape, palette: palette), CGSize(width: d, height: d),
                           CGPoint(x: rnd(-60, w + 60), y: h + 20))
        let p = Particle(n)
        p.baseAlpha = rnd(0.88, 1)
        n.alpha = p.baseAlpha
        p.fall = rnd(30, 55) * (shape == 2 ? 0.75 : 1.0)
        p.swayAmp = rnd(25, 60)
        p.swayFreq = rnd(0.5, 1.2)
        p.rock = rnd(0.4, 1.2)
        p.baseRot = rnd(0, 6.28)
        p.spinRate = rnd(-1.0, 1.0)
        p.flip = shape == 2 ? 0 : rnd(1.0, 3.0)
        p.vel = CGVector(dx: 0, dy: -p.fall)
        particles.append(p)
    }

    private func makeLeaf(_ w: CGFloat, _ h: CGFloat) {
        let roll = Int.random(in: 0..<100)
        let shape = roll < 25 ? 0 : (roll < 45 ? 1 : (roll < 65 ? 2 : (roll < 75 ? 3 : (roll < 90 ? 4 : 5))))
        let palette = shape == 3 ? (Int.random(in: 0..<10) < 8 ? 2 : 1) : Int.random(in: 0..<6)
        let d: CGFloat
        switch shape {
        case 0, 1: d = rnd(20, 30)
        case 2: d = rnd(14, 22)
        case 5: d = rnd(18, 26)
        default: d = rnd(14, 20)
        }
        let n = makeSprite(Tex.leafTex(shape: shape, palette: palette), CGSize(width: d, height: d),
                           CGPoint(x: rnd(-60, w + 60), y: h + 24))
        let p = Particle(n)
        p.baseAlpha = 1
        p.fall = rnd(50, 95) * (shape == 5 ? 1.15 : (shape == 3 ? 0.85 : 1.0))
        p.swayAmp = rnd(35, 95)
        p.swayFreq = rnd(0.7, 1.9)
        p.rock = rnd(0.5, 1.5)
        p.baseRot = rnd(0, 6.28)
        p.spinRate = rnd(-1.2, 1.2)
        p.flip = rnd(1.2, 3.6)
        p.vel = CGVector(dx: 0, dy: -p.fall)
        particles.append(p)
    }

    private func makeFirefly(_ w: CGFloat, _ h: CGFloat) {
        let d = rnd(14, 26)
        let n = makeSprite(Tex.glow, CGSize(width: d, height: d), CGPoint(x: rnd(0, w), y: rnd(0, h * 0.85)))
        n.blendMode = .add
        n.color = rgb(0.9, 1.0, 0.45)
        n.colorBlendFactor = 1
        n.alpha = 0
        n.zPosition = 2
        let p = Particle(n)
        p.curiosity = rnd(0.5, 3.0)
        p.orbit = rnd(16, 90)
        p.pulse = rnd(1.4, 3.2)
        p.vel = CGVector(dx: rnd(-20, 20), dy: rnd(-20, 20))
        particles.append(p)
    }

    private func makeMeteor(_ w: CGFloat, _ h: CGFloat) {
        let speed = rnd(750, 1150)
        let ang = rnd(-2.55, -2.1)
        let n = SKSpriteNode(texture: Tex.trail)
        n.anchorPoint = CGPoint(x: 1, y: 0.5)
        n.size = CGSize(width: speed * rnd(0.10, 0.16), height: rnd(3, 5))
        n.zRotation = ang
        n.blendMode = .add
        n.color = rgb(1, 0.95, 0.8)
        n.colorBlendFactor = 0.6
        n.position = CGPoint(x: rnd(w * 0.3, w * 1.2), y: h + 20)
        n.zPosition = 2
        let head = SKSpriteNode(texture: Tex.glow)
        head.size = CGSize(width: 16, height: 16)
        head.blendMode = .add
        head.color = rgb(1, 0.97, 0.85)
        head.colorBlendFactor = 0.7
        n.addChild(head)
        addChild(n)
        let p = Particle(n)
        p.kind = .meteor
        p.vel = CGVector(dx: cos(ang) * speed, dy: sin(ang) * speed)
        particles.append(p)
    }

    // MARK: Stepping

    private func removeParticle(_ p: Particle) {
        p.dead = true
        p.node.removeFromParent()
    }

    private func stepMain(_ p: Particle, _ dt: CGFloat) {
        let old = p.node.position
        var pos = old
        switch effect {
        case .snow, .sakura, .leaves:
            var tx = sin(p.age * p.swayFreq + p.phase) * p.swayAmp + wind
            var ty = -p.fall
            if effect == .snow {
                tx = sin(p.age * p.swayFreq + p.phase) * p.swayAmp
                    + sin(p.age * p.swayFreq * 2.3 + p.phase * 2) * p.swayAmp * 0.35
                    + wind * (0.4 + p.depth)
                ty = -p.fall * (1 + 0.12 * sin(p.age * p.swayFreq * 1.4 + p.phase))
                p.node.zRotation += p.spinRate * dt
            }
            let k = min(1, 1.6 * dt)
            p.vel.dx += (tx - p.vel.dx) * k
            p.vel.dy += (ty - p.vel.dy) * k
            if effect == .leaves || effect == .sakura { pushByPointer(p, dt) }
            pos.x += p.vel.dx * dt
            pos.y += p.vel.dy * dt
            if p.rock > 0 {
                p.baseRot += p.spinRate * dt
                p.node.zRotation = p.baseRot + sin(p.age * p.swayFreq * 1.7 + p.phase) * p.rock
            }
            if p.flip > 0 { p.node.xScale = 0.25 + 0.75 * abs(cos(p.age * p.flip + p.phase)) }
        case .rain:
            pos.x += p.vel.dx * dt
            pos.y += p.vel.dy * dt
        case .fireflies:
            stepFirefly(p, dt)
            return
        case .starfall:
            return
        }

        let passesThrough = effect == .snow && p.depth > 0.8      // near flakes fall in front of windows
        if pos.y < old.y, !passesThrough, let idx = findLanding(x: pos.x, oldY: old.y, newY: pos.y) {
            let top = surfaces[idx].rect.maxY
            if effect == .rain {
                splash(at: CGPoint(x: pos.x, y: top))
                removeParticle(p)
            } else if effect == .snow {
                landSnow(p, on: idx, x: pos.x)
            } else {
                land(p, on: idx, x: pos.x)
            }
            return
        }
        p.node.position = pos
        if pos.y < -60 || pos.x < -250 || pos.x > size.width + 250 { removeParticle(p) }
    }

    private func land(_ p: Particle, on idx: Int, x: CGFloat) {
        let s = surfaces[idx]
        let rel = x - s.rect.minX
        var neighbors = 0
        for q in particles where q.resting && !q.dead && q.surfaceID == s.id && abs(q.relX - rel) < 7 {
            neighbors += 1
        }
        if neighbors > 48 { removeParticle(p); return }     // pile is full: melt
        let layer: CGFloat = effect == .snow ? 0.30 : (effect == .sakura ? 0.2 : 0.25)
        p.surfaceID = s.id
        p.relX = rel
        p.restH = min(CGFloat(neighbors) * layer, 14) + rnd(0, 1.5)
        p.resting = true
        p.restTime = 0
        p.restLife = rnd(70, 150)
        p.vel = .zero
        if effect != .snow { p.node.zRotation = rnd(-0.6, 0.6) }
        if effect == .leaves || effect == .sakura { p.node.zRotation = rnd(0, 6.28) }
        p.node.xScale = 1
        p.node.position = CGPoint(x: x, y: s.rect.maxY + p.restH)
    }

    private func stepResting(_ p: Particle, _ dt: CGFloat) {
        p.restTime += dt
        guard let i = surfaceIndex[p.surfaceID] else { release(p, .zero); return }
        let s = surfaces[i]
        let x = s.rect.minX + p.relX
        let y = s.rect.maxY + p.restH
        p.node.position = CGPoint(x: x, y: y)

        var covered = false
        var j = 0
        while j < i {
            if surfaces[j].rect.contains(CGPoint(x: x, y: s.rect.maxY + 1)) { covered = true; break }
            j += 1
        }
        p.node.isHidden = covered

        if (effect == .leaves || effect == .sakura) && mouseSpeed > 120 && !covered {
            let dx = x - mouse.x, dy = y - mouse.y
            let d = hypot(dx, dy)
            if d < 90 {
                let ux = d > 0.1 ? dx / d : rnd(-1, 1)
                p.resting = false
                p.restTime = 0
                p.vel = CGVector(dx: ux * rnd(180, 420), dy: rnd(140, 300))
                return
            }
        }

        let over = p.restTime - p.restLife
        if over > 0 {
            p.node.alpha = p.baseAlpha * max(0, 1 - over / 2)
            if over > 2 { removeParticle(p) }
        }
    }

    private func pushByPointer(_ p: Particle, _ dt: CGFloat) {
        guard mouseSpeed > 120 else { return }
        let pos = p.node.position
        let dx = pos.x - mouse.x, dy = pos.y - mouse.y
        let d = hypot(dx, dy)
        guard d < 90, d > 0.1 else { return }
        let f = (1 - d / 90) * min(mouseSpeed, 1200) * 0.12 * dt * 60
        p.vel.dx += dx / d * f
        p.vel.dy += dy / d * f + (1 - d / 90) * 30
    }

    private func stepFirefly(_ p: Particle, _ dt: CGFloat) {
        let w = size.width, h = size.height
        var pos = p.node.position
        let mouseHere = mouse.x >= 0 && mouse.x <= w && mouse.y >= 0 && mouse.y <= h

        if mouseHere && stillTime > p.curiosity {
            let ang = p.phase + p.age * 0.8
            let target = CGPoint(x: mouse.x + cos(ang) * p.orbit, y: mouse.y + sin(ang) * p.orbit * 0.8)
            let dx = target.x - pos.x, dy = target.y - pos.y
            let d = max(1, hypot(dx, dy))
            let speed = min(220, 60 + d * 0.8)
            let k = min(1, 2.2 * dt)
            p.vel.dx += (dx / d * speed - p.vel.dx) * k
            p.vel.dy += (dy / d * speed - p.vel.dy) * k
        } else {
            p.heading += rnd(-1, 1) * 2.0 * sqrt(dt)
            if pos.x < 10 || pos.x > w - 10 || pos.y < 10 || pos.y > h - 10 {
                p.heading = atan2(h / 2 - pos.y, w / 2 - pos.x)
            }
            let sp = 28 + 14 * sin(p.age * 0.5 + p.phase)
            let k = min(1, 1.5 * dt)
            p.vel.dx += (cos(p.heading) * sp - p.vel.dx) * k
            p.vel.dy += (sin(p.heading) * sp + 6 - p.vel.dy) * k
        }
        pos.x += p.vel.dx * dt
        pos.y += p.vel.dy * dt
        p.node.position = pos
        let fade = min(1, p.age / 1.5)
        p.node.alpha = fade * (0.35 + 0.65 * (0.5 + 0.5 * sin(p.age * p.pulse + p.phase)))
    }

    private func stepSpark(_ p: Particle, _ dt: CGFloat) {
        let old = p.node.position
        p.vel.dy -= p.fall * dt
        if p.drag > 0 {
            let f = max(0, 1 - p.drag * dt)
            p.vel.dx *= f
            p.vel.dy *= f
        }
        var pos = old
        pos.x += p.vel.dx * dt
        pos.y += p.vel.dy * dt
        if p.spinRate != 0 { p.node.zRotation += p.spinRate * dt }

        // a clump of snow that lands on a window or the Dock adds to that drift
        if p.chunk && effect == .snow && pos.y < old.y,
           let idx = findLanding(x: pos.x, oldY: old.y, newY: pos.y) {
            let sf = surfaces[idx]
            let pile = piles[sf.id] ?? makePile(sf)
            pile.add(relX: pos.x - sf.rect.minX, area: p.area)
            spawnPowder(at: CGPoint(x: pos.x, y: sf.rect.maxY), count: 4, vel: CGVector(dx: 0, dy: 40), spread: 90)
            removeParticle(p)
            return
        }

        p.node.position = pos
        let t = p.age / p.life
        if t >= 1 { removeParticle(p); return }
        if p.chunk {
            p.node.alpha = p.baseAlpha * min(1, (p.life - p.age) / 0.5)
        } else {
            p.node.alpha = (1 - t) * p.baseAlpha
        }
        if pos.y < -80 { removeParticle(p) }
    }

    private func stepMeteor(_ p: Particle, _ dt: CGFloat) {
        let old = p.node.position
        let pos = CGPoint(x: old.x + p.vel.dx * dt, y: old.y + p.vel.dy * dt)
        if let idx = findLanding(x: pos.x, oldY: old.y, newY: pos.y) {
            let top = surfaces[idx].rect.maxY
            let t = (old.y - top) / max(0.001, old.y - pos.y)
            burst(at: CGPoint(x: old.x + (pos.x - old.x) * t, y: top))
            removeParticle(p)
            return
        }
        p.node.position = pos
        if pos.y < -80 || pos.x < -400 { removeParticle(p) }
    }

    // MARK: Splashes, sparks, lightning

    private func spawnSpark(at pt: CGPoint, vel: CGVector, size: CGFloat, color: NSColor,
                            gravity: CGFloat, life: CGFloat, additive: Bool,
                            tex: SKTexture = Tex.dot, drag: CGFloat = 0, spin: CGFloat = 0,
                            chunkArea: CGFloat = 0, alpha: CGFloat = 1) {
        guard particles.count < 3600 else { return }
        let n = makeSprite(tex, CGSize(width: size, height: size), pt)
        n.color = color
        n.colorBlendFactor = 1
        if additive { n.blendMode = .add }
        n.zPosition = 3
        n.alpha = alpha
        let p = Particle(n)
        p.kind = .spark
        p.vel = vel
        p.fall = gravity
        p.life = life
        p.drag = drag
        p.spinRate = spin
        p.area = chunkArea
        p.chunk = chunkArea > 0
        p.baseAlpha = alpha
        particles.append(p)
    }

    private func spawnPowder(at pt: CGPoint, count: Int, vel v: CGVector, spread: CGFloat) {
        for _ in 0..<count {
            spawnSpark(at: pt, vel: CGVector(dx: v.dx + rnd(-spread, spread), dy: v.dy + rnd(0, spread)),
                       size: rnd(2, 5), color: rgb(0.97, 0.98, 1), gravity: 120, life: rnd(0.6, 1.4),
                       additive: false, drag: 1.8, alpha: rnd(0.5, 0.9))
        }
    }

    // MARK: Snow drifts

    private func makePile(_ sf: Surface) -> SnowPile {
        let isDock = sf.id == WeatherScene.groundID
        let pile = SnowPile(id: sf.id, width: sf.rect.width,
                            maxH: isDock ? 26 : 14,
                            edgeZone: isDock ? min(240, sf.rect.width * 0.28) : 28)
        pile.rect = sf.rect
        pile.container.position = CGPoint(x: sf.rect.minX, y: sf.rect.maxY)
        addChild(pile.container)
        piles[sf.id] = pile
        return pile
    }

    private func landSnow(_ p: Particle, on idx: Int, x: CGFloat) {
        let sf = surfaces[idx]
        let pile = piles[sf.id] ?? makePile(sf)
        pile.add(relX: x - sf.rect.minX, area: p.area)
        removeParticle(p)
    }

    private func clearPiles(except keep: Int? = nil) {
        for (id, pile) in piles where id != keep {
            pile.container.removeFromParent()
            piles[id] = nil
        }
    }

    // a dragged window throws its snow off in clumps and powder
    private func slideOff(_ pile: SnowPile, from old: CGRect, velocity v: CGVector) {
        let hs = pile.heights
        let b = pile.bucket
        var idxs: [Int] = []
        for (i, h) in hs.enumerated() where h > 0.5 { idxs.append(i) }
        let total = hs.reduce(0, +) * b
        guard total > 8, !idxs.isEmpty else { return }
        let count = min(70, max(6, Int(total / 70)))
        let areaEach = total / CGFloat(count)
        let sz = min(24, max(7, sqrt(areaEach) * 1.5))
        let vx = max(-1100, min(1100, v.dx))
        let vy = max(-1100, min(1100, v.dy))
        for _ in 0..<count {
            let i = idxs[Int.random(in: 0..<idxs.count)]
            let pt = CGPoint(x: old.minX + (CGFloat(i) + 0.5) * b + rnd(-2, 2),
                             y: old.maxY + hs[i] * rnd(0.2, 1))
            spawnSpark(at: pt, vel: CGVector(dx: vx * 0.75 + rnd(-70, 70), dy: vy * 0.5 + rnd(-10, 110)),
                       size: sz * rnd(0.8, 1.2), color: rgb(0.95, 0.97, 1), gravity: 650, life: 6,
                       additive: false, tex: Tex.puff, drag: 0.3, spin: rnd(-3, 3),
                       chunkArea: areaEach, alpha: 1)
            spawnPowder(at: pt, count: 2, vel: CGVector(dx: vx * 0.85, dy: vy * 0.6), spread: 120)
        }
    }

    private func splash(at pt: CGPoint) {
        guard particles.count < 3600 else { return }
        let r = SKSpriteNode(texture: Tex.ring)
        r.size = CGSize(width: 8, height: 8)
        r.yScale = 0.35
        r.position = pt
        r.alpha = 0.5
        r.color = rgb(0.8, 0.9, 1)
        r.colorBlendFactor = 1
        r.zPosition = 2
        addChild(r)
        r.run(.sequence([.group([.scaleX(to: 3.6, y: 1.3, duration: 0.3), .fadeOut(withDuration: 0.3)]),
                         .removeFromParent()]))
        for _ in 0..<Int.random(in: 2...3) {
            spawnSpark(at: pt, vel: CGVector(dx: rnd(-80, 80), dy: rnd(70, 170)), size: 2.5,
                       color: rgb(0.8, 0.9, 1), gravity: 800, life: 0.32, additive: false)
        }
    }

    private func burst(at pt: CGPoint) {
        let g = SKSpriteNode(texture: Tex.glow)
        g.size = CGSize(width: 40, height: 40)
        g.position = pt
        g.blendMode = .add
        g.color = rgb(1, 0.9, 0.6)
        g.colorBlendFactor = 0.7
        g.zPosition = 3
        addChild(g)
        g.run(.sequence([.group([.scale(to: 2.4, duration: 0.35), .fadeOut(withDuration: 0.35)]),
                         .removeFromParent()]))
        for _ in 0..<Int.random(in: 16...26) {
            let a = rnd(0.15, 0.85) * CGFloat.pi
            let sp = rnd(80, 360)
            spawnSpark(at: pt, vel: CGVector(dx: cos(a) * sp, dy: sin(a) * sp), size: rnd(2, 5),
                       color: rgb(1, 0.92, 0.7), gravity: 520, life: rnd(0.45, 0.95), additive: true)
        }
    }

    private func lightning() {
        guard effect == .rain else { return }
        let now = CACurrentMediaTime()
        if now > WeatherScene.nextLightning {
            WeatherScene.nextLightning = now + Double(rnd(8, 18))
            WeatherScene.lightningStamp += 1
        }
        if seenStamp != WeatherScene.lightningStamp {
            seenStamp = WeatherScene.lightningStamp
            flash.removeAllActions()
            flash.run(.sequence([.fadeAlpha(to: 0.45, duration: 0.04),
                                 .fadeAlpha(to: 0.05, duration: 0.07),
                                 .fadeAlpha(to: 0.3, duration: 0.04),
                                 .fadeAlpha(to: 0, duration: 0.5)]))
        }
    }

    private func resetEffect() {
        for p in particles { p.node.removeFromParent() }
        particles.removeAll()
        clearPiles()
        activeCount = 0
        spawnAcc = 0
        meteorTimer = 1
        seenStamp = WeatherScene.lightningStamp
        flash.removeAllActions()
        flash.alpha = 0
    }
}

// MARK: - Window tracker (CGWindowList)

struct WinInfo {
    let id: Int
    let rect: CGRect       // Cocoa global coordinates (bottom-left origin)
}

func currentWindows() -> [WinInfo] {
    let opts: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let list = CGWindowListCopyWindowInfo(opts, kCGNullWindowID) as? [[String: Any]] else { return [] }
    let primaryH = NSScreen.screens.first?.frame.height ?? 0
    let myPID = Int(ProcessInfo.processInfo.processIdentifier)
    var out: [WinInfo] = []
    for d in list {                                    // front-to-back order
        guard let layer = d[kCGWindowLayer as String] as? Int, layer == 0,
              let pid = d[kCGWindowOwnerPID as String] as? Int, pid != myPID,
              let num = d[kCGWindowNumber as String] as? Int,
              let bd = d[kCGWindowBounds as String] as? NSDictionary,
              let r = CGRect(dictionaryRepresentation: bd as CFDictionary) else { continue }
        let alpha = (d[kCGWindowAlpha as String] as? Double) ?? 1
        if alpha < 0.05 || r.width < 120 || r.height < 60 { continue }
        out.append(WinInfo(id: num, rect: CGRect(x: r.minX, y: primaryH - r.maxY, width: r.width, height: r.height)))
    }
    return out
}

// MARK: - Overlay window (one per screen)

final class OverlayWindow: NSWindow {
    let skView: SKView
    let scene: WeatherScene
    let screenRef: NSScreen
    private var suppressed = false
    var asleep = false { didSet { applyPause() } }

    init(screen: NSScreen) {
        screenRef = screen
        skView = SKView(frame: NSRect(origin: .zero, size: screen.frame.size))
        scene = WeatherScene(size: screen.frame.size)
        super.init(contentRect: screen.frame, styleMask: .borderless, backing: .buffered, defer: false)

        isReleasedWhenClosed = false
        isOpaque = false
        backgroundColor = .clear
        hasShadow = false
        ignoresMouseEvents = true                      // every click goes through
        level = .screenSaver
        collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]

        scene.screenOrigin = screen.frame.origin
        skView.allowsTransparency = true
        skView.ignoresSiblingOrder = true
        skView.preferredFramesPerSecond = 60
        skView.presentScene(scene)
        contentView = skView
        setFrame(screen.frame, display: true)
    }

    func setSuppressed(_ s: Bool) {
        if s == suppressed { return }
        suppressed = s
        applyPause()
    }

    private func applyPause() {
        let off = suppressed || asleep
        skView.isPaused = off
        alphaValue = off ? 0 : 1
    }
}

// MARK: - Procedural wallpapers (original art, drawn in code)

enum WallpaperFactory {
    static let names = ["Snow", "Rain", "Autumn", "Fireflies", "Stars"]
    static let W: CGFloat = 3840
    static let H: CGFloat = 2160

    static var directory: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        let d = base.appendingPathComponent("SnowDesk/Wallpapers", isDirectory: true)
        try? FileManager.default.createDirectory(at: d, withIntermediateDirectories: true)
        return d
    }

    static func ensure(_ name: String) -> URL? {
        let url = directory.appendingPathComponent("\(name).jpg")
        if FileManager.default.fileExists(atPath: url.path) { return url }
        guard let data = render(name) else { return nil }
        do { try data.write(to: url); return url } catch { return nil }
    }

    static func render(_ name: String) -> Data? {
        guard let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: Int(W), pixelsHigh: Int(H),
                                         bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
                                         colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0),
              let ctx = NSGraphicsContext(bitmapImageRep: rep) else { return nil }
        NSGraphicsContext.saveGraphicsState()
        NSGraphicsContext.current = ctx
        var rng = SplitMix64(state: name.utf8.reduce(UInt64(7)) { $0 &* 31 &+ UInt64($1) })
        let full = NSRect(x: 0, y: 0, width: W, height: H)
        switch name {
        case "Snow": drawSnow(full, &rng)
        case "Rain": drawRain(full, &rng)
        case "Autumn": drawAutumn(full, &rng)
        case "Fireflies": drawFireflies(full, &rng)
        default: drawStars(full, &rng)
        }
        ctx.flushGraphics()
        NSGraphicsContext.restoreGraphicsState()
        return rep.representation(using: .jpeg, properties: [.compressionFactor: 0.9])
    }

    // helpers
    static func vgrad(_ r: NSRect, _ cols: [NSColor]) {
        NSGradient(colors: cols)?.draw(in: r, angle: 270)     // first colour at the top
    }

    static func glow(_ c: CGPoint, _ radius: CGFloat, _ color: NSColor, _ a: CGFloat) {
        NSGradient(colors: [color.withAlphaComponent(a), color.withAlphaComponent(0)])?
            .draw(fromCenter: c, radius: 0, toCenter: c, radius: radius, options: [])
    }

    static func dots(_ n: Int, yMin: CGFloat, yMax: CGFloat, rMin: CGFloat, rMax: CGFloat,
                     color: NSColor, aMin: CGFloat, aMax: CGFloat, _ rng: inout SplitMix64) {
        for _ in 0..<n {
            let x = CGFloat.random(in: 0...W, using: &rng)
            let y = CGFloat.random(in: yMin...yMax, using: &rng)
            let r = CGFloat.random(in: rMin...rMax, using: &rng)
            color.withAlphaComponent(CGFloat.random(in: aMin...aMax, using: &rng)).setFill()
            NSBezierPath(ovalIn: NSRect(x: x - r, y: y - r, width: r * 2, height: r * 2)).fill()
        }
    }

    static func hillFn(_ base: CGFloat, _ amp: CGFloat, _ f: CGFloat, _ ph: CGFloat) -> (CGFloat) -> CGFloat {
        return { x in base + amp * (0.65 * sin(x * f + ph) + 0.35 * sin(x * f * 2.3 + ph * 1.7)) }
    }

    static func fillHill(_ fn: (CGFloat) -> CGFloat, _ color: NSColor) {
        let p = NSBezierPath()
        p.move(to: NSPoint(x: 0, y: 0))
        p.line(to: NSPoint(x: 0, y: fn(0)))
        var x: CGFloat = 0
        while x <= W { p.line(to: NSPoint(x: x, y: fn(x))); x += 16 }
        p.line(to: NSPoint(x: W, y: fn(W)))
        p.line(to: NSPoint(x: W, y: 0))
        p.close()
        color.setFill()
        p.fill()
    }

    static func pines(_ fn: (CGFloat) -> CGFloat, _ color: NSColor, count: Int,
                      hMin: CGFloat, hMax: CGFloat, _ rng: inout SplitMix64) {
        color.setFill()
        for _ in 0..<count {
            let x = CGFloat.random(in: -40...(W + 40), using: &rng)
            let h = CGFloat.random(in: hMin...hMax, using: &rng)
            let w = h * 0.34
            let y = fn(x) - 6
            for tier in 0..<4 {
                let t = CGFloat(tier)
                let ty = y + h * (0.12 + t * 0.2)
                let tw = w * (1.0 - t * 0.2)
                let p = NSBezierPath()
                p.move(to: NSPoint(x: x - tw, y: ty))
                p.line(to: NSPoint(x: x, y: ty + h * 0.34))
                p.line(to: NSPoint(x: x + tw, y: ty))
                p.close()
                p.fill()
            }
            NSBezierPath(rect: NSRect(x: x - h * 0.02, y: y, width: h * 0.04, height: h * 0.15)).fill()
        }
    }

    static func roundTrees(_ fn: (CGFloat) -> CGFloat, colors: [NSColor], count: Int,
                           hMin: CGFloat, hMax: CGFloat, _ rng: inout SplitMix64) {
        for _ in 0..<count {
            let x = CGFloat.random(in: 0...W, using: &rng)
            let h = CGFloat.random(in: hMin...hMax, using: &rng)
            let y = fn(x) - 4
            rgb(0.16, 0.08, 0.05).setFill()
            NSBezierPath(rect: NSRect(x: x - h * 0.03, y: y, width: h * 0.06, height: h * 0.45)).fill()
            colors[Int.random(in: 0..<colors.count, using: &rng)].setFill()
            for _ in 0..<6 {
                let cx = x + CGFloat.random(in: -h * 0.22...h * 0.22, using: &rng)
                let cy = y + h * CGFloat.random(in: 0.45...0.85, using: &rng)
                let r = h * CGFloat.random(in: 0.16...0.26, using: &rng)
                NSBezierPath(ovalIn: NSRect(x: cx - r, y: cy - r, width: r * 2, height: r * 2)).fill()
            }
        }
    }

    // scenes
    static func drawSnow(_ full: NSRect, _ rng: inout SplitMix64) {
        vgrad(full, [rgb(0.05, 0.09, 0.20), rgb(0.13, 0.25, 0.42), rgb(0.55, 0.70, 0.82)])
        dots(500, yMin: H * 0.45, yMax: H, rMin: 1.2, rMax: 3.2, color: .white, aMin: 0.4, aMax: 0.95, &rng)
        let moon = CGPoint(x: W * 0.74, y: H * 0.78)
        glow(moon, 520, rgb(0.85, 0.93, 1), 0.35)
        rgb(0.95, 0.97, 1).setFill()
        NSBezierPath(ovalIn: NSRect(x: moon.x - 90, y: moon.y - 90, width: 180, height: 180)).fill()
        let far = hillFn(H * 0.30, 110, 0.0013, 1.0)
        fillHill(far, rgb(0.62, 0.74, 0.86))
        pines(far, rgb(0.18, 0.30, 0.45), count: 90, hMin: 150, hMax: 260, &rng)
        let mid = hillFn(H * 0.20, 90, 0.0017, 2.2)
        fillHill(mid, rgb(0.82, 0.89, 0.95))
        pines(mid, rgb(0.08, 0.15, 0.27), count: 55, hMin: 260, hMax: 420, &rng)
        fillHill(hillFn(H * 0.09, 60, 0.0021, 4.0), rgb(0.95, 0.97, 1))
        dots(900, yMin: 0, yMax: H, rMin: 1.5, rMax: 4.5, color: .white, aMin: 0.3, aMax: 0.8, &rng)
    }

    static func drawRain(_ full: NSRect, _ rng: inout SplitMix64) {
        vgrad(full, [rgb(0.07, 0.10, 0.14), rgb(0.12, 0.20, 0.26), rgb(0.22, 0.34, 0.40)])
        let bokeh = [rgb(1, 0.8, 0.5), rgb(0.6, 0.85, 1), rgb(1, 0.6, 0.6)]
        for _ in 0..<70 {
            let c = CGPoint(x: CGFloat.random(in: 0...W, using: &rng), y: CGFloat.random(in: 0...(H * 0.6), using: &rng))
            glow(c, CGFloat.random(in: 40...160, using: &rng),
                 bokeh[Int.random(in: 0..<bokeh.count, using: &rng)],
                 CGFloat.random(in: 0.10...0.22, using: &rng))
        }
        rgb(0.04, 0.06, 0.09).setFill()
        var x: CGFloat = 0
        while x < W {
            let bw = CGFloat.random(in: 90...240, using: &rng)
            let bh = CGFloat.random(in: 260...900, using: &rng)
            NSBezierPath(rect: NSRect(x: x, y: 0, width: bw, height: bh)).fill()
            rgb(1, 0.85, 0.5, 0.55).setFill()
            var wy: CGFloat = 40
            while wy < bh - 30 {
                var wx: CGFloat = x + 14
                while wx < x + bw - 24 {
                    if CGFloat.random(in: 0...1, using: &rng) < 0.28 {
                        NSBezierPath(rect: NSRect(x: wx, y: wy, width: 12, height: 18)).fill()
                    }
                    wx += 30
                }
                wy += 44
            }
            rgb(0.04, 0.06, 0.09).setFill()
            x += bw + CGFloat.random(in: 0...20, using: &rng)
        }
        for _ in 0..<700 {
            let sx = CGFloat.random(in: 0...W, using: &rng)
            let sy = CGFloat.random(in: 0...H, using: &rng)
            let p = NSBezierPath()
            p.move(to: NSPoint(x: sx, y: sy))
            p.line(to: NSPoint(x: sx - 18, y: sy - 120))
            p.lineWidth = 1.5
            NSColor.white.withAlphaComponent(CGFloat.random(in: 0.08...0.2, using: &rng)).setStroke()
            p.stroke()
        }
    }

    static func drawAutumn(_ full: NSRect, _ rng: inout SplitMix64) {
        vgrad(full, [rgb(0.35, 0.12, 0.12), rgb(0.85, 0.40, 0.15), rgb(0.98, 0.78, 0.40)])
        let sun = CGPoint(x: W * 0.3, y: H * 0.32)
        glow(sun, 700, rgb(1, 0.9, 0.6), 0.6)
        rgb(1, 0.95, 0.75).setFill()
        NSBezierPath(ovalIn: NSRect(x: sun.x - 110, y: sun.y - 110, width: 220, height: 220)).fill()
        let h1 = hillFn(H * 0.30, 120, 0.0012, 0.4)
        fillHill(h1, rgb(0.62, 0.28, 0.12))
        let warm = [rgb(0.85, 0.35, 0.10), rgb(0.78, 0.18, 0.10), rgb(0.95, 0.65, 0.15)]
        roundTrees(h1, colors: warm, count: 30, hMin: 120, hMax: 240, &rng)
        let h2 = hillFn(H * 0.19, 100, 0.0016, 2.0)
        fillHill(h2, rgb(0.45, 0.18, 0.08))
        roundTrees(h2, colors: warm, count: 22, hMin: 220, hMax: 380, &rng)
        fillHill(hillFn(H * 0.08, 60, 0.002, 3.5), rgb(0.28, 0.10, 0.06))
        for c in warm {
            dots(90, yMin: 0, yMax: H * 0.7, rMin: 5, rMax: 12, color: c, aMin: 0.5, aMax: 0.95, &rng)
        }
    }

    static func drawFireflies(_ full: NSRect, _ rng: inout SplitMix64) {
        vgrad(full, [rgb(0.02, 0.05, 0.07), rgb(0.04, 0.14, 0.12), rgb(0.07, 0.22, 0.15)])
        let h1 = hillFn(H * 0.28, 110, 0.0014, 0.8)
        fillHill(h1, rgb(0.03, 0.09, 0.08))
        pines(h1, rgb(0.015, 0.06, 0.055), count: 120, hMin: 260, hMax: 520, &rng)
        let h2 = hillFn(H * 0.10, 70, 0.002, 2.9)
        fillHill(h2, rgb(0.01, 0.04, 0.04))
        for _ in 0..<150 {
            let c = CGPoint(x: CGFloat.random(in: 0...W, using: &rng), y: CGFloat.random(in: (H * 0.05)...(H * 0.75), using: &rng))
            glow(c, CGFloat.random(in: 20...60, using: &rng), rgb(0.85, 1, 0.4), 0.45)
            let r = CGFloat.random(in: 3...5, using: &rng)
            rgb(1, 1, 0.8).setFill()
            NSBezierPath(ovalIn: NSRect(x: c.x - r, y: c.y - r, width: r * 2, height: r * 2)).fill()
        }
    }

    static func drawStars(_ full: NSRect, _ rng: inout SplitMix64) {
        vgrad(full, [rgb(0.02, 0.02, 0.08), rgb(0.11, 0.07, 0.25), rgb(0.35, 0.18, 0.42)])
        for _ in 0..<2500 {
            let t = CGFloat.random(in: 0...1, using: &rng)
            let off = (CGFloat.random(in: -1...1, using: &rng) + CGFloat.random(in: -1...1, using: &rng)) * 300
            let x = t * W + off * 0.4
            let y = H * 0.35 + t * H * 0.45 + off
            let r = CGFloat.random(in: 0.8...2.2, using: &rng)
            NSColor.white.withAlphaComponent(CGFloat.random(in: 0.05...0.4, using: &rng)).setFill()
            NSBezierPath(ovalIn: NSRect(x: x - r, y: y - r, width: r * 2, height: r * 2)).fill()
        }
        dots(600, yMin: H * 0.2, yMax: H, rMin: 1, rMax: 3, color: .white, aMin: 0.4, aMax: 1, &rng)
        for _ in 0..<40 {
            let c = CGPoint(x: CGFloat.random(in: 0...W, using: &rng), y: CGFloat.random(in: (H * 0.3)...H, using: &rng))
            glow(c, CGFloat.random(in: 18...40, using: &rng), rgb(0.85, 0.9, 1), 0.5)
            rgb(1, 1, 1).setFill()
            NSBezierPath(ovalIn: NSRect(x: c.x - 3, y: c.y - 3, width: 6, height: 6)).fill()
        }
        fillHill(hillFn(H * 0.20, 160, 0.0011, 0.5), rgb(0.05, 0.04, 0.13))
        fillHill(hillFn(H * 0.12, 110, 0.0016, 2.1), rgb(0.02, 0.02, 0.07))
    }
}

// MARK: - Power

func onBatteryPower() -> Bool {
    guard let snap = IOPSCopyPowerSourcesInfo()?.takeRetainedValue(),
          let type = IOPSGetProvidingPowerSourceType(snap)?.takeUnretainedValue() else { return false }
    return (type as String) == kIOPSBatteryPowerValue
}

// MARK: - App controller

final class AppController: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var statusItem: NSStatusItem!
    private var overlays: [OverlayWindow] = []
    private var effectItems: [NSMenuItem] = []
    private var intensityItems: [NSMenuItem] = []
    private var enabledItem: NSMenuItem!
    private var landItem: NSMenuItem!
    private var loginItem: NSMenuItem!
    private var permItem: NSMenuItem!
    private var timer: Timer?
    private var powerTimer: Timer?
    private let defaults = UserDefaults.standard

    private var effect: Effect
    private var intensity: Intensity
    private var enabled: Bool
    private var land: Bool
    private var saving = false
    private var dockList: CGRect? = nil          // Dock icon shelf, Cocoa global coordinates
    private var dockStamp: TimeInterval = 0

    override init() {
        effect = Effect(rawValue: defaults.string(forKey: "effect") ?? "") ?? .snow
        intensity = Intensity(rawValue: defaults.string(forKey: "intensity") ?? "") ?? .normal
        enabled = defaults.object(forKey: "enabled") as? Bool ?? true
        land = defaults.object(forKey: "land") as? Bool ?? true
        super.init()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        if !AXIsProcessTrusted() {
            let opts = [kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String: true] as CFDictionary
            _ = AXIsProcessTrustedWithOptions(opts)
        }
        buildMenu()
        refreshPower()
        rebuild()
        refreshMenu()

        let t = Timer(timeInterval: 1.0 / 30.0, target: self, selector: #selector(poll), userInfo: nil, repeats: true)
        RunLoop.main.add(t, forMode: .common)
        timer = t
        let pt = Timer(timeInterval: 15, target: self, selector: #selector(powerTick), userInfo: nil, repeats: true)
        RunLoop.main.add(pt, forMode: .common)
        powerTimer = pt

        NotificationCenter.default.addObserver(self, selector: #selector(screensChanged),
            name: NSApplication.didChangeScreenParametersNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(powerTick),
            name: NSNotification.Name.NSProcessInfoPowerStateDidChange, object: nil)
        if CommandLine.arguments.contains("--selftest") { runSelfTest() }
        let ws = NSWorkspace.shared.notificationCenter
        ws.addObserver(self, selector: #selector(sleepScreens), name: NSWorkspace.screensDidSleepNotification, object: nil)
        ws.addObserver(self, selector: #selector(wakeScreens), name: NSWorkspace.screensDidWakeNotification, object: nil)
    }

    // MARK: Self-test (run with --selftest)

    private func runSelfTest() {
        print("SELFTEST accessibility trusted: \(AXIsProcessTrusted())")
        print("SELFTEST screens: \(NSScreen.screens.count), overlays: \(overlays.count)")
        for n in WallpaperFactory.names {
            let d = WallpaperFactory.render(n)
            print("SELFTEST wallpaper \(n): \((d?.count ?? 0) / 1024) KB")
        }
        fflush(stdout)
        let order = Effect.allCases
        var idx = 0
        intensity = .heavy
        effect = order[0]
        applySettings()
        let t = Timer.scheduledTimer(withTimeInterval: 4, repeats: true) { [self] _ in
            refreshDockIfNeeded()
            let st = overlays.first?.scene.debugStats() ?? "no overlay"
            print("SELFTEST \(effect.title): \(st) dock=\(String(describing: dockList))")
            fflush(stdout)
            idx += 1
            if idx >= order.count { exit(0) }
            effect = order[idx]
            applySettings()
        }
        RunLoop.main.add(t, forMode: .common)
    }

    // MARK: Menu

    private func item(_ title: String, _ action: Selector?, key: String = "") -> NSMenuItem {
        let it = NSMenuItem(title: title, action: action, keyEquivalent: key)
        it.target = self
        return it
    }

    private func buildMenu() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        let menu = NSMenu()

        let header = NSMenuItem(title: "SnowDesk", action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)
        menu.addItem(.separator())

        for e in Effect.allCases {
            let it = item(e.title, #selector(pickEffect(_:)))
            it.representedObject = e.rawValue
            it.image = NSImage(systemSymbolName: e.symbol, accessibilityDescription: nil)
            effectItems.append(it)
            menu.addItem(it)
        }
        menu.addItem(.separator())

        let wp = NSMenuItem(title: "Wallpapers", action: nil, keyEquivalent: "")
        let wpMenu = NSMenu()
        for n in WallpaperFactory.names {
            let it = item(n, #selector(pickWallpaper(_:)))
            it.representedObject = n
            wpMenu.addItem(it)
        }
        wpMenu.addItem(.separator())
        wpMenu.addItem(item("Restore original wallpaper", #selector(restoreWallpaper)))
        wp.submenu = wpMenu
        menu.addItem(wp)

        let inten = NSMenuItem(title: "Intensity", action: nil, keyEquivalent: "")
        let intenMenu = NSMenu()
        for i in Intensity.allCases {
            let it = item(i.title, #selector(pickIntensity(_:)))
            it.representedObject = i.rawValue
            intensityItems.append(it)
            intenMenu.addItem(it)
        }
        inten.submenu = intenMenu
        menu.addItem(inten)

        landItem = item("Land on windows", #selector(toggleLand))
        menu.addItem(landItem)
        loginItem = item("Launch at login", #selector(toggleLogin))
        menu.addItem(loginItem)
        permItem = item("Allow Dock access…", #selector(openAccessibility))
        menu.addItem(permItem)
        menu.addItem(.separator())

        enabledItem = item("Pause weather", #selector(toggleEnabled), key: "p")
        menu.addItem(enabledItem)
        menu.addItem(item("Quit SnowDesk", #selector(quitApp), key: "q"))
        menu.delegate = self
        statusItem.menu = menu
    }

    private func refreshMenu() {
        for it in effectItems { it.state = (it.representedObject as? String) == effect.rawValue ? .on : .off }
        for it in intensityItems { it.state = (it.representedObject as? String) == intensity.rawValue ? .on : .off }
        landItem.state = land ? .on : .off
        enabledItem.title = enabled ? "Pause weather" : "Resume weather"
        statusItem.button?.image = NSImage(systemSymbolName: enabled ? effect.symbol : "pause.circle",
                                           accessibilityDescription: "SnowDesk")
    }

    @objc private func pickEffect(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let e = Effect(rawValue: raw) else { return }
        effect = e
        defaults.set(raw, forKey: "effect")
        applySettings()
        refreshMenu()
    }

    @objc private func pickIntensity(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let i = Intensity(rawValue: raw) else { return }
        intensity = i
        defaults.set(raw, forKey: "intensity")
        applySettings()
        refreshMenu()
    }

    @objc private func toggleLand() {
        land.toggle()
        defaults.set(land, forKey: "land")
        applySettings()
        refreshMenu()
    }

    @objc private func toggleEnabled() {
        enabled.toggle()
        defaults.set(enabled, forKey: "enabled")
        rebuild()
        refreshMenu()
    }

    @objc private func quitApp() { NSApp.terminate(nil) }

    func menuNeedsUpdate(_ menu: NSMenu) {
        permItem.isHidden = AXIsProcessTrusted()
        loginItem.state = SMAppService.mainApp.status == .enabled ? .on : .off
    }

    @objc private func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled {
                try SMAppService.mainApp.unregister()
            } else {
                try SMAppService.mainApp.register()
            }
        } catch {
            NSSound.beep()
        }
    }

    @objc private func openAccessibility() {
        if let url = URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility") {
            NSWorkspace.shared.open(url)
        }
    }

    // MARK: Wallpapers

    private func screenKey(_ s: NSScreen) -> String {
        (s.deviceDescription[NSDeviceDescriptionKey("NSScreenNumber")] as? NSNumber)?.stringValue ?? "0"
    }

    private func saveOriginalWallpapersIfNeeded() {
        if defaults.dictionary(forKey: "origWallpapers") != nil { return }
        var dict: [String: String] = [:]
        for s in NSScreen.screens {
            if let url = NSWorkspace.shared.desktopImageURL(for: s) { dict[screenKey(s)] = url.absoluteString }
        }
        defaults.set(dict, forKey: "origWallpapers")
    }

    private func setWallpaper(_ url: URL, on screen: NSScreen) {
        let opts: [NSWorkspace.DesktopImageOptionKey: Any] = [
            .imageScaling: NSImageScaling.scaleProportionallyUpOrDown.rawValue,
            .allowClipping: true
        ]
        try? NSWorkspace.shared.setDesktopImageURL(url, for: screen, options: opts)
    }

    @objc private func pickWallpaper(_ sender: NSMenuItem) {
        guard let name = sender.representedObject as? String else { return }
        saveOriginalWallpapersIfNeeded()
        DispatchQueue.global(qos: .userInitiated).async {
            guard let url = WallpaperFactory.ensure(name) else { return }
            DispatchQueue.main.async {
                for s in NSScreen.screens { self.setWallpaper(url, on: s) }
            }
        }
    }

    @objc private func restoreWallpaper() {
        guard let dict = defaults.dictionary(forKey: "origWallpapers") as? [String: String] else { return }
        for s in NSScreen.screens {
            if let str = dict[screenKey(s)], let url = URL(string: str) { setWallpaper(url, on: s) }
        }
    }

    // MARK: Overlays & polling

    private func rebuild() {
        overlays.forEach { $0.orderOut(nil); $0.close() }
        overlays.removeAll()
        guard enabled else { return }
        for s in NSScreen.screens {
            let w = OverlayWindow(screen: s)
            overlays.append(w)
            w.orderFrontRegardless()
        }
        applySettings()
    }

    private func applySettings() {
        let density = intensity.factor * (saving ? 0.5 : 1.0)
        for w in overlays {
            w.scene.effect = effect
            w.scene.density = density
            w.scene.landOnWindows = land
        }
    }

    // MARK: Dock position (Accessibility API)

    private func refreshDockIfNeeded() {
        let now = CACurrentMediaTime()
        if now - dockStamp < 0.5 { return }
        dockStamp = now
        dockList = AXIsProcessTrusted() ? axDockRect() : estimatedDockRect()
    }

    private func axDockRect() -> CGRect? {
        guard let dock = NSRunningApplication.runningApplications(withBundleIdentifier: "com.apple.dock").first else {
            return nil
        }
        let app = AXUIElementCreateApplication(dock.processIdentifier)
        AXUIElementSetMessagingTimeout(app, 0.2)
        var kids: CFTypeRef?
        guard AXUIElementCopyAttributeValue(app, kAXChildrenAttribute as CFString, &kids) == .success,
              let arr = kids as? [AXUIElement] else { return nil }
        for el in arr {
            var role: CFTypeRef?
            AXUIElementCopyAttributeValue(el, kAXRoleAttribute as CFString, &role)
            guard (role as? String) == (kAXListRole as String) else { continue }
            var pos: CFTypeRef?
            var size: CFTypeRef?
            AXUIElementCopyAttributeValue(el, kAXPositionAttribute as CFString, &pos)
            AXUIElementCopyAttributeValue(el, kAXSizeAttribute as CFString, &size)
            var p = CGPoint.zero
            var sz = CGSize.zero
            guard let pv = pos, let sv = size,
                  AXValueGetValue(pv as! AXValue, .cgPoint, &p),
                  AXValueGetValue(sv as! AXValue, .cgSize, &sz) else { continue }
            let primaryH = NSScreen.screens.first?.frame.height ?? 0
            return CGRect(x: p.x, y: primaryH - p.y - sz.height, width: sz.width, height: sz.height)
        }
        return nil
    }

    // without Accessibility access, estimate the shelf from the Dock settings (less exact)
    private func estimatedDockRect() -> CGRect? {
        guard let d = UserDefaults(suiteName: "com.apple.dock"), let scr = NSScreen.main else { return nil }
        let tile = CGFloat((d.object(forKey: "tilesize") as? NSNumber)?.doubleValue ?? 64)
        let apps = (d.array(forKey: "persistent-apps") ?? []).count
        let others = (d.array(forKey: "persistent-others") ?? []).count
        let showRecents = (d.object(forKey: "show-recents") as? Bool) ?? true
        let recents = showRecents ? min(5, (d.array(forKey: "recent-apps") ?? []).count) : 0
        let pitch = tile * 1.18
        let count = CGFloat(apps + others + recents + 1)
        let dividers: CGFloat = 1 + (recents > 0 ? 1 : 0)
        let w = count * pitch + dividers * 36
        let f = scr.frame
        return CGRect(x: f.midX - w / 2, y: f.minY + 10, width: w, height: 73)
    }

    private func dockShelf(for screen: NSScreen) -> CGRect? {
        guard let l = dockList, l.width > l.height else { return nil }       // bottom Dock only
        let sf = screen.frame
        guard l.midX >= sf.minX, l.midX <= sf.maxX, l.midY >= sf.minY, l.midY <= sf.maxY else { return nil }
        guard screen.visibleFrame.minY - sf.minY > 20 else { return nil }    // Dock hidden: no shelf
        return CGRect(x: l.minX + 22, y: screen.visibleFrame.minY, width: max(100, l.width - 44), height: 1)
    }

    @objc private func poll() {
        guard enabled, !overlays.isEmpty else { return }
        refreshDockIfNeeded()
        let wins = currentWindows()
        for ow in overlays {
            let sf = ow.screenRef.frame
            let fullscreen = wins.contains {
                $0.rect.width >= sf.width - 2 && $0.rect.height >= sf.height - 2 && $0.rect.intersects(sf)
            }
            ow.setSuppressed(fullscreen)
            if fullscreen { continue }

            var surfaces: [Surface] = []
            for w in wins where w.rect.intersects(sf) {
                surfaces.append(Surface(id: w.id, rect: w.rect.offsetBy(dx: -sf.minX, dy: -sf.minY)))
            }
            // snow only lands on the Dock shelf itself, not along the whole screen edge
            if let shelf = dockShelf(for: ow.screenRef) {
                let groundY = ow.screenRef.visibleFrame.minY - sf.minY      // top of the Dock
                surfaces.append(Surface(id: WeatherScene.groundID,
                                        rect: CGRect(x: shelf.minX - sf.minX, y: groundY - 2000,
                                                     width: shelf.width, height: 2000)))
            }
            ow.scene.setSurfaces(surfaces)
        }
    }

    @objc private func screensChanged() { rebuild() }
    @objc private func sleepScreens() { overlays.forEach { $0.asleep = true } }
    @objc private func wakeScreens() { overlays.forEach { $0.asleep = false } }

    @objc private func powerTick() {
        refreshPower()
        applySettings()
    }

    private func refreshPower() {
        saving = ProcessInfo.processInfo.isLowPowerModeEnabled || onBatteryPower()
    }
}

// MARK: - Entry point

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let controller = AppController()
app.delegate = controller
app.run()
