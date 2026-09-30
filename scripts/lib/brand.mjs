/**
 * Dependency-free renderer for the World Time Buddy mark (clock over a timeline).
 * Shapes are evaluated as signed-distance fields, which gives smooth anti-aliased edges at any
 * size — 44px Store tiles and 2732px splash screens come from the same definition.
 *
 * The mark is authored in a 64×64 box matching src/ui/Logo.tsx; keep the two in sync.
 */
import zlib from 'node:zlib'

/* ---------- PNG encoding ---------- */

function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

/**
 * Encode RGBA pixels as PNG. With `alpha: false` the alpha channel is dropped entirely
 * (colour type 2) — required for the App Store icon, which must not contain transparency.
 */
export function encodePng({ width, height, rgba, alpha }) {
  const bpp = alpha ? 4 : 3
  const stride = 1 + width * bpp
  const raw = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * stride
    raw[rowStart] = 0 // filter: none
    for (let x = 0; x < width; x++) {
      const src = (y * width + x) * 4
      const dst = rowStart + 1 + x * bpp
      raw[dst] = rgba[src]
      raw[dst + 1] = rgba[src + 1]
      raw[dst + 2] = rgba[src + 2]
      if (alpha) raw[dst + 3] = rgba[src + 3]
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = alpha ? 6 : 2 // colour type: RGBA / RGB
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/* ---------- signed-distance shapes (in mark units, 64×64 box) ---------- */

const sdRoundRect = (px, py, cx, cy, hx, hy, r) => {
  const qx = Math.abs(px - cx) - (hx - r)
  const qy = Math.abs(py - cy) - (hy - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

const sdSegment = (px, py, ax, ay, bx, by) => {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)))
  return Math.hypot(pax - bax * h, pay - bay * h)
}

const sdRing = (px, py, cx, cy, radius) => Math.abs(Math.hypot(px - cx, py - cy) - radius)

/** Glyph layers, back to front. `sd` returns the distance (mark units) to the shape edge. */
const GLYPHS = [
  // Clock ring, stroke 4.
  { color: [255, 255, 255, 1], sd: (x, y) => sdRing(x, y, 32, 29, 17) - 2 },
  // Clock hands (round caps and joins fall out of the capsule distance).
  {
    color: [255, 255, 255, 1],
    sd: (x, y) => Math.min(sdSegment(x, y, 32, 19, 32, 29), sdSegment(x, y, 32, 29, 39, 33)) - 2
  },
  // Timeline: night, work, night.
  { color: [26, 42, 122, 0.55], sd: (x, y) => sdRoundRect(x, y, 18, 52.5, 6, 2.5, 2.5) },
  { color: [91, 224, 161, 1], sd: (x, y) => sdRoundRect(x, y, 32, 52.5, 6, 2.5, 2.5) },
  { color: [26, 42, 122, 0.55], sd: (x, y) => sdRoundRect(x, y, 46, 52.5, 6, 2.5, 2.5) }
]

export const BRAND = {
  gradient: [
    [91, 134, 255], // #5b86ff
    [35, 64, 201] // #2340c9
  ],
  splashLight: [244, 246, 250], // --bg (light)
  splashDark: [12, 17, 28] // --bg (dark)
}

const clamp01 = (v) => Math.max(0, Math.min(1, v))

/** Composite `top` (rgb + alpha 0–1) over the RGBA pixel at `i`. */
function over(px, i, [r, g, b], a) {
  if (a <= 0) return
  const dstA = px[i + 3] / 255
  const outA = a + dstA * (1 - a)
  if (outA <= 0) return
  px[i] = Math.round((r * a + px[i] * dstA * (1 - a)) / outA)
  px[i + 1] = Math.round((g * a + px[i + 1] * dstA * (1 - a)) / outA)
  px[i + 2] = Math.round((b * a + px[i + 2] * dstA * (1 - a)) / outA)
  px[i + 3] = Math.round(outA * 255)
}

/**
 * Render an image.
 *  - `background`: RGB fill for the whole canvas, or null for transparent.
 *  - `plate`: the gradient rounded square behind the glyphs ({x,y,w,h,radius}), or null.
 *  - `mark`: where the 64-unit glyph box lands on the canvas ({x,y,size}).
 */
export function render({ width, height, background = null, plate = null, mark }) {
  const rgba = new Uint8ClampedArray(width * height * 4)
  const scale = mark.size / 64
  const [c0, c1] = BRAND.gradient

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const cx = x + 0.5
      const cy = y + 0.5

      if (background) {
        rgba[i] = background[0]
        rgba[i + 1] = background[1]
        rgba[i + 2] = background[2]
        rgba[i + 3] = 255
      }

      if (plate) {
        const sd = sdRoundRect(
          cx,
          cy,
          plate.x + plate.w / 2,
          plate.y + plate.h / 2,
          plate.w / 2,
          plate.h / 2,
          plate.radius
        )
        const coverage = clamp01(0.5 - sd)
        if (coverage > 0) {
          const t = clamp01((cx - plate.x + (cy - plate.y)) / (plate.w + plate.h))
          const color = [
            c0[0] + (c1[0] - c0[0]) * t,
            c0[1] + (c1[1] - c0[1]) * t,
            c0[2] + (c1[2] - c0[2]) * t
          ]
          over(rgba, i, color, coverage)
        }
      }

      // Skip glyph maths outside the mark's box.
      const ux = (cx - mark.x) / scale
      const uy = (cy - mark.y) / scale
      if (ux < -1 || ux > 65 || uy < -1 || uy > 65) continue
      for (const glyph of GLYPHS) {
        const coverage = clamp01(0.5 - glyph.sd(ux, uy) * scale)
        if (coverage > 0) over(rgba, i, glyph.color, coverage * glyph.color[3])
      }
    }
  }
  return rgba
}

