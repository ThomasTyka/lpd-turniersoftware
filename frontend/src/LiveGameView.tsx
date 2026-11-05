import { useEffect, useRef, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { Lottie } from 'lottie-react'
import { API_BASE_URL, api, type EventBranding, type Game, type GameEntry } from './api'
import logo from './assets/logo-full-transparent.svg'
// Black-text variant for the small in-progress corner badge specifically -
// kept separate from `logo` (white text), which stays the idle screen's
// fallback where the background is the fixed, dark DEFAULT_SECONDARY and
// black text would disappear.
import logoBlackText from './assets/logo-black-text-transparent-trimmed.png'
import { ensureReadableText } from './colorContrast'
import { QrCode } from './QrCode'
import { DANGER, DEFAULT_PRIMARY, DEFAULT_SECONDARY, SUCCESS } from './theme'

type ConnectionState = 'connecting' | 'connected' | 'disconnected'

// Base (desktop) sizing for the in-progress live view's bottom row - QR
// code and LetsPlayDarts logo share the same height (BASE_ICON_PX).
// BASE_VIEWPORT_PX is the width these sizes were tuned at; below that,
// useResponsiveBottomRow scales everything down together so the combined
// width can't exceed a narrow/rotated screen - at fixed pixel sizes, the
// row (the logo image is ~2.5x wider than it is tall) simply overflowed
// off the right edge on anything narrower than roughly 900px.
const BASE_ICON_PX = 100
const BASE_BOARD_LABEL_REM = 2.4
const BASE_VIEWPORT_PX = 900
const CUSTOMER_LOGO_HEIGHT = '4rem'

/**
 * Scales the bottom row's QR code, "Board X" text and logo down together
 * below BASE_VIEWPORT_PX, so their combined width always fits the actual
 * screen instead of overflowing it. Never scales up past 1 (the sizes were
 * already tuned as the desired maximum on a normal-width screen). Re-reads
 * window.innerWidth on resize/orientation change for the same reason the
 * player-name fit does - the Board-Monitor's rotated-viewport mode can
 * change the effective width after mount.
 */
function useResponsiveBottomRow() {
  const [width, setWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    const update = () => setWidth(window.innerWidth)
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const scale = Math.min(1, width / BASE_VIEWPORT_PX)
  return {
    qrPx: Math.round(BASE_ICON_PX * scale),
    logoHeightPx: Math.round(BASE_ICON_PX * scale),
    boardFontSize: `${(BASE_BOARD_LABEL_REM * scale).toFixed(2)}rem`,
  }
}

/**
 * Animates a displayed number counting up towards its target instead of
 * jumping straight to it, so spectators watching the Board-Monitor can
 * actually see a score land. Counts from `initialFrom` (0 by default) on
 * first mount - e.g. a player's previous total, so the reveal counts up
 * from their last result instead of starting over at zero; if the same
 * instance later receives a new target (e.g. a live correction), it
 * counts from whatever is currently shown instead.
 */
function useCountUp(target: number, duration = 700, initialFrom = 0): number {
  const [display, setDisplay] = useState(initialFrom)
  const displayRef = useRef(initialFrom)
  const mountedOnce = useRef(false)

  useEffect(() => {
    displayRef.current = display
  })

  useEffect(() => {
    const from = mountedOnce.current ? displayRef.current : initialFrom
    mountedOnce.current = true

    if (from === target) {
      setDisplay(target)
      return
    }

    const start = performance.now()
    let raf: number
    const step = (now: number) => {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - (1 - progress) * (1 - progress)
      setDisplay(Math.round(from + (target - from) * eased))
      if (progress < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])

  return display
}

export function AnimatedNumber({ value, from }: { value: number; from?: number }) {
  return <>{useCountUp(value, 700, from)}</>
}

/**
 * Detects the player who just threw (their recorded-round count grew since
 * the last update) and holds them up - name and new total counting up -
 * right away, before switching over to the normal "who's up next" prompt
 * after a delay.
 *
 * The detection itself runs synchronously during render (comparing `game`
 * to the previous one via a ref), not inside a useEffect. An effect only
 * runs after a render has already committed, which left a one-frame gap
 * right after a throw where `currentEntry` (read straight from
 * game.currentTurnPlayerId, already updated server-side) leaked through
 * as the displayed player before the effect caught up and corrected it
 * back to the actual thrower - a visible flash/jump. Calling setState
 * during render is React's documented pattern for exactly this: it
 * re-renders immediately with the corrected value before anything paints.
 *
 * Returns null (no reveal) before anyone has thrown yet - a brand-new
 * game, or a monitor that just joined mid-game - and once the game
 * finishes.
 */
function useLastThrowReveal(
  game: Game | null,
  settleDuration = 2000,
  fadeOutDuration = 500,
): { entry: GameEntry; from: number; fadingOut: boolean } | null {
  const prevGameRef = useRef<Game | null>(null)
  const [reveal, setReveal] = useState<{ entry: GameEntry; from: number; fadingOut: boolean } | null>(null)
  const settleTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clearTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  if (game !== prevGameRef.current) {
    const prev = prevGameRef.current
    prevGameRef.current = game

    if (game && prev && prev.id === game.id && game.status === 'InProgress') {
      const thrower = game.entries.find((entry) => {
        const prevEntry = prev.entries.find((p) => p.playerId === entry.playerId)
        return prevEntry && entry.roundScores.length > prevEntry.roundScores.length
      })

      if (thrower) {
        const previousEntry = prev.entries.find((p) => p.playerId === thrower.playerId)
        const previousValue = game.mode === 'X01' ? (previousEntry?.remaining ?? game.startScore ?? 0) : (previousEntry?.total ?? 0)
        setReveal({ entry: thrower, from: previousValue, fadingOut: false })
      }
    }
  }

  const revealKey = reveal ? `${reveal.entry.playerId}-${reveal.entry.roundScores.length}` : null

  useEffect(() => {
    if (!revealKey) return
    clearTimeout(settleTimeoutRef.current)
    clearTimeout(clearTimeoutRef.current)

    settleTimeoutRef.current = setTimeout(() => {
      setReveal((current) => (current ? { ...current, fadingOut: true } : null))
      clearTimeoutRef.current = setTimeout(() => setReveal(null), fadeOutDuration)
    }, settleDuration)

    return () => {
      clearTimeout(settleTimeoutRef.current)
      clearTimeout(clearTimeoutRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealKey, settleDuration, fadeOutDuration])

  return reveal
}

/**
 * Confetti overlay's thrown amount, or null - fires once per throw of
 * 100+, mirroring TabletScoreEntry's own trigger, and self-clears after
 * 3.5s. Tracks its own previous-game snapshot (same "who just threw"
 * comparison as LeinwandView's 180-highlight) rather than reusing
 * useLastThrowReveal's reveal - that hook deliberately skips creating a
 * reveal for whichever throw ends the game (status flips to 'Finished' in
 * that same update), which would otherwise make a 100+ *winning* throw
 * silently show no confetti at all.
 */
function useThrowConfetti(game: Game | null, isX01: boolean): number | null {
  const [confetti, setConfetti] = useState<number | null>(null)
  const prevGameRef = useRef<Game | null>(null)

  useEffect(() => {
    const prev = prevGameRef.current
    prevGameRef.current = game
    if (!game || !prev || prev.id !== game.id) return

    const thrower = game.entries.find((entry) => {
      const prevEntry = prev.entries.find((p) => p.playerId === entry.playerId)
      return prevEntry && entry.roundScores.length > prevEntry.roundScores.length
    })
    if (!thrower) return

    const prevEntry = prev.entries.find((p) => p.playerId === thrower.playerId)
    const prevValue = isX01 ? (prevEntry?.remaining ?? game.startScore ?? 0) : (prevEntry?.total ?? 0)
    const currentValue = isX01 ? (thrower.remaining ?? 0) : thrower.total
    const thrown = Math.abs(currentValue - prevValue)
    if (thrown >= 100) setConfetti(thrown)
  }, [game, isX01])

  useEffect(() => {
    if (confetti === null) return
    const timeout = setTimeout(() => setConfetti(null), 3500)
    return () => clearTimeout(timeout)
  }, [confetti])

  return confetti
}

/**
 * Trophy overlay visibility plus its own dismiss - fires once the game
 * finishes (either outright, or the moment a tie blocking it gets
 * resolved - same precedence as TabletScoreEntry's own trophy trigger),
 * self-clears via the Lottie animation's own onComplete subscription
 * rather than a timer.
 */
function useGameFinishedTrophy(game: Game | null): [boolean, () => void] {
  const [show, setShow] = useState(false)
  const prevStatusRef = useRef(game?.status)
  const prevNeedsTieRef = useRef(false)

  useEffect(() => {
    const needsTieResolution = game?.status === 'Finished' && game.isTied && game.knockoutMatchId !== null && game.tiebreakWinnerId === null
    const justFinished = prevStatusRef.current !== 'Finished' && game?.status === 'Finished' && !needsTieResolution
    const justResolvedTie = prevNeedsTieRef.current && !needsTieResolution && game?.status === 'Finished'
    if (justFinished || justResolvedTie) setShow(true)
    prevStatusRef.current = game?.status
    prevNeedsTieRef.current = needsTieResolution
  }, [game?.status, game?.isTied, game?.knockoutMatchId, game?.tiebreakWinnerId])

  return [show, () => setShow(false)]
}

/**
 * Shrinks (never grows) an inline-block element's font-size so its content
 * stays on one line within `maxWidthPx` - used for the live board's big
 * player-name display, where a long name wrapping onto a second line would
 * crowd the big score number right below it. Resets to the CSS-defined
 * size before each measurement, so a shorter name following a long one
 * grows back instead of staying shrunk. Re-measures on window resize too,
 * since the Board-Monitor's rotated-viewport mode (see main.tsx) can
 * change the effective screen width after mount.
 */
function useFitFontSize(text: string, maxWidthPx: number) {
  const ref = useRef<HTMLElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const fit = () => {
      el.style.fontSize = ''
      const natural = parseFloat(getComputedStyle(el).fontSize)
      if (el.scrollWidth > maxWidthPx && natural > 0) {
        el.style.fontSize = `${natural * (maxWidthPx / el.scrollWidth)}px`
      }
    }
    fit()
    window.addEventListener('resize', fit)
    return () => window.removeEventListener('resize', fit)
  }, [text, maxWidthPx])

  return ref
}

/**
 * Board-Monitor display. Highscore mode shows the player who's currently up
 * (name, running total, "Runde x/y") large and alone - not a side-by-side
 * scoreboard (project plan 3.1: "im Highscore-Modus zeigt der Monitor groß
 * den Namen und den aktuellen Punktestand des Spielers, der gerade dran
 * ist ... nicht wie beim klassischen Darten beide nebeneinander"). Between
 * games the customer logo takes over the screen.
 */
function GameDisplay({
  game,
  connectionState,
  eventId,
  branding,
  pairingUrl,
  boardNumber,
}: {
  game: Game | null
  connectionState: ConnectionState
  eventId?: string
  branding?: EventBranding | null
  /** Tablet-pairing QR target, if this display is a paired Board-Monitor. */
  pairingUrl?: string | null
  boardNumber?: number | null
}) {
  const { primary, secondary } = brandingColors(branding)
  // Score numbers want a neutral accent distinct from `primary` (plain
  // white normally) - but unlike the confetti/trophy overlays' own white
  // text (those sit on a fixed dark backdrop), these render directly on
  // the branding-dependent page background, so a light event `secondary`
  // color would make literal white unreadable. Nudged the same way
  // `primary` already is.
  const accentColor = ensureReadableText(secondary, '#ffffff')
  // "Zwischen den Spielen zeigt der Monitor Kundenlogo/Werbung" (project
  // plan 3.1) - shown on the idle screen (no active game), same as it
  // always was before a later session dropped it everywhere "for
  // consistency" with the in-progress view, which never showed it for an
  // unrelated reason (layout space, see b6fce3f) - restoring just the
  // idle screen's branding here, not re-adding a header to the live view.
  const showCustomerLogo = eventId && branding?.hasLogo
  const logoSrc = showCustomerLogo ? api.logoUrl(eventId!, branding?.logoVersion) : logo

  // Keeps the current-turn player's standings row in view even when the
  // table has too many players to show all of them at once - a player
  // seated near the bottom of the table would otherwise scroll out of
  // sight the moment it's their turn.
  const activeRowRef = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    activeRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [game?.currentTurnPlayerId])

  const wrapperStyle: React.CSSProperties = {
    height: '100vh',
    overflow: 'hidden',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1.5rem',
    padding: '2vh 4vw',
    textAlign: 'center',
    background: secondary,
    color: primary,
    fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
  }

  const connectionDot: React.CSSProperties = {
    position: 'fixed',
    top: '1.2rem',
    right: '1.2rem',
    width: '0.7rem',
    height: '0.7rem',
    borderRadius: '50%',
    background: connectionState === 'connected' ? SUCCESS : connectionState === 'connecting' ? '#e8b800' : DANGER,
  }

  const reveal = useLastThrowReveal(game)
  const currentEntry = game ? (game.entries.find((e) => e.playerId === game.currentTurnPlayerId) ?? null) : null
  const displayedEntry = reveal?.entry ?? currentEntry
  const playerNameRef = useFitFontSize(displayedEntry?.playerName ?? '', window.innerWidth * 0.9)
  const { qrPx, logoHeightPx, boardFontSize } = useResponsiveBottomRow()
  const isX01 = game?.mode === 'X01'
  const standings = game
    ? [...game.entries].sort((a, b) => (isX01 ? (a.remaining ?? 0) - (b.remaining ?? 0) : b.total - a.total))
    : []
  // Same "shrink instead of wrap" treatment for the winner's name on the
  // "Ergebnis" screen - capped at the results block's own 40rem maxWidth
  // (minus a little breathing room) rather than the full viewport, since
  // that block never gets wider than that regardless of screen size.
  const winnerNameRef = useFitFontSize(standings[0]?.playerName ?? '', Math.min(window.innerWidth * 0.9, 38 * 16))

  // Same Lottie confetti/trophy the Tablet shows the scorer - brought to
  // the Board-Monitor too, so spectators watching the big screen (not just
  // whoever's holding the Tablet) see a 100+ throw or the game's winner
  // celebrated.
  const confettiThrow = useThrowConfetti(game, isX01)
  const [showTrophy, hideTrophy] = useGameFinishedTrophy(game)

  return (
    <main style={wrapperStyle}>
      <div style={connectionDot} title={`Verbindung: ${connectionState}`} />

      {confettiThrow !== null && (
        <div
          data-testid="confetti-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.6)',
          }}
        >
          <Lottie src="/animations/confetti.json" autoplay loop={false} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
          <span style={{ position: 'relative', color: 'white', fontWeight: 700, fontSize: 'clamp(4rem, 30vw, 12rem)' }}>{confettiThrow}</span>
        </div>
      )}

      {showTrophy && standings[0] && (
        <div
          data-testid="trophy-overlay"
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '1rem',
            background: 'rgba(0, 0, 0, 0.6)',
          }}
        >
          <Lottie src="/animations/trophy.json" autoplay loop={false} subscriptions={{ complete: hideTrophy }} style={{ width: 'min(50vw, 50vh)', height: 'min(50vw, 50vh)' }} />
          <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: 'clamp(1.5rem, 4vw, 3rem)', textAlign: 'center' }}>
            🎉 {standings[0].playerName} 🎉
          </p>
        </div>
      )}


      {/* Also shown once the current game is Finished, not just when there's
          none at all - getCurrentGameForBoard keeps returning a board's
          most recent game forever once one has ever been played there
          (by design, so the Leinwand/Greenscreen can keep showing final
          results), so `!game` alone would never become true again after
          the very first game - stranding the Monitor on a blank screen
          instead of ever getting back to this "ready for the next game"
          idle view. */}
      {(!game || game.status === 'Finished') && pairingUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'min(4vh, 2rem)' }}>
          <img
            key="idle-logo"
            className="lpd-pop-in"
            src={logoSrc}
            alt="Logo"
            style={{ maxWidth: 'min(50vw, 28rem)', maxHeight: '30vh', objectFit: 'contain' }}
          />
          <QrCode value={pairingUrl} size={480} style={{ width: 'min(40vh, 40vw, 24rem)', height: 'auto' }} />
          <p style={{ fontSize: 'clamp(0.9rem, 2vw, 1.2rem)', opacity: 0.7, margin: 0 }}>Tablet hier koppeln</p>
        </div>
      )}

      {(!game || game.status === 'Finished') && !pairingUrl && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2rem' }}>
          <img
            key="idle-logo"
            className="lpd-pop-in"
            src={logoSrc}
            alt="Logo"
            style={{ maxWidth: 'min(60vw, 32rem)', maxHeight: '40vh', objectFit: 'contain' }}
          />
          <p style={{ fontSize: 'clamp(1rem, 2.5vw, 1.5rem)', opacity: 0.7, margin: 0 }}>
            Bereit für das nächste Spiel
          </p>
        </div>
      )}

      {game && game.status === 'InProgress' && displayedEntry && (
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', flex: 1, minHeight: 0 }}>
          {/* Customer-branding logo, top-left - in normal flow (not
              position: fixed) and sized down so it reserves its own small
              strip instead of floating over "Jetzt spielt"/the player name
              below it, which `position: fixed` did on a short screen. */}
          {showCustomerLogo && (
            <div style={{ flex: '0 0 auto', width: '100%', display: 'flex', justifyContent: 'flex-start', marginBottom: '0.6rem' }}>
              <img src={logoSrc} alt="Logo" style={{ height: CUSTOMER_LOGO_HEIGHT, opacity: 0.9 }} />
            </div>
          )}
          <div
            style={{
              flex: '2 1 0',
              minHeight: 0,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
            }}
          >
            <div
              style={{
                flex: '1 1 0',
                minHeight: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                paddingBottom: '2vh',
              }}
            >
              <div
                key={displayedEntry.playerId}
                className="lpd-fade-in-slow"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  minHeight: 0,
                  opacity: reveal?.fadingOut ? 0 : 1,
                  transition: 'opacity 500ms ease',
                }}
              >
                <p
                  style={{
                    fontSize: 'clamp(1.3rem, 4.5vh, 2.6rem)',
                    margin: '0 0 0.5vh',
                    fontWeight: 700,
                    color: accentColor,
                    opacity: reveal ? 0 : 1,
                    transition: 'opacity 200ms ease',
                  }}
                >
                  Jetzt spielt
                </p>
                <p style={{ fontSize: 'clamp(1.1rem, 3.2vh, 1.8rem)', margin: 0, opacity: 0.85 }}>
                  {isX01
                    ? `Rest: ${displayedEntry.remaining}`
                    : reveal
                      ? `Runde ${displayedEntry.roundScores.length}/${game.rounds}`
                      : `Runde ${displayedEntry.roundScores.length + 1}/${game.rounds}`}
                </p>
                <h1
                  ref={playerNameRef as React.RefObject<HTMLHeadingElement>}
                  style={{
                    fontSize: 'clamp(2rem, 7.5vh, 4.5rem)',
                    margin: 0,
                    lineHeight: 1.1,
                    fontWeight: 700,
                    maxWidth: '90vw',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {displayedEntry.playerName}
                </h1>
                <p
                  className={reveal && Math.abs((isX01 ? displayedEntry.remaining! : displayedEntry.total) - reveal.from) >= 100 ? 'lpd-pulse' : undefined}
                  style={{ fontSize: 'clamp(2.5rem, 10vh, 5.5rem)', margin: 0, lineHeight: 1, fontWeight: 700, color: accentColor }}
                >
                  {reveal ? (
                    <AnimatedNumber value={isX01 ? displayedEntry.remaining! : displayedEntry.total} from={reveal.from} />
                  ) : isX01 ? (
                    displayedEntry.remaining
                  ) : (
                    displayedEntry.total
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Hidden (not just covered by the confetti overlay's own dark
              tint) while a 100+ throw is being celebrated - the overlay is
              semi-transparent, so the table would otherwise still show
              faintly through it, competing with the animation instead of
              giving it the screen. Reappears on its own once confettiThrow
              clears back to null (self-clears after 3.5s, see
              useThrowConfetti). */}
          <div
            style={{
              flex: '3 1 0',
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'flex-start',
              width: '100%',
              paddingTop: '2vh',
              borderTop: `1px solid ${primary}33`,
              visibility: confettiThrow !== null ? 'hidden' : 'visible',
            }}
          >
            <table
              style={{
                borderCollapse: 'collapse',
                tableLayout: 'fixed',
                width: '100%',
                maxWidth: '64rem',
                fontSize: 'clamp(1.8rem, 4.6vw, 2.6rem)',
                whiteSpace: 'nowrap',
              }}
            >
              <colgroup>
                <col style={{ width: '64%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '18%' }} />
              </colgroup>
              <tbody>
                {(() => {
                  const leaderValue = isX01
                    ? Math.min(...game.entries.map((e) => e.remaining ?? 0))
                    : Math.max(...game.entries.map((e) => e.total))
                  return game.entries.map((entry) => {
                    const value = isX01 ? (entry.remaining ?? 0) : entry.total
                    const gap = isX01 ? value - leaderValue : leaderValue - value
                    const isCurrentTurn = entry.playerId === game.currentTurnPlayerId
                    return (
                      <tr
                        key={entry.playerId}
                        ref={isCurrentTurn ? activeRowRef : undefined}
                        style={{
                          background: isCurrentTurn ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                          boxShadow: isCurrentTurn ? `inset 4px 0 0 ${SUCCESS}` : 'none',
                        }}
                      >
                        <td
                          style={{
                            textAlign: 'left',
                            padding: '0.4rem 0.6rem',
                            fontWeight: 700,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {entry.playerName}
                        </td>
                        <td style={{ textAlign: 'center', padding: '0.4rem 0.6rem', fontWeight: 700, color: accentColor }}>
                          {value}
                        </td>
                        <td style={{ textAlign: 'center', padding: '0.4rem 0.6rem', color: gap === 0 ? 'inherit' : DANGER }}>
                          {gap === 0 ? '🏆' : `-${gap}`}
                        </td>
                      </tr>
                    )
                  })
                })()}
              </tbody>
            </table>
          </div>

          {/* Pairing QR on the left, board number, the LetsPlayDarts logo
              on the right - a flex row with justify-content: space-between
              puts the QR flush at the true left edge and the logo flush at
              the true right edge, then splits the REMAINING space into
              exactly two equal gaps either side of "Board X". This is
              deliberately NOT the same thing as putting Board X at the
              row's exact geometric center (tried that - `left: 50%` on the
              row's own box): since the QR and the logo are very different
              widths, the row's true center sits closer to the wider
              element (the logo), so a center-of-row placement visibly
              undershoots the gap on the logo's side. Equal leftover-space
              gaps either side of Board X is what actually reads as
              "centered between the QR and the logo" - verified by
              measuring both gaps directly (119.40px vs 119.39px, only
              rounding). All three are sized by useResponsiveBottomRow, not
              fixed pixel values - the logo is a wide image (~2.5x wider
              than tall), so at a fixed size this row silently overflowed
              off the right edge on anything narrower than the viewport
              this was designed on (found by actually measuring a 447px-
              wide screen, not by reasoning about it). In normal flow (not
              position: fixed) so it takes its own share of the screen
              instead of floating over the table and covering player names
              near the bottom of a long list. Negative margin cancels out
              `<main>`'s own 2vh/4vw padding so this row sits flush against
              the true screen edge, with just its own small padding
              controlling the actual gap - otherwise both paddings
              stacked, leaving far more space than intended. */}
          {(pairingUrl || boardNumber != null) && (
            <div
              style={{
                flex: '0 0 auto',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                margin: '0 -4vw -2vh',
                // Vertical padding matches `<main>`'s own 2vh top/bottom
                // padding exactly - the negative margin above cancels that
                // inherited padding out, so this is the only thing left
                // controlling the actual gap to the true screen edge, and
                // using the same 2vh makes it match the gap at the top of
                // the screen exactly rather than an arbitrarily different
                // value.
                padding: '2vh 4vw',
              }}
            >
              {pairingUrl ? <QrCode value={pairingUrl} size={qrPx} /> : <span />}
              {boardNumber != null && (
                <span style={{ fontSize: boardFontSize, fontWeight: 700, lineHeight: 1, color: accentColor }}>Board {boardNumber}</span>
              )}
              <img src={logoBlackText} alt="LetsPlayDarts" style={{ height: `${logoHeightPx}px`, opacity: 0.85 }} />
            </div>
          )}
        </div>
      )}

      {game && game.status === 'Finished' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', width: '100%', maxWidth: '40rem' }}>
          <p style={{ fontSize: 'clamp(1.2rem, 3vw, 2rem)', margin: 0, opacity: 0.85 }}>Ergebnis</p>
          {standings[0] && (
            <div key={`winner-${standings[0].playerId}`} className="lpd-pop-in">
              <h1
                ref={winnerNameRef as React.RefObject<HTMLHeadingElement>}
                style={{ fontSize: 'clamp(2.5rem, 8vw, 6rem)', margin: 0, lineHeight: 1, fontWeight: 700, whiteSpace: 'nowrap' }}
              >
                {standings[0].playerName}
              </h1>
              <p style={{ fontSize: 'clamp(3rem, 10vw, 7rem)', margin: 0, lineHeight: 1, fontWeight: 700, color: accentColor }}>
                <AnimatedNumber value={isX01 ? (standings[0].remaining ?? 0) : standings[0].total} />
              </p>
            </div>
          )}
          {standings.length > 1 && (
            <ol style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: 'clamp(1rem, 2.5vw, 1.5rem)', opacity: 0.85 }}>
              {standings.slice(1).map((entry, i) => (
                <li key={entry.playerId} style={{ padding: '0.2rem 0' }}>
                  {i + 2}. {entry.playerName}: <AnimatedNumber value={isX01 ? (entry.remaining ?? 0) : entry.total} />
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </main>
  )
}

/**
 * Resolves an event's font/background colors, falling back to the app
 * defaults when no branding is set, and nudging the font color if it
 * wouldn't read clearly on that background (see ensureReadableText) -
 * these run unattended on Leinwand/board displays, so a bad customer
 * color pairing needs to self-correct rather than just look broken.
 */
export function brandingColors(branding: EventBranding | null | undefined): { primary: string; secondary: string } {
  const secondary = branding?.secondaryColor ?? DEFAULT_SECONDARY
  const primary = ensureReadableText(secondary, branding?.primaryColor ?? DEFAULT_PRIMARY)
  return { primary, secondary }
}

export function useBranding(eventId: string | undefined, refreshSignal?: unknown) {
  const [branding, setBranding] = useState<EventBranding | null>(null)

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    api
      .getBranding(eventId)
      .then((result) => {
        if (!cancelled) setBranding(result)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [eventId, refreshSignal])

  return branding
}

/**
 * Read-only live display for a single, specific game. No login required
 * (see GameHub). Reached via ?monitor=<gameId> so it doesn't need a
 * router dependency for this proof of concept. `eventId` is optional (via
 * ?event=<eventId>) - without it, branding falls back to the defaults, same
 * as LiveBoardView does when it has no eventId either.
 */
export function LiveGameView({ gameId, eventId }: { gameId: string; eventId?: string }) {
  const [game, setGame] = useState<Game | null>(null)
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const branding = useBranding(eventId)

  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/game`)
      .withAutomaticReconnect()
      .build()

    connection.on('gameUpdated', (updated: Game) => setGame(updated))
    connection.onreconnecting(() => setConnectionState('connecting'))
    connection.onreconnected(() => setConnectionState('connected'))
    connection.onclose(() => setConnectionState('disconnected'))

    connection
      .start()
      .then(() => {
        setConnectionState('connected')
        return connection.invoke('JoinGame', gameId)
      })
      .catch(() => setConnectionState('disconnected'))

    return () => {
      connection.stop()
    }
  }, [gameId])

  return <GameDisplay game={game} connectionState={connectionState} eventId={eventId} branding={branding} />
}

/**
 * Read-only live display that follows whichever game is currently being
 * played on a board - what a paired board monitor actually shows once
 * pairing is done (see DevicePairing). Joins the board's SignalR group so
 * it automatically picks up the next game once one starts, without
 * needing to know a game id.
 */
export function LiveBoardView({
  boardId,
  eventId,
  clientDeviceId,
  pairingUrl,
}: {
  boardId: string
  eventId?: string
  clientDeviceId?: string
  pairingUrl?: string | null
}) {
  const [game, setGame] = useState<Game | null | undefined>(undefined)
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [boardNumber, setBoardNumber] = useState<number | null>(null)
  const branding = useBranding(eventId)

  useEffect(() => {
    if (!eventId) return
    let cancelled = false
    api.getPairingBoards(eventId).then((boards) => {
      if (!cancelled) setBoardNumber(boards.find((b) => b.id === boardId)?.number ?? null)
    })
    return () => {
      cancelled = true
    }
  }, [eventId, boardId])

  useEffect(() => {
    let cancelled = false

    fetch(`${API_BASE_URL}/api/boards/${boardId}/current-game`)
      .then((r) => (r.status === 404 ? null : r.json()))
      .then((initial) => {
        if (!cancelled) setGame(initial)
      })

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/game`)
      .withAutomaticReconnect()
      .build()

    connection.on('gameUpdated', (updated: Game) => setGame(updated))
    connection.on('gameStarted', (started: Game) => setGame(started))
    // A Tablet abandoning its game ("Beenden") hard-deletes it server-side -
    // without this, the Monitor just kept showing the abandoned game
    // forever instead of falling back to its idle/QR-pairing screen.
    connection.on('gameCancelled', () => setGame(null))
    connection.onreconnecting(() => setConnectionState('connecting'))
    connection.onreconnected(() => {
      setConnectionState('connected')
      // Reconnect gets a new ConnectionId server-side, so presence and
      // the board subscription both need to be re-established.
      connection.invoke('JoinBoard', boardId)
      if (clientDeviceId) connection.invoke('RegisterDevice', clientDeviceId)
    })
    connection.onclose(() => setConnectionState('disconnected'))

    connection
      .start()
      .then(async () => {
        setConnectionState('connected')
        await connection.invoke('JoinBoard', boardId)
        if (clientDeviceId) await connection.invoke('RegisterDevice', clientDeviceId)
      })
      .catch(() => setConnectionState('disconnected'))

    return () => {
      cancelled = true
      connection.stop()
    }
  }, [boardId, clientDeviceId])

  return (
    <GameDisplay
      game={game === undefined ? null : game}
      connectionState={connectionState}
      eventId={eventId}
      branding={branding}
      pairingUrl={pairingUrl}
      boardNumber={boardNumber}
    />
  )
}

/**
 * Chroma-key overlay for a video mixer (OBS etc.), matching the old
 * system's finals/boards/[boardId]/live page - a solid, fixed green
 * background (never the event's own branding colors, which would break
 * keying) showing only the player currently on the oche and their score.
 * Reached via ?greenscreen=<boardId>, no login, no event context needed -
 * this is a technical broadcast layer, not a themed device view.
 */
const CHROMA_KEY_GREEN = '#03F703'

export function GreenscreenView({ boardId }: { boardId: string }) {
  const [game, setGame] = useState<Game | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch(`${API_BASE_URL}/api/boards/${boardId}/current-game`)
      .then((r) => (r.status === 404 ? null : r.json()))
      .then((initial) => {
        if (!cancelled) setGame(initial)
      })

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/game`)
      .withAutomaticReconnect()
      .build()

    connection.on('gameUpdated', (updated: Game) => setGame(updated))
    connection.on('gameStarted', (started: Game) => setGame(started))
    connection.onreconnected(() => connection.invoke('JoinBoard', boardId))
    connection.start().then(() => connection.invoke('JoinBoard', boardId))

    return () => {
      cancelled = true
      connection.stop()
    }
  }, [boardId])

  const currentEntry = game?.entries.find((e) => e.playerId === game.currentTurnPlayerId)
  const isX01 = game?.mode === 'X01'

  return (
    <main
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        background: CHROMA_KEY_GREEN,
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
      }}
    >
      {currentEntry && (
        <div style={{ textAlign: 'center', color: '#0b0a09' }}>
          <p data-testid="greenscreen-player" style={{ margin: 0, fontSize: 'clamp(1.5rem, 4vw, 2.5rem)', fontWeight: 700 }}>
            {currentEntry.playerName}
          </p>
          <p
            data-testid="greenscreen-score"
            style={{ margin: 0, fontSize: 'clamp(3rem, 10vw, 6rem)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
          >
            {isX01 ? currentEntry.remaining : currentEntry.total}
          </p>
        </div>
      )}
    </main>
  )
}
