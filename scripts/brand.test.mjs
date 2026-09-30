import { describe, expect, it } from 'vitest'
import zlib from 'node:zlib'
import { desktopIcon, encodePng, iosIcon, macIcon, render, splash, storeTile } from './lib/brand.mjs'

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