/* ---------- ready-made assets ---------- */

/** Rounded-square icon filling the canvas (Windows / Linux / generic). */
export function desktopIcon(size = 1024) {
  return encodePng({
    width: size,
    height: size,
    alpha: true,
    rgba: render({
      width: size,
      height: size,
      plate: { x: 0, y: 0, w: size, h: size, radius: size * (15 / 64) },
      mark: { x: 0, y: 0, size }
    })
  })
}

/** macOS icons sit on a ~10% transparent margin so they match the system's icon grid. */
export function macIcon(size = 1024) {
  const art = size * (824 / 1024)
  const off = (size - art) / 2
  return encodePng({
    width: size,
    height: size,
    alpha: true,
    rgba: render({
      width: size,
      height: size,
      plate: { x: off, y: off, w: art, h: art, radius: art * 0.2237 },
      mark: { x: off, y: off, size: art }
    })
  })
}

/** App Store icon: full-bleed square (iOS applies its own mask) and NO alpha channel. */
export function iosIcon(size = 1024) {
  return encodePng({
    width: size,
    height: size,
    alpha: false,
    rgba: render({
      width: size,
      height: size,
      background: BRAND.gradient[1],
      plate: { x: 0, y: 0, w: size, h: size, radius: 0 },
      mark: { x: 0, y: 0, size }
    })
  })
}

/** Square launch image: solid background with the logo centred. Aspect-fill crops the sides. */
export function splash(dark, size = 2732) {
  const logo = size * 0.22
  const off = (size - logo) / 2
  return encodePng({
    width: size,
    height: size,
    alpha: false,
    rgba: render({
      width: size,
      height: size,
      background: dark ? BRAND.splashDark : BRAND.splashLight,
      plate: { x: off, y: off, w: logo, h: logo, radius: logo * (15 / 64) },
      mark: { x: off, y: off, size: logo }
    })
  })
}

/** Microsoft Store tile: gradient fills the tile, glyph centred. */
export function storeTile(width, height) {
  const size = Math.min(width, height)
  return encodePng({
    width,
    height,
    alpha: false,
    rgba: render({
      width,
      height,
      background: BRAND.gradient[1],
      plate: { x: 0, y: 0, w: width, h: height, radius: 0 },
      mark: { x: (width - size) / 2, y: (height - size) / 2, size }
    })
  })
}
