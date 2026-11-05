import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { API_BASE_URL } from './api'

/**
 * The LAN-reachable origin a QR code must encode - localhost/127.0.0.1 (what
 * the Regie's own browser is on) is meaningless to a phone scanning the
 * code, so this resolves the server's actual LAN address once and caches it
 * for the component's lifetime. Shared by every place that builds a
 * pairing QR (Tablet picker, Monitor's own board QR).
 */
export function useServerOrigin(): string | null {
  const [serverOrigin, setServerOrigin] = useState(() => {
    const origin = window.location.origin
    return /^https?:\/\/(localhost|127\.0\.0\.1)([:/]|$)/.test(origin) ? null : origin
  })

  useEffect(() => {
    if (serverOrigin) return
    fetch(`${API_BASE_URL}/api/server-info`)
      .then((r) => r.json())
      .then((info: { lanAddress: string | null }) => {
        if (info.lanAddress) setServerOrigin(`http://${info.lanAddress}:${window.location.port}`)
      })
      .catch(() => {})
  }, [serverOrigin])

  return serverOrigin
}

/**
 * Renders a scannable QR code for a URL - used for Tablet/Monitor pairing
 * (project plan: "QR-Code-Pairing") so a device can jump straight to the
 * right pairing screen instead of the URL being typed in by hand.
 */
export function QrCode({ value, size = 180, style }: { value: string; size?: number; style?: React.CSSProperties }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (!cancelled) setDataUrl(url)
      })
      .catch(() => {
        if (!cancelled) setDataUrl(null)
      })
    return () => {
      cancelled = true
    }
  }, [value, size])

  if (!dataUrl) return <div style={{ width: size, height: size, ...style }} />

  return <img src={dataUrl} alt={`QR-Code: ${value}`} width={size} height={size} style={{ width: size, height: size, ...style }} />
}
