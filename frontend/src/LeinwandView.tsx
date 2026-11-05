import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { API_BASE_URL, api, type Game, type LeaderboardEntry, type LeinwandSettings, type PairingBoard } from './api'
import logo from './assets/logo-full-transparent.svg'
import { AnimatedNumber, brandingColors, useBranding } from './LiveGameView'
import { SUCCESS } from './theme'

const DEFAULT_SETTINGS: LeinwandSettings = { activeScenes: ['scores', 'leaderboard'], intervalSeconds: 10, pinnedScene: null }

/**
 * Leinwand: a Szenen-System that rotates through configurable scenes on a
 * timer, or shows a single pinned scene (project plan 3.3: "Playlists:
 * Szenen rotieren automatisch im einstellbaren Takt - oder du schaltest
 * manuell um"), plus a full-screen highlight for a 180 throw. Settings are
 * controlled from the Regie and pushed live via SignalR
 * ("Steuerung vom Notebook") - only one shared Leinwand per event is
 * modeled for now, not multiple independently configured screens.
 *
 * No login required - same read-only, pairing-independent access as
 * LiveBoardView. Reached via ?leinwand=<eventId>.
 *
 * Uses a single shared SignalR connection joined to every board's group
 * plus the event's Leinwand group, rather than one connection per board
 * tile - N boards would otherwise mean N open WebSocket connections for
 * what's ultimately one screen.
 */
