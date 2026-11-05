import { useEffect, useState } from 'react'
import { DeviceConflictError, WrongPinError, api, type DevicePairing as Pairing, type DeviceType, type EventBranding } from './api'
import logo from './assets/logo-full-transparent.svg'
import { LiveBoardView, brandingColors } from './LiveGameView'
import { QrCode, useServerOrigin } from './QrCode'
import { TabletScoreEntry } from './TabletScoreEntry'
import { DANGER, DEFAULT_PRIMARY } from './theme'

// Not scoped by eventId - a physical device (TV-stick or Tablet) keeps the
// exact same clientDeviceId across every event it's ever used for, not just
// the one it was first set up on. Gives each stick a fixed, recognizable
// identity (and thus a fixed "Warte auf Zuweisung" short code) that stays
// the same event after event, instead of a fresh random one every time.
function storageKey(type: DeviceType) {
  return `lpd_device_id_${type}`
}

function pinStorageKey(eventId: string) {
  return `lpd_pairing_pin_${eventId}`
}

// crypto.randomUUID() only exists in secure contexts (HTTPS or localhost) -
// real event devices reach the server over plain http:// on its LAN IP,
// where it's simply undefined and throws. This id only needs to be locally
// unique per device, not cryptographically random, so a Math.random()-based
// UUID v4 is a fine fallback.
function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function getOrCreateClientDeviceId(type: DeviceType): string {
  const key = storageKey(type)
  const existing = localStorage.getItem(key)
  if (existing) return existing
  const generated = generateUuid()
  localStorage.setItem(key, generated)
  return generated
}

/**
 * Pairing screen for a Tablet or Monitor. No login - the device
 * identifies itself with a locally generated, persisted id (see
 * DeviceEndpoints on the backend). Reached via ?tablet=<eventId> or
 * ?boardmonitor=<eventId>.
 *
 * Neither device type is ever self-service: both resume straight into
 * their board once paired (no "Board wählen" list to search/tap through,
 * for either), and get there only via the Regie assigning them directly,
 * or - for a Tablet - scanning a Monitor's own live QR code at the board
 * itself (`presetBoardId`, via ?board=<boardId>), which always takes
 * priority over an existing pairing so walking a Tablet to a different
 * board and rescanning there still works.
 */
