import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'

const css = readFileSync(join(__dirname, 'tokens.css'), 'utf8')

/** Extract `--name: value` declarations from the block that starts at `selector {`. */
function declarations(selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  if (start === -1) throw new Error(`selector not found: ${selector}`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const body = css.slice(open + 1, close)
  const out: Record<string, string> = {}
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim()
  return out
}

// The dark palette exists twice (OS preference + explicit override) because plain CSS can't share it.
describe('design tokens', () => {
  const light = declarations(':root {')
  const darkAuto = declarations(":root:not([data-theme='light']) {")
  const darkForced = declarations(":root[data-theme='dark'] {")

  it('keeps the two dark blocks identical', () => {
    expect(darkAuto).toEqual(darkForced)
  })

  it('overrides only colors/shadows in dark, never the shared scale', () => {
    for (const name of Object.keys(darkAuto)) {
      expect(light[name], `${name} must exist in the light theme`).toBeDefined()
    }
    for (const name of ['--font-sans', '--radius-sm', '--radius-md', '--radius-lg']) {
      expect(darkAuto[name]).toBeUndefined()
    }
  })

  it('defines every color token in both themes', () => {
    const required = [
      '--bg', '--surface', '--surface-sunken', '--border', '--text', '--text-muted',
      '--accent', '--accent-contrast', '--danger', '--focus', '--work-bg', '--work-fg',
      '--work-bar', '--awake-bg', '--awake-fg', '--night-bg', '--night-fg', '--night-edge',
      '--sel', '--sel-inner', '--now', '--now-fg'
    ]
    for (const name of required) {
      expect(light[name], `light ${name}`).toBeDefined()
      expect(darkAuto[name], `dark ${name}`).toBeDefined()
    }
  })

  // WCAG 2.x contrast, computed from the actual values in the file.
  const channel = (c: number): number => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const luminance = (hex: string): number => {
    const n = parseInt(hex.slice(1), 16)
    return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255)
  }
  const ratio = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (hi + 0.05) / (lo + 0.05)
  }

  const textPairs: [string, string][] = [
    ['--text', '--bg'],
    ['--text', '--surface'],
    ['--text-muted', '--bg'],
    ['--text-muted', '--surface'],
    ['--text-muted', '--surface-sunken'],
    ['--accent', '--surface'],
    ['--accent-contrast', '--accent'],
    ['--accent', '--accent-soft'],
    ['--danger', '--surface'],
    ['--danger', '--danger-soft'],
    ['--work-fg', '--work-bg'],
    ['--awake-fg', '--awake-bg'],
    ['--night-fg', '--night-bg'],
    ['--now-fg', '--now']
  ]

  for (const [label, theme] of [['light', light], ['dark', darkAuto]] as const) {
    const value = (name: string): string => theme[name] ?? light[name]

    it(`meets WCAG AA (4.5:1) for text pairs in ${label}`, () => {
      for (const [fg, bg] of textPairs) {
        expect(ratio(value(fg), value(bg)), `${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    })

    it(`meets 3:1 for the work bar on its tile in ${label}`, () => {
      expect(ratio(value('--work-bar'), value('--work-bg'))).toBeGreaterThanOrEqual(3)
    })

    it(`keeps a selection ring visible on every tile in ${label} (one of two rings ≥ 3:1)`, () => {
      for (const tile of ['--work-bg', '--awake-bg', '--night-bg']) {
        const best = Math.max(ratio(value('--sel'), value(tile)), ratio(value('--sel-inner'), value(tile)))
        expect(best, `ring on ${tile}`).toBeGreaterThanOrEqual(3)
      }
    })
  }
})
