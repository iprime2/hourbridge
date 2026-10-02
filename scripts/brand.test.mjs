import { describe, expect, it } from 'vitest'
import zlib from 'node:zlib'
import {
  appleTouchIcon,
  BRAND,
  appxTilePlan,
  desktopIcon,
  encodePng,
  iosIcon,
  macIcon,
  render,
  renderAppxTile,
  splash,
  storeTile,
  webIcon
} from './lib/brand.mjs'

/** Minimal PNG reader: enough to check header fields and pixels of our own (filter-0) output. */
function decode(png) {
  expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  let offset = 8
  let ihdr
  const idat = []
  while (offset < png.length) {
    const len = png.readUInt32BE(offset)
    const type = png.toString('ascii', offset + 4, offset + 8)
    const data = png.subarray(offset + 8, offset + 8 + len)
    if (type === 'IHDR') ihdr = data
    if (type === 'IDAT') idat.push(data)
    offset += 12 + len
  }
  const width = ihdr.readUInt32BE(0)
  const height = ihdr.readUInt32BE(4)
  const colorType = ihdr[9]
  const bpp = colorType === 6 ? 4 : 3
  const raw = zlib.inflateSync(Buffer.concat(idat))
  const stride = 1 + width * bpp
  const pixel = (x, y) => {
    expect(raw[y * stride]).toBe(0) // we only emit filter type 0
    const i = y * stride + 1 + x * bpp
    return { r: raw[i], g: raw[i + 1], b: raw[i + 2], a: bpp === 4 ? raw[i + 3] : 255 }
  }
  return { width, height, colorType, pixel }
}

describe('brand renderer', () => {
  it('encodes valid PNGs with the requested colour type', () => {
    const rgba = new Uint8ClampedArray(4 * 4 * 4).fill(255)
    expect(decode(encodePng({ width: 4, height: 4, rgba, alpha: true })).colorType).toBe(6)
    expect(decode(encodePng({ width: 4, height: 4, rgba, alpha: false })).colorType).toBe(2)
  })

  it('makes the App Store icon 1024² with no alpha channel and no transparent corners', () => {
    const icon = decode(iosIcon())
    expect([icon.width, icon.height]).toEqual([1024, 1024])
    expect(icon.colorType).toBe(2) // RGB: Apple rejects icons that carry an alpha channel
    // Full-bleed: the very corners are painted with the brand gradient, not left empty.
    for (const [x, y] of [[0, 0], [1023, 0], [0, 1023], [1023, 1023]]) {
      const { r, g, b } = icon.pixel(x, y)
      expect(r + g + b).toBeGreaterThan(0)
    }
  })

  it('rounds the desktop icon and insets the macOS one', () => {
    const desktop = decode(desktopIcon())
    expect(desktop.colorType).toBe(6)
    expect(desktop.pixel(0, 0).a).toBe(0) // rounded corner is transparent
    expect(desktop.pixel(512, 100).a).toBe(255) // body is opaque

    const mac = decode(macIcon())
    expect(mac.pixel(20, 512).a).toBe(0) // margin around the art
    expect(mac.pixel(512, 512).a).toBeGreaterThan(0)
  })

  it('draws the white clock ring and the green "work" bar where the logo says', () => {
    const size = 256
    const rgba = render({
      width: size,
      height: size,
      plate: { x: 0, y: 0, w: size, h: size, radius: 0 },
      mark: { x: 0, y: 0, size }
    })
    const at = (ux, uy) => {
      const i = (Math.floor((uy / 64) * size) * size + Math.floor((ux / 64) * size)) * 4
      return [rgba[i], rgba[i + 1], rgba[i + 2]]
    }
    expect(at(32, 12)).toEqual([255, 255, 255]) // top of the clock ring (32,29 r17 → y=12)
    const green = at(32, 52.5) // centre timeline bar
    expect(green[1]).toBeGreaterThan(200)
    expect(green[0]).toBeLessThan(120)
    const inside = at(22, 29) // clock face interior shows the gradient, not white
    expect(inside).not.toEqual([255, 255, 255])
  })

  it('centres the splash logo on a solid, theme-matched background', () => {
    const light = decode(splash(false, 512))
    const dark = decode(splash(true, 512))
    expect(light.colorType).toBe(2)
    expect(light.pixel(2, 2)).toEqual({ r: 244, g: 246, b: 250, a: 255 })
    expect(dark.pixel(2, 2)).toEqual({ r: 12, g: 17, b: 28, a: 255 })
    // Logo plate sits in the middle: not the background colour.
    expect(light.pixel(256, 256)).not.toEqual(light.pixel(2, 2))
  })

  it('produces Store tiles at exact sizes', () => {
    for (const [w, h] of [[44, 44], [50, 50], [150, 150], [310, 150]]) {
      const tile = decode(storeTile(w, h))
      expect([tile.width, tile.height]).toEqual([w, h])
      expect(tile.colorType).toBe(2)
    }
  })
})