export function LeinwandView({ eventId }: { eventId: string }) {
  const [boards, setBoards] = useState<PairingBoard[] | null>(null)
  const [games, setGames] = useState<Record<string, Game | null>>({})
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [settings, setSettings] = useState<LeinwandSettings>(DEFAULT_SETTINGS)
  const [sceneIndex, setSceneIndex] = useState(0)
  const [highlight, setHighlight] = useState<{ playerName: string; score: number } | null>(null)
  const [leaderboardRefreshSignal, setLeaderboardRefreshSignal] = useState(0)
  const boardsRef = useRef<PairingBoard[]>([])
  const [brandingRefreshSignal, setBrandingRefreshSignal] = useState(0)
  const branding = useBranding(eventId, brandingRefreshSignal)
  const { primary, secondary } = brandingColors(branding)

  useEffect(() => {
    api.getLeinwandSettings(eventId).then(setSettings).catch(() => {})
  }, [eventId])

  useEffect(() => {
    let cancelled = false
    let connection: signalR.HubConnection | null = null

    // Boards are fetched first, and the SignalR connection only created
    // once they're in - not in parallel. JoinBoard needs the board list,
    // and starting the connection before it's ready would let the
    // handshake win the race: joinAllBoards() would run against an empty
    // list, join nothing, and never retry - silently missing every update
    // with no visible error.
    api.getPairingBoards(eventId).then(async (loaded) => {
      if (cancelled) return
      setBoards(loaded)
      boardsRef.current = loaded
      for (const board of loaded) {
        api.getCurrentGameForBoard(board.id).then((game) => {
          if (!cancelled) setGames((prev) => ({ ...prev, [board.id]: game }))
        })
      }

      connection = new signalR.HubConnectionBuilder()
        .withUrl(`${API_BASE_URL}/hubs/game`)
        .withAutomaticReconnect()
        .build()

      // Detects a 180 throw by comparing round-score counts against the
      // previous game snapshot - same "who just threw" pattern as the
      // Board-Monitor's reveal logic ("Highlight-Einblendungen: Bei einem
      // 180er [...] wird automatisch eine Animation [...] gelegt").
      const applyUpdate = (game: Game) => {
        setGames((prev) => {
          const prevGame = prev[game.boardId]
          const thrower = game.entries.find((entry) => {
            const prevEntry = prevGame?.entries.find((p) => p.playerId === entry.playerId)
            return prevEntry && entry.roundScores.length > prevEntry.roundScores.length
          })
          if (thrower) {
            const lastScore = thrower.roundScores[thrower.roundScores.length - 1]
            if (lastScore === 180) {
              setHighlight({ playerName: thrower.playerName, score: lastScore })
              setTimeout(() => setHighlight(null), 4000)
            }
          }
          // Old system reloaded its Vorrunden-Rangliste the moment any
          // game in the event finished (MQTT "game finished" message),
          // not on a fixed timer - this is the SignalR equivalent, reusing
          // the connection already open for the Scores scene rather than
          // giving LeaderboardScene a second one of its own. Fires on
          // *any* update to a Finished game, not just the transition into
          // it - a correction to an already-finished game's score also
          // changes the leaderboard, but wouldn't otherwise trigger this
          // (prevGame.status was already 'Finished' too), leaving it to
          // wait out the rest of the 15s poll instead of updating - and
          // animating - right away.
          if (game.status === 'Finished') {
            setLeaderboardRefreshSignal((n) => n + 1)
          }
          return { ...prev, [game.boardId]: game }
        })
      }
      connection.on('gameUpdated', applyUpdate)
      connection.on('gameStarted', applyUpdate)
      connection.on('leinwandSettingsUpdated', (updated: LeinwandSettings) => setSettings(updated))
      // Backend pushes this whenever the Regie changes branding colors or
      // uploads a new logo, since the Leinwand's own useBranding fetch
      // otherwise only runs once on mount - without this, a Leinwand that's
      // already open (common - the TV often runs all day) would keep
      // showing the old/no logo until someone manually reloads it.
      connection.on('brandingUpdated', () => setBrandingRefreshSignal((n) => n + 1))

      const joinAll = () =>
        Promise.all([...boardsRef.current.map((b) => connection!.invoke('JoinBoard', b.id)), connection!.invoke('JoinLeinwand', eventId)])

      connection.onreconnecting(() => setConnectionState('connecting'))
      connection.onreconnected(() => {
        setConnectionState('connected')
        joinAll()
      })
      connection.onclose(() => setConnectionState('disconnected'))

      try {
        await connection.start()
        if (cancelled) return
        setConnectionState('connected')
        await joinAll()
      } catch {
        if (!cancelled) setConnectionState('disconnected')
      }
    })

    return () => {
      cancelled = true
      connection?.stop()
    }
  }, [eventId])

  // Rotates through the active scenes on the configured interval, unless
  // a scene is pinned ("du schaltest manuell um, z. B. fürs Finale: nur
  // das Finale, groß").
  useEffect(() => {
    setSceneIndex(0)
    if (settings.pinnedScene || settings.activeScenes.length <= 1) return
    const interval = setInterval(() => {
      setSceneIndex((i) => (i + 1) % settings.activeScenes.length)
    }, settings.intervalSeconds * 1000)
    return () => clearInterval(interval)
  }, [settings])

  const currentScene = settings.pinnedScene ?? settings.activeScenes[sceneIndex % Math.max(settings.activeScenes.length, 1)] ?? 'scores'

  return (
    <main
      style={{
        minHeight: '100vh',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        padding: '2.5rem 3rem',
        background: secondary,
        color: primary,
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.2rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8rem' }}>
          <img src={branding?.hasLogo ? api.logoUrl(eventId, branding.logoVersion) : logo} alt="Logo" height={64} />
          <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{branding?.name}</h1>
        </div>
        <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>
          Verbindung: {connectionState === 'connected' ? 'live' : connectionState === 'connecting' ? 'verbinde…' : 'getrennt'}
        </p>
      </header>
      <div key={currentScene} className="lpd-fade-in-slow">
        {currentScene === 'leaderboard' ? (
          <LeaderboardScene eventId={eventId} accent={primary} refreshSignal={leaderboardRefreshSignal} />
        ) : (
          <ScoresScene boards={boards} games={games} accent={primary} />
        )}
      </div>
      {highlight && <HighlightOverlay playerName={highlight.playerName} score={highlight.score} />}
    </main>
  )
}

function ScoresScene({
  boards,
  games,
  accent,
}: {
  boards: PairingBoard[] | null
  games: Record<string, Game | null>
  accent: string
}) {
  return (
    <>
      {boards === null && <p>Lädt…</p>}
      {boards !== null && boards.length === 0 && <p>Keine Boards für dieses Event vorhanden.</p>}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
          gap: '1.2rem',
        }}
      >
        {boards?.map((board) => (
          <BoardTile key={board.id} board={board} game={games[board.id]} accent={accent} />
        ))}
      </div>
    </>
  )
}