export function DevicePairing({
  eventId,
  type,
  presetBoardId,
}: {
  eventId: string
  type: DeviceType
  presetBoardId?: string
}) {
  const [clientDeviceId] = useState(() => getOrCreateClientDeviceId(type))
  const [pairing, setPairing] = useState<Pairing | null | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)
  const [branding, setBranding] = useState<EventBranding | null>(null)
  // Set once a *different* device has remotely paired this one (see the
  // polling effect below) - shown as a one-tap confirmation rather than
  // switched to automatically, since only a real click can still get
  // fullscreen granted.
  const [remotelyAssignedBoardId, setRemotelyAssignedBoardId] = useState<string | null>(null)
  // Short, human-readable form of this device's own id, shown large (plus
  // as a QR code) on the "Warte auf Zuweisung" screen so an operator can
  // recognize *this* physical screen in the Regie's device list without
  // needing to scan anything - purely derived, no extra request needed.
  const shortCode = clientDeviceId.replace(/-/g, '').slice(0, 4).toUpperCase()
  // Tablet-pairing PIN ("Pairing Tablet-Monitor soll Passwort gesichert
  // sein", first iteration scoped to Tablet only) - remembered per event
  // once entered correctly, so it's asked once per device, not on every
  // re-pairing. pinInput is the in-progress entry before it's confirmed.
  const [pin, setPin] = useState(() => (type === 'Tablet' ? localStorage.getItem(pinStorageKey(eventId)) : null))
  const [pinInput, setPinInput] = useState('')
  const [pinError, setPinError] = useState<string | null>(null)
  const serverOrigin = useServerOrigin()

  useEffect(() => {
    api.getDevicePairing(eventId, clientDeviceId).then(setPairing)
    api.getBranding(eventId).then(setBranding).catch(() => {})
  }, [eventId, clientDeviceId])

  // While this device is sitting on the unpaired picker screen, the Regie
  // may assign it a board directly - poll for that so it can prompt a
  // one-tap confirmation instead of just sitting there unresponsive.
  useEffect(() => {
    if (pairing) return

    let cancelled = false
    const interval = setInterval(() => {
      api.getDevicePairing(eventId, clientDeviceId).then((result) => {
        if (!cancelled && result) setRemotelyAssignedBoardId(result.boardId)
      })
    }, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [eventId, clientDeviceId, pairing])

  // An unassigned device (Tablet or Monitor) announces itself every 15s so
  // the Regie's "Warten auf Zuweisung" panel can see and assign it - see
  // UnassignedDeviceTracker on the backend. Stops once paired; the
  // Regie-driven assignment itself is picked up by the poll above, not
  // by this effect.
  useEffect(() => {
    if (pairing) return

    let cancelled = false
    const announce = () => {
      if (!cancelled) api.announceUnassignedDevice(eventId, clientDeviceId, type, shortCode).catch(() => {})
    }
    announce()
    const interval = setInterval(announce, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [eventId, clientDeviceId, type, pairing, shortCode])

  // No browser lets a page force fullscreen without a click - the only way
  // to skip that click on every single open is installing this exact page
  // (with its board/event already in the URL) as a home-screen app. A
  // static manifest.json can't do that since it can only ever point at one
  // fixed start_url, not "whichever board this device was on when it was
  // installed" - so the manifest is built here instead, capturing the
  // current URL, and swapped in as a blob: link right before the browser's
  // "Add to Home Screen" would read it.
  useEffect(() => {
    const manifest = {
      name: 'LetsPlayDarts',
      short_name: 'LetsPlayDarts',
      start_url: window.location.pathname + window.location.search,
      display: 'fullscreen',
      background_color: '#0b0a09',
      theme_color: DEFAULT_PRIMARY,
      icons: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
    }
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/json' }))
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')
    if (!link) {
      link = document.createElement('link')
      link.rel = 'manifest'
      document.head.appendChild(link)
    }
    link.href = blobUrl
    return () => URL.revokeObjectURL(blobUrl)
  }, [])

  // If this pairing has a time window, checks every 30s whether it's still
  // valid server-side. Once it expires, the device falls back to the
  // picker on its own ("fragt das Tablet von selbst: 'Neues Werbeboard
  // auswählen?'", project plan 3.1) rather than needing a manual reload.
  useEffect(() => {
    if (!pairing?.expiresAt) return

    const check = () => {
      api.getDevicePairing(eventId, clientDeviceId).then((current) => {
        if (!current) setPairing(null)
      })
    }
    const interval = setInterval(check, 30000)
    return () => clearInterval(interval)
  }, [eventId, clientDeviceId, pairing])

  const pair = async (boardId: string) => {
    // Fullscreen needs a direct user gesture - requesting it here, still
    // synchronous within the click handler and before the first await,
    // is what keeps the browser willing to grant it (pairing is mostly
    // automatic now, but still a real click when the PIN form submits it).
    // Doing this after pairDevice() resolves would be too late; the click's
    // user-activation window has already closed by then.
    document.documentElement.requestFullscreen?.().catch(() => {})
    setError(null)
    try {
      const result = await api.pairDevice(eventId, clientDeviceId, type, boardId, false, undefined, pin ?? undefined)
      setPairing(result)
    } catch (err) {
      if (err instanceof DeviceConflictError) {
        setError(`Diesem Board ist bereits ${type === 'Tablet' ? 'ein Tablet' : 'ein Monitor'} zugeordnet.`)
      } else if (err instanceof WrongPinError) {
        // The remembered PIN turned out to be wrong (changed by the Regie,
        // or never actually valid) - drop it and ask again instead of
        // failing silently forever.
        localStorage.removeItem(pinStorageKey(eventId))
        setPin(null)
        setPinError(err.message)
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
  }

  // A fresh QR scan for a *different* board always wins over resuming an
  // existing pairing - a Tablet walked to a new board and rescanned there
  // is a deliberate reassignment, not something that should be silently
  // ignored in favor of wherever it was paired before. Waits for the
  // initial pairing fetch to finish (pairing !== undefined) - otherwise
  // this looks true for a moment on every load (presetBoardId compared
  // against a not-yet-loaded pairing's boardId), which would fire the
  // auto-pair effect below on a board the device was already on.
  const hasNewPresetBoard = type === 'Tablet' && !!presetBoardId && pairing !== undefined && presetBoardId !== pairing?.boardId

  // A device pairs itself immediately the moment it knows which board it's
  // on - either the Regie assigned it one (remotelyAssignedBoardId), or a
  // Tablet scanned a Monitor's own QR code at the board itself
  // (hasNewPresetBoard, via ?board=<boardId>) - straight to its live board
  // (Monitor) or "Neues Spiel" (Tablet), no tap, no confirmation screen to
  // get stuck on. pair() still tries to request fullscreen, it just won't
  // be granted without a real user gesture here; that's fine for the
  // actual kiosk setups this runs on (Fully Kiosk Browser already provides
  // its own native fullscreen/kiosk mode independent of the page's own
  // fullscreen API call). Held back for a Tablet that still needs a PIN -
  // firing anyway would just fail with a wrong-PIN error before the PIN
  // prompt has even had a chance to ask for one.
  useEffect(() => {
    const targetBoardId = remotelyAssignedBoardId ?? (hasNewPresetBoard ? presetBoardId : null)
    if (!targetBoardId || pairing) return
    if (type === 'Tablet' && !pin) return
    pair(targetBoardId)
  }, [type, remotelyAssignedBoardId, hasNewPresetBoard, presetBoardId, pairing, branding, pin])

  const { primary, secondary } = brandingColors(branding)
  // "Zwischen den Spielen zeigt der Monitor Kundenlogo/Werbung" (project
  // plan 3.1) applies here too, not just the Tablet - these pairing/setup
  // screens are exactly "zwischen den Spielen" for a Monitor.
  const showCustomerLogo = branding?.hasLogo
  const logoSrc = showCustomerLogo ? api.logoUrl(eventId, branding?.logoVersion) : logo

  if (pairing === undefined) return <p>Lädt…</p>

  if (pairing && !hasNewPresetBoard) {
    // Neither device type offers a way to un-pair itself any more - a
    // Monitor is Regie-assigned only (see below) and a Tablet's "Beenden"
    // already covers abandoning a board mid-use, so there's no remaining
    // case that needs a standing "Anderes Board wählen" escape hatch.
    if (type === 'Monitor') {
      const pairingUrl = serverOrigin ? `${serverOrigin}/?tablet=${eventId}&board=${pairing.boardId}` : null
      return <LiveBoardView boardId={pairing.boardId} eventId={eventId} clientDeviceId={clientDeviceId} pairingUrl={pairingUrl} />
    }

    return <TabletScoreEntry eventId={eventId} clientDeviceId={clientDeviceId} boardId={pairing.boardId} onGoToStartMenu={() => setPairing(null)} />
  }

  if (type === 'Tablet' && !pin) {
    return (
      <main
        className="lpd-tablet"
        style={
          {
            minHeight: '100vh',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1.5rem',
            padding: '2rem 1.2rem',
            background: secondary,
            color: primary,
            fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
            textAlign: 'center',
            '--lpd-accent': primary,
          } as React.CSSProperties
        }
      >
        <img src={logoSrc} alt="Logo" height={56} />
        <h1 style={{ fontSize: '1.4rem', margin: 0 }}>PIN erforderlich</h1>
        <p style={{ margin: 0, opacity: 0.85 }}>Frag die Regie nach dem PIN für dieses Event.</p>
        {pinError && (
          <p role="alert" style={{ color: DANGER, margin: 0 }}>
            {pinError}
          </p>
        )}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setPinError(null)
            localStorage.setItem(pinStorageKey(eventId), pinInput)
            setPin(pinInput)
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', width: '100%', maxWidth: '18rem' }}
        >
          <input
            type="text"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            placeholder="PIN"
            autoFocus
            required
            style={{
              padding: '0.9rem',
              borderRadius: '0.6rem',
              border: `1px solid ${primary}`,
              background: 'transparent',
              color: primary,
              fontSize: '1.3rem',
              textAlign: 'center',
              letterSpacing: '0.2em',
            }}
          />
          <button
            type="submit"
            style={{
              border: `1px solid ${primary}`,
              background: primary,
              color: '#1a1206',
              borderRadius: '0.6rem',
              fontSize: '1.1rem',
              fontWeight: 700,
              padding: '0.9rem',
              cursor: 'pointer',
            }}
          >
            Weiter
          </button>
        </form>
      </main>
    )
  }

  // Neither device type is ever self-service - both are assigned from the
  // Regie ("Geräteverwaltung: ... alles vom Notebook aus änderbar", project
  // plan 3.2), never by picking a board at the screen itself. "Warte auf
  // Zuweisung" is the only state shown here; once the Regie's assignment
  // lands, the auto-pair effect above takes over and this component
  // re-renders straight into the live board view (Monitor) or "Neues
  // Spiel" (Tablet) - no separate confirmation screen to flash through
  // first, and no search/list picker a device could get stuck on.
  return (
    <main
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.2rem',
        padding: '2rem 1.2rem',
        background: secondary,
        color: primary,
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
        textAlign: 'center',
      }}
    >
      <img src={logoSrc} alt="Logo" height={56} />
      {error && (
        <p role="alert" style={{ color: DANGER }}>
          {error}
        </p>
      )}
      <h1 style={{ fontSize: '1.4rem', margin: 0 }}>Warte auf Zuweisung</h1>
      <QrCode value={`${eventId}:${clientDeviceId}`} />
      <p style={{ fontSize: '2rem', letterSpacing: '0.3em', margin: 0, fontWeight: 700 }}>{shortCode}</p>
      <p style={{ margin: 0, opacity: 0.75, maxWidth: '22rem' }}>
        In der Regie unter "Geräte" mit diesem Code einem Board zuweisen - hier ist keine weitere Eingabe nötig.
      </p>
    </main>
  )
}
