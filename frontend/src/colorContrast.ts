function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const num = parseInt(full, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  switch (max) {
    case rn:
      h = (gn - bn) / d + (gn < bn ? 6 : 0)
      break
    case gn:
      h = (bn - rn) / d + 2
      break
    default:
      h = (rn - gn) / d + 4
  }
  return [h * 60, s, l]
}

function hslToHex(h: number, s: number, l: number): string {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r0, g0, b0] =
    h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  const toHex = (v: number) =>
    Math.round((v + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(r0)}${toHex(g0)}${toHex(b0)}`
}

/** WCAG relative luminance, https://www.w3.org/TR/WCAG21/#dfn-relative-luminance */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const cs = c / 255
    return cs <= 0.03928 ? cs / 12.92 : ((cs + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio, from 1 (no contrast) to 21 (black on white). */
export function contrastRatio(hexA: string, hexB: string): number {
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * Returns `text` unchanged if it already reads clearly on `background`
 * (WCAG AA large-text threshold, 4.5:1 - these displays are read from
 * across a room, so the same bar as body text elsewhere is enough).
 * Otherwise nudges `text`'s lightness toward black or white (whichever
 * direction the background needs) in small steps until the ratio clears
 * the threshold, keeping its hue/saturation - and therefore its brand
 * character - intact. Used for unattended Leinwand/board displays, where
 * nobody is present to notice or fix an unreadable color combination.
 */
export function ensureReadableText(background: string, text: string, minRatio = 4.5): string {
  if (contrastRatio(background, text) >= minRatio) return text

  const [h, s, l] = rgbToHsl(...hexToRgb(text))
  const towardWhite = relativeLuminance(background) < 0.5
  const step = towardWhite ? 0.04 : -0.04
  let candidateL = l
  for (let i = 0; i < 25; i++) {
    candidateL = Math.max(0, Math.min(1, candidateL + step))
    const candidate = hslToHex(h, s, candidateL)
    if (contrastRatio(background, candidate) >= minRatio) return candidate
    if (candidateL === 0 || candidateL === 1) break
  }
  return towardWhite ? '#ffffff' : '#000000'
}