function BoardTile({ board, game, accent }: { board: PairingBoard; game: Game | null | undefined; accent: string }) {
  const standings = game ? [...game.entries].sort((a, b) => b.total - a.total) : []

  return (
    <section
      style={{
        border: `1px solid ${accent}55`,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: '0.75rem',
        padding: '1.2rem 1.4rem',
      }}
    >
      <h2 style={{ margin: '0 0 0.6rem', fontSize: '1.1rem' }}>{board.name ?? `Board ${board.number}`}</h2>
      {!game && <p style={{ margin: 0, opacity: 0.7 }}>Kein aktives Spiel.</p>}
      {game && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {standings.map((entry, i) => (
            <li key={entry.playerId} style={{ display: 'flex', justifyContent: 'space-between', fontWeight: i === 0 ? 700 : 400 }}>
              <span>{entry.playerName}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', color: 'white' }}>{entry.total}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

// Max game-score columns shown per player - old system's default, now
// live-adjustable via the 'm'/'n' keys below, same as
// scoreboard-table-client.tsx's maxDisplayOfPlayedGames.
const MAX_GAME_COLUMNS_DEFAULT = 10
const PLAYERS_PER_PAGE = 12
const PAGE_ROTATE_MS_DEFAULT = 5000
const TOAST_DURATION_MS = 1500
const FLIP_DURATION_MS = 500

/**
 * FLIP technique (First/Last/Invert/Play): when a player's rank shifts up
 * or down within the currently visible page (a game finished, the score
 * changed, the sort order changed), the row doesn't just jump to its new
 * spot - it's caught at its old screen position via a CSS transform, then
 * eased across to the new one. Deliberately scoped to *within one page*:
 * a page turn (see PLAYERS_PER_PAGE/PAGE_ROTATE_MS) remounts the whole
 * table via its own `key={page}`, so this only ever has to reconcile the
 * same roughly-12 rows against themselves, never rows entering/leaving a
 * page (those just fade in with the page like before).
 */
function useLeaderboardRowFlip(orderKey: string) {
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map())
  const isFirstRunRef = useRef(true)

  useLayoutEffect(() => {
    const nextRects = new Map<string, DOMRect>()
    rowRefs.current.forEach((el, key) => nextRects.set(key, el.getBoundingClientRect()))

    if (!isFirstRunRef.current) {
      const prevRects = prevRectsRef.current
      const toAnimate: { el: HTMLTableRowElement; deltaY: number }[] = []
      rowRefs.current.forEach((el, key) => {
        const prev = prevRects.get(key)
        const next = nextRects.get(key)
        if (!prev || !next) return
        const deltaY = prev.top - next.top
        if (deltaY === 0) return
        el.style.transition = 'none'
        el.style.transform = `translateY(${deltaY}px)`
        toAnimate.push({ el, deltaY })
      })
      if (toAnimate.length > 0) {
        // Reading a layout property (getBoundingClientRect above) forces
        // layout, but not a paint - without an actual frame boundary here,
        // the browser can still coalesce the "jump back" and the "ease to
        // 0" below into a single style change and skip the animation
        // entirely. requestAnimationFrame guarantees that boundary.
        requestAnimationFrame(() => {
          for (const { el } of toAnimate) {
            // A slight overshoot-and-settle ("back-out") instead of a flat
            // ease - reads more like a TV leaderboard reveal (Eurovision-
            // style) than a plain UI reorder.
            el.style.transition = `transform ${FLIP_DURATION_MS}ms cubic-bezier(0.34, 1.56, 0.64, 1)`
            el.style.transform = ''
          }
        })
      }
    }

    isFirstRunRef.current = false
    prevRectsRef.current = nextRects
  }, [orderKey])

  const setRowRef = (key: string) => (el: HTMLTableRowElement | null) => {
    if (el) rowRefs.current.set(key, el)
    else rowRefs.current.delete(key)
  }

  return setRowRef
}

const FLASH_DURATION_MS = 900

/**
 * Player ids whose total Highscore just changed, for a brief highlight
 * flash - the FLIP hook above only knows about DOM positions, not score
 * values, so this tracks the previous score per player separately and
 * diffs against it whenever a fresh `entries` array comes in.
 */
function useScoreFlash(entries: LeaderboardEntry[]): Set<string> {
  const [flashingIds, setFlashingIds] = useState<Set<string>>(new Set())
  const prevScoresRef = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const prevScores = prevScoresRef.current
    const changed = new Set<string>()
    for (const entry of entries) {
      const prev = prevScores.get(entry.playerId)
      if (prev !== undefined && prev !== entry.score) changed.add(entry.playerId)
    }
    prevScoresRef.current = new Map(entries.map((e) => [e.playerId, e.score]))
    if (changed.size === 0) return
    setFlashingIds(changed)
    const timeout = setTimeout(() => setFlashingIds(new Set()), FLASH_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [entries])

  return flashingIds
}

function LeaderboardScene({ eventId, accent, refreshSignal }: { eventId: string; accent: string; refreshSignal: number }) {
  const [entries, setEntries] = useState<LeaderboardEntry[] | null>(null)
  const [page, setPage] = useState(0)
  const [maxColumns, setMaxColumns] = useState(MAX_GAME_COLUMNS_DEFAULT)
  const [isPaused, setIsPaused] = useState(false)
  const [rotateMs, setRotateMs] = useState(PAGE_ROTATE_MS_DEFAULT)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = (message: string) => {
    setToastMessage(message)
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    toastTimeoutRef.current = setTimeout(() => setToastMessage(null), TOAST_DURATION_MS)
  }
  useEffect(() => () => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = () =>
      api
        .getLeinwandLeaderboard(eventId)
        .then((result) => {
          if (!cancelled) setEntries(result)
        })
        .catch(() => {})
    load()
    const interval = setInterval(load, 15000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
    // refreshSignal bumps whenever any game in the event finishes (see
    // LeinwandView) - reloads right away instead of waiting out the rest
    // of the 15s poll interval, matching the old system's MQTT-driven
    // "game finished" reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, refreshSignal])

  const sorted = entries ? [...entries].sort((a, b) => b.score - a.score) : []
  const totalPages = Math.max(1, Math.ceil(sorted.length / PLAYERS_PER_PAGE))

  useEffect(() => {
    setPage(0)
  }, [sorted.length])

  useEffect(() => {
    if (totalPages <= 1 || isPaused) return
    const interval = setInterval(() => setPage((p) => (p + 1) % totalPages), rotateMs)
    return () => clearInterval(interval)
  }, [totalPages, isPaused, rotateMs])

  // Keyboard controls for whoever's operating the screen - same shortcuts
  // as the old system's scoreboard-table-client.tsx: arrows to page/adjust
  // the rotation timer by hand, space to pause auto-rotation, m/n to show
  // more/fewer per-game columns. A toast confirms each change since there's
  // no other feedback on a screen nobody's looking at up close.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        setPage((p) => (p + 1) % totalPages)
      } else if (event.key === 'ArrowLeft') {
        setPage((p) => (p - 1 + totalPages) % totalPages)
      } else if (event.key === 'ArrowUp') {
        setRotateMs((prev) => {
          const next = prev + 1000
          showToast(`Timer: ${next / 1000} Sekunden`)
          return next
        })
      } else if (event.key === 'ArrowDown') {
        setRotateMs((prev) => {
          const next = Math.max(prev - 1000, 1000)
          showToast(`Timer: ${next / 1000} Sekunden`)
          return next
        })
      } else if (event.key === ' ') {
        event.preventDefault()
        setIsPaused((prev) => {
          const next = !prev
          showToast(next ? 'Pause' : 'Fortsetzen')
          return next
        })
      } else if (event.key === 'm') {
        setMaxColumns((prev) => {
          const next = prev + 1
          showToast(`Max. angezeigte Spiele: ${next}`)
          return next
        })
      } else if (event.key === 'n') {
        setMaxColumns((prev) => {
          const next = Math.max(prev - 1, 1)
          showToast(`Max. angezeigte Spiele: ${next}`)
          return next
        })
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [totalPages])

  const columnCount = Math.min(maxColumns, sorted.reduce((max, e) => Math.max(max, e.gamesPlayed), 0))
  const pageEntries = sorted.slice(page * PLAYERS_PER_PAGE, (page + 1) * PLAYERS_PER_PAGE)
  const setRowRef = useLeaderboardRowFlip(pageEntries.map((e) => e.playerId).join(','))
  const flashingIds = useScoreFlash(sorted)

  return (
    <div>
      <h2 style={{ margin: '0 0 0.8rem', fontSize: '1.3rem' }}>Vorrunden-Rangliste</h2>
      {toastMessage && (
        <div
          className="lpd-fade-in"
          style={{
            position: 'fixed',
            bottom: '1.2rem',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'rgba(11,10,9,0.9)',
            border: `1px solid ${accent}`,
            borderRadius: '0.5rem',
            padding: '0.5rem 1.1rem',
            fontSize: '0.9rem',
            zIndex: 20,
          }}
        >
          {toastMessage}
        </div>
      )}
      {entries === null && <p>Lädt…</p>}
      {entries !== null && entries.length === 0 && <p style={{ opacity: 0.7 }}>Keine laufende Vorrunde.</p>}
      {sorted.length > 0 && (
        <div key={page} className="lpd-fade-in-slow" style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', fontVariantNumeric: 'tabular-nums' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '0.4rem 0.8rem', opacity: 0.7, fontWeight: 400, fontSize: '0.9rem' }}>Spieler</th>
                {Array.from({ length: columnCount }, (_, i) => (
                  <th key={i} style={{ padding: '0.4rem 0.5rem' }} />
                ))}
                <th style={{ textAlign: 'right', padding: '0.4rem 0.8rem', opacity: 0.7, fontWeight: 400, fontSize: '0.9rem' }}>Highscore</th>
              </tr>
            </thead>
            <tbody>
              {pageEntries.map((entry, i) => {
                const isLeader = page === 0 && i === 0
                const isFlashing = flashingIds.has(entry.playerId)
                return (
                <tr
                  key={entry.playerId}
                  ref={setRowRef(entry.playerId)}
                  className={isFlashing ? 'lpd-leaderboard-flash' : undefined}
                  style={{
                    borderTop: 'rgba(255,255,255,0.08) 1px solid',
                    ...(isLeader
                      ? { boxShadow: `inset 0 0 0 1px #f7c202, 0 0 0.6rem rgba(247,194,2,0.35)`, background: 'rgba(247,194,2,0.06)' }
                      : {}),
                    ...({ '--lpd-flash-color': accent } as React.CSSProperties),
                  }}
                >
                  <td style={{ padding: '0.5rem 0.8rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {isLeader && '🏆 '}
                    {page * PLAYERS_PER_PAGE + i + 1}. {entry.playerName}
                  </td>
                  {Array.from({ length: columnCount }, (_, col) => {
                    const score = entry.gameScores[col]
                    // Highlights however many games actually count toward
                    // this tournament's Highscore column - its own
                    // qualificationBestOf setting - rather than the old
                    // system's hardcoded "always the best 3 columns",
                    // which didn't actually track its equivalent bestOfX
                    // setting and could highlight the wrong number of
                    // games whenever that wasn't exactly 3.
                    const isCounted = col < entry.gamesCounted && score !== undefined
                    return (
                      <td
                        key={col}
                        style={{
                          textAlign: 'center',
                          padding: '0.35rem 0.5rem',
                          borderRadius: '0.3rem',
                          fontWeight: isCounted ? 700 : 400,
                          background: isCounted ? `${accent}33` : 'transparent',
                          color: isCounted ? accent : 'white',
                          opacity: score === undefined ? 0.35 : 1,
                        }}
                      >
                        {score ?? '/'}
                      </td>
                    )
                  })}
                  <td style={{ textAlign: 'right', padding: '0.5rem 0.8rem', fontWeight: 700, fontSize: '1.1rem' }}>
                    <AnimatedNumber value={entry.score} from={entry.score} />
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
          {totalPages > 1 && (
            <p style={{ margin: '0.6rem 0 0', textAlign: 'right', fontSize: '0.78rem', opacity: 0.6 }}>
              Seite {page + 1}/{totalPages}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function HighlightOverlay({ playerName, score }: { playerName: string; score: number }) {
  return (
    <div
      className="lpd-pop-in"
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1rem',
        background: 'rgba(11, 10, 9, 0.92)',
        zIndex: 10,
      }}
    >
      <p className="lpd-pulse" style={{ fontSize: 'clamp(4rem, 16vw, 10rem)', fontWeight: 700, margin: 0, color: SUCCESS, lineHeight: 1 }}>
        {score}!
      </p>
      <p style={{ fontSize: 'clamp(1.5rem, 5vw, 3rem)', margin: 0 }}>{playerName}</p>
    </div>
  )
}