describe('Microsoft Store tile plan', () => {
  const plan = appxTilePlan()
  const size = (file) => {
    const t = plan.find((p) => p.file === file)
    return t ? [t.width, t.height] : undefined
  }

  it("matches Microsoft's published pixel sizes for every scale", () => {
    // https://learn.microsoft.com/windows/apps/design/style/iconography/app-icon-construction
    const table = {
      'Square44x44Logo': [44, 55, 66, 88, 176],
      'Square150x150Logo': [150, 188, 225, 300, 600],
      'StoreLogo': [50, 63, 75, 100, 200]
    }
    for (const [name, sizes] of Object.entries(table)) {
      ;[100, 125, 150, 200, 400].forEach((scale, i) => {
        expect(size(`${name}.scale-${scale}.png`), `${name} @${scale}%`).toEqual([sizes[i], sizes[i]])
      })
    }
    expect([100, 125, 150, 200, 400].map((s) => size(`Wide310x150Logo.scale-${s}.png`))).toEqual([
      [310, 150],
      [388, 188],
      [465, 225],
      [620, 300],
      [1240, 600]
    ])
  })

  it('provides every taskbar target size, plated and unplated', () => {
    for (const s of [16, 24, 32, 48, 256]) {
      expect(size(`Square44x44Logo.targetsize-${s}.png`)).toEqual([s, s])
      expect(size(`Square44x44Logo.targetsize-${s}_altform-unplated.png`)).toEqual([s, s])
    }
  })

  it('never emits a bare-named tile, which would compete with its scale-100 sibling', () => {
    expect(plan.every((t) => /\.(scale|targetsize)-\d+/.test(t.file))).toBe(true)
    expect(plan.some((t) => /^(StoreLogo|Square\d+x\d+Logo|Wide\d+x\d+Logo)\.png$/.test(t.file))).toBe(false)
  })

  it('has unique file names and covers the four assets the manifest references', () => {
    const files = plan.map((t) => t.file)
    expect(new Set(files).size).toBe(files.length)
    for (const base of ['StoreLogo', 'Square44x44Logo', 'Square150x150Logo', 'Wide310x150Logo']) {
      expect(files.some((f) => f.startsWith(`${base}.`)), base).toBe(true)
    }
  })

  it('renders plated tiles opaque and unplated ones with transparent corners', () => {
    const plated = decode(renderAppxTile(plan.find((t) => t.file === 'Square44x44Logo.targetsize-256.png')))
    expect(plated.colorType).toBe(2) // RGB: no alpha, the plate is the tile
    const unplated = decode(
      renderAppxTile(plan.find((t) => t.file === 'Square44x44Logo.targetsize-256_altform-unplated.png'))
    )
    expect(unplated.colorType).toBe(6)
    expect(unplated.pixel(0, 0).a).toBe(0)
    expect(unplated.pixel(128, 128).a).toBe(255)
  })

  it('renders every planned tile at exactly its planned size', () => {
    for (const tile of plan) {
      const img = decode(renderAppxTile(tile))
      expect([img.width, img.height], tile.file).toEqual([tile.width, tile.height])
    }
  })
})


describe('web app (PWA) icons', () => {
  it('draws ordinary icons rounded, with transparent corners', () => {
    for (const size of [192, 512]) {
      const icon = decode(webIcon(size))
      expect([icon.width, icon.height]).toEqual([size, size])
      expect(icon.colorType).toBe(6)
      expect(icon.pixel(0, 0).a).toBe(0)
      expect(icon.pixel(size / 2, size / 2).a).toBe(255)
    }
  })

  it('draws the Apple touch icon opaque and full-bleed (iOS applies its own mask)', () => {
    const icon = decode(appleTouchIcon())
    expect([icon.width, icon.height]).toEqual([180, 180])
    expect(icon.colorType).toBe(2)
    expect(icon.pixel(0, 0)).toMatchObject({ a: 255 })
  })

  /**
   * Distance from the centre of the farthest pixel that is part of the mark. Every pixel is compared
   * with the exact background gradient expected at that spot, so *any* mark pixel counts — including
   * the dark corner bars, which a colour test for "white or green" would miss.
   */
  function farthestMarkPixel(icon, size) {
    const [c0, c1] = BRAND.gradient
    let farthest = 0
    let markPixels = 0
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const t = (x + 0.5 + y + 0.5) / (size + size)
        const { r, g, b } = icon.pixel(x, y)
        const differs =
          Math.abs(r - (c0[0] + (c1[0] - c0[0]) * t)) > 8 ||
          Math.abs(g - (c0[1] + (c1[1] - c0[1]) * t)) > 8 ||
          Math.abs(b - (c0[2] + (c1[2] - c0[2]) * t)) > 8
        if (differs) {
          markPixels++
          farthest = Math.max(farthest, Math.hypot(x + 0.5 - size / 2, y + 0.5 - size / 2))
        }
      }
    }
    return { farthest, markPixels }
  }

  it('keeps the whole mark inside the maskable safe zone (a circle of 40% of the width)', () => {
    const size = 512
    const icon = decode(webIcon(size, { maskable: true }))
    expect(icon.colorType).toBe(2) // full-bleed, no transparency for the OS to mask around
    const { farthest, markPixels } = farthestMarkPixel(icon, size)
    expect(markPixels).toBeGreaterThan(5000) // we really did find the mark
    expect(farthest).toBeLessThanOrEqual(0.4 * size)
  })

  it('would fail that check for a mark at full size (the test has teeth)', () => {
    const size = 512
    const { farthest } = farthestMarkPixel(decode(appleTouchIcon(size)), size)
    // At full size the dark corner bars reach well outside the safe circle.
    expect(farthest).toBeGreaterThan(0.4 * size)
  })
})
