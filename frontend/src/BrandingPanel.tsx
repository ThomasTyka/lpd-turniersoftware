import { useRef, useState } from 'react'
import { api } from './api'
import { BORDER, DANGER, SURFACE_2, TEXT_FAINT, TEXT_MUTED } from './theme'

/** RGB -> "#rrggbb". */
function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)))
  return `#${[clamp(r), clamp(g), clamp(b)].map((n) => n.toString(16).padStart(2, '0')).join('')}`
}

function hexDistance(a: string, b: string): number {
  const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  const [ar, ag, ab] = parse(a)
  const [br, bg, bb] = parse(b)
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2)
}

/**
 * Dominant-color extraction for "Farben aus dem Logo übernehmen" - draws
 * the image small (fast, and detail doesn't matter for a palette), then
 * buckets pixels by a coarsened RGB to find the most common distinct
 * colors. Near-white/near-black/gray pixels are skipped since logos are
 * usually mostly background/outline, not the brand color itself.
 */
function extractPaletteFromImage(img: HTMLImageElement, maxColors = 4): string[] {
  const canvas = document.createElement('canvas')
  const size = 64
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return []
  ctx.drawImage(img, 0, 0, size, size)

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(0, 0, size, size).data
  } catch {
    return []
  }

  const buckets = new Map<string, { count: number; r: number; g: number; b: number }>()
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    const a = data[i + 3]
    if (a < 128) continue
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const lightness = (max + min) / 2
    const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(2 * lightness - 255))
    if (lightness > 235 || lightness < 20 || saturation < 0.15) continue
    const key = `${Math.round(r / 24)}-${Math.round(g / 24)}-${Math.round(b / 24)}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.count++
      bucket.r += r
      bucket.g += g
      bucket.b += b
    } else {
      buckets.set(key, { count: 1, r, g, b })
    }
  }

  const sorted = [...buckets.values()].sort((a, b) => b.count - a.count)
  const colors: string[] = []
  for (const bucket of sorted) {
    const hex = rgbToHex(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count)
    if (colors.some((c) => hexDistance(c, hex) < 60)) continue
    colors.push(hex)
    if (colors.length >= maxColors) break
  }
  return colors
}

const swatchStyle: React.CSSProperties = {
  width: '2rem',
  height: '2rem',
  borderRadius: '0.4rem',
  border: `1px solid ${BORDER}`,
  cursor: 'pointer',
  padding: 0,
}

export function BrandingPanel({
  eventId,
  hasLogo,
  logoVersion,
  primaryColor,
  secondaryColor,
  onSaved,
}: {
  eventId: string
  hasLogo: boolean
  logoVersion: string | null
  primaryColor: string | null
  secondaryColor: string | null
  onSaved: () => void
}) {
  const [primary, setPrimary] = useState(primaryColor ?? '#000000')
  const [secondary, setSecondary] = useState(secondaryColor ?? '#000000')
  const [stagedFile, setStagedFile] = useState<File | null>(null)
  const [stagedPreviewUrl, setStagedPreviewUrl] = useState<string | null>(null)
  const [suggestedColors, setSuggestedColors] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [savingColors, setSavingColors] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const pickFile = (file: File) => {
    setError(null)
    setStagedFile(file)
    const url = URL.createObjectURL(file)
    setStagedPreviewUrl(url)

    const img = new Image()
    img.onload = () => setSuggestedColors(extractPaletteFromImage(img))
    img.src = url
  }

  const handleUpload = async () => {
    if (!stagedFile) return
    setUploading(true)
    setError(null)
    try {
      await api.uploadLogo(eventId, stagedFile)
      setStagedFile(null)
      if (stagedPreviewUrl) URL.revokeObjectURL(stagedPreviewUrl)
      setStagedPreviewUrl(null)
      setSuggestedColors([])
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  const handleSaveColors = async () => {
    setSavingColors(true)
    setError(null)
    try {
      await api.setBranding(eventId, primary, secondary)
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingColors(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: '1.2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div
          style={{
            width: '9rem',
            height: '9rem',
            borderRadius: '0.6rem',
            border: `1px solid ${BORDER}`,
            background: SURFACE_2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            flexShrink: 0,
          }}
        >
          {stagedPreviewUrl ? (
            <img src={stagedPreviewUrl} alt="Neues Logo (Vorschau)" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          ) : hasLogo ? (
            <img
              src={api.logoUrl(eventId, logoVersion)}
              alt="Kundenlogo"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
            />
          ) : (
            <span style={{ fontSize: '0.75rem', color: TEXT_FAINT, textAlign: 'center', padding: '0 0.6rem' }}>Kein Logo</span>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) pickFile(file)
              e.target.value = ''
            }}
          />
          <div style={{ display: 'flex', gap: '0.6rem' }}>
            <button type="button" onClick={() => fileInputRef.current?.click()}>
              {hasLogo || stagedFile ? 'Anderes Logo wählen' : 'Logo wählen'}
            </button>
            {stagedFile && (
              <button type="button" className="primary" onClick={handleUpload} disabled={uploading}>
                {uploading ? 'Wird hochgeladen…' : 'Hochladen'}
              </button>
            )}
          </div>
          {stagedFile && suggestedColors.length > 0 && (
            <div>
              <p style={{ margin: '0 0 0.4rem', fontSize: '0.75rem', color: TEXT_MUTED }}>Farben aus dem Logo übernehmen:</p>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {suggestedColors.map((color) => (
                  <button
                    key={color}
                    type="button"
                    title={`${color} als Schriftfarbe (Klick), Hintergrundfarbe (Umschalt+Klick)`}
                    style={{ ...swatchStyle, background: color }}
                    onClick={(e) => (e.shiftKey ? setSecondary(color) : setPrimary(color))}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', borderTop: `1px solid ${BORDER}`, paddingTop: '1.1rem' }}>
        <div style={{ display: 'flex', gap: '1.2rem' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
            Schriftfarbe
            <input type="color" value={primary} onChange={(e) => setPrimary(e.target.value)} />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }}>
            Hintergrundfarbe
            <input type="color" value={secondary} onChange={(e) => setSecondary(e.target.value)} />
          </label>
        </div>
        <button type="button" className="primary" onClick={handleSaveColors} disabled={savingColors} style={{ alignSelf: 'flex-start' }}>
          {savingColors ? 'Wird gespeichert…' : 'Farben speichern'}
        </button>
      </div>
    </div>
  )
}
