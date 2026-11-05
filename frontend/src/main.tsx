import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { api } from './api.ts'
import { GreenscreenView, LiveGameView } from './LiveGameView.tsx'
import { DevicePairing } from './DevicePairing.tsx'
import { LeinwandView } from './LeinwandView.tsx'
import { BracketLeinwandView } from './BracketLeinwandView.tsx'
import { SiegerehrungView } from './SiegerehrungView.tsx'

const params = new URLSearchParams(window.location.search)
const monitorGameId = params.get('monitor')
const monitorEventId = params.get('event')
const tabletEventId = params.get('tablet')
const presetBoardId = params.get('board')
const boardMonitorEventId = params.get('boardmonitor')
const leinwandEventId = params.get('leinwand')
const bracketEventId = params.get('bracket')
const siegerehrungEventId = params.get('siegerehrung')
const tournamentIdParam = params.get('tournament')
const greenscreenBoardId = params.get('greenscreen')
const rotateParam = params.get('rotate') as 'cw' | 'ccw' | null

/**
 * Compensates for a screen that's physically mounted rotated 90° - a
 * landscape TV turned on its side to show the Board-Monitor's portrait
 * layout, needed when the device driving it can't rotate its own output.
 * True for most Android TV / Fire TV sticks, which are hardcoded to
 * landscape with no rotation setting. `?rotate=cw` or `?rotate=ccw` says
 * which way the screen was physically turned; try one, and if the picture
 * comes out upside-down or the wrong way, switch to the other. Only
 * applies to the Board-Monitor - every other view here is meant for an
 * ordinary landscape screen (Leinwand, Regie, Tablet, ...).
 *
 * The fixed box gets the *swapped* viewport dimensions (100vh × 100vw
 * instead of 100vw × 100vh) and is rotated back onto the real viewport -
 * that part alone would be enough if this app's fullscreen views sized
 * themselves in percentages, but they all use plain 100vh/100vw (matching
 * a real, unrotated device) - and vh/vw always resolve against the *true*
 * browser viewport no matter what ancestor box or transform they sit
 * inside, so naively rendering DevicePairing directly in here left its
 * own 100vh shorter than the rotated box actually is, cutting it off to
 * one side. An <iframe> sidesteps that cleanly: it gets its own
 * independent viewport sized to whatever CSS box it's given (100%/100%
 * here, the already-correctly-swapped box), so every 100vh/100vw inside
 * resolves against *that* instead - no changes needed in any view.
 *
 * Sized from window.innerWidth/innerHeight in JS rather than pure CSS
 * vh/vw: some Android TV WebViews (this is built for exactly that) don't
 * have their final surface size ready at first paint - the page loads
 * showing the old, unrotated landscape size, and only recomputes once
 * something (e.g. a remote keypress) forces the browser to re-run layout.
 * Re-measuring on mount, shortly after mount, and on every resize/
 * orientationchange means the rotated box corrects itself the moment a
 * real size is available, without needing that first keypress.
 */
function RotatedViewport({ direction, eventId }: { direction: 'cw' | 'ccw'; eventId: string }) {
  const [size, setSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }))

  useEffect(() => {
    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'

    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    // Belt-and-braces re-checks in case the viewport wasn't final yet at
    // mount time and never fires its own resize event.
    const timeouts = [100, 500, 1500].map((delay) => setTimeout(measure, delay))

    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
      timeouts.forEach(clearTimeout)
    }
  }, [])

  const transform = direction === 'cw' ? 'rotate(90deg) translateY(-100%)' : 'rotate(-90deg) translateX(-100%)'
  // Same path, minus `rotate` - the iframe's own content renders upright
  // within its own (already swapped) viewport, so it must not rotate again.
  const innerUrl = `${window.location.pathname}?boardmonitor=${eventId}`
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, width: size.h, height: size.w, transformOrigin: 'top left', transform }}>
      <iframe
        src={innerUrl}
        title="Board-Monitor"
        allow="fullscreen"
        allowFullScreen
        style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
      />
    </div>
  )
}

function BoardMonitor({ eventId }: { eventId: string }) {
  if (rotateParam === 'cw' || rotateParam === 'ccw') return <RotatedViewport direction={rotateParam} eventId={eventId} />
  return <DevicePairing eventId={eventId} type="Monitor" />
}

/**
 * Resolves `?boardmonitor=current` to whichever event is Active
 * (GET /api/events/current) - lets a Board-Monitor use one fixed URL
 * across events instead of its homepage/bookmark needing to be re-typed
 * on the device (no keyboard, no camera) every time a new event starts.
 * Polls until an Active event exists, so a stick already booted before
 * the Regie activates today's event still picks it up on its own.
 */
function CurrentEventBoardMonitor() {
  const [eventId, setEventId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const check = () => {
      api.getCurrentEventId().then((id) => {
        if (!cancelled) setEventId(id)
      })
    }
    check()
    const interval = setInterval(check, 10000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  // Keyed on eventId - DevicePairing derives clientDeviceId and pairing
  // state once at mount (localStorage key includes eventId), so a mere
  // prop change wouldn't re-initialize either when the Active event
  // switches. The key forces a full remount instead, landing back on a
  // fresh "Warte auf Zuweisung" for whichever event is active now.
  if (eventId) return <BoardMonitor key={eventId} eventId={eventId} />

  return (
    <main
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#0b0a09',
        color: '#ffad00',
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
        textAlign: 'center',
      }}
    >
      <p>{eventId === undefined ? 'Lädt…' : 'Kein aktives Event - wartet…'}</p>
    </main>
  )
}

/**
 * Resolves `?tablet=current` to whichever event is Active, same reasoning
 * as CurrentEventBoardMonitor - a Tablet now pairs itself automatically
 * once the Regie assigns it a board (see DevicePairing), so its own home
 * screen/bookmark only needs to be set up once, ever, per device.
 */
function CurrentEventTabletPairing() {
  const [eventId, setEventId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const check = () => {
      api.getCurrentEventId().then((id) => {
        if (!cancelled) setEventId(id)
      })
    }
    check()
    const interval = setInterval(check, 10000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  if (eventId) return <DevicePairing key={eventId} eventId={eventId} type="Tablet" presetBoardId={presetBoardId ?? undefined} />

  return (
    <main
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '2rem',
        background: '#0b0a09',
        color: '#ffad00',
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
        textAlign: 'center',
      }}
    >
      <p>{eventId === undefined ? 'Lädt…' : 'Kein aktives Event - wartet…'}</p>
    </main>
  )
}

function Root() {
  if (monitorGameId) return <LiveGameView gameId={monitorGameId} eventId={monitorEventId ?? undefined} />
  if (greenscreenBoardId) return <GreenscreenView boardId={greenscreenBoardId} />
  if (tabletEventId === 'current') return <CurrentEventTabletPairing />
  if (tabletEventId) return <DevicePairing eventId={tabletEventId} type="Tablet" presetBoardId={presetBoardId ?? undefined} />
  if (boardMonitorEventId === 'current') return <CurrentEventBoardMonitor />
  if (boardMonitorEventId) return <BoardMonitor eventId={boardMonitorEventId} />
  if (leinwandEventId) return <LeinwandView eventId={leinwandEventId} />
  if (bracketEventId) return <BracketLeinwandView eventId={bracketEventId} requestedTournamentId={tournamentIdParam ?? undefined} />
  if (siegerehrungEventId) return <SiegerehrungView eventId={siegerehrungEventId} requestedTournamentId={tournamentIdParam ?? undefined} />
  return <App />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
