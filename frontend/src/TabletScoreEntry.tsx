import { useEffect, useRef, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { Lottie } from 'lottie-react'
import { API_BASE_URL, api, type EventBranding, type Game, type GameEntry, type PairingPlayer, type PairingRoster } from './api'
import { brandingColors } from './LiveGameView'
import { DANGER, SUCCESS } from './theme'
import logo from './assets/logo-full-transparent.svg'

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  )
}

function RefreshIcon({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      className={spinning ? 'lpd-spin' : undefined}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  )
}

// Winner, honoring a resolved tie first - same precedence KnockoutEndpoints'
// WinnerOf() uses server-side.
function winningEntry(game: Game): GameEntry | null {
  if (game.tiebreakWinnerId) return game.entries.find((e) => e.playerId === game.tiebreakWinnerId) ?? null
  if (game.mode === 'X01') return game.entries.find((e) => e.remaining === 0) ?? null
  return [...game.entries].sort((a, b) => b.total - a.total)[0] ?? null
}

const MAX_SCORE = 180

/**
 * Score entry screen for a paired Tablet. No login - authorized purely by
 * the device's pairing to its board (see DeviceEndpoints.MapPost
 * ".../turns" on the backend, which checks the pairing before accepting
 * a score). Stays live-in-sync via the board's SignalR group so it
 * reflects turns entered from the Regie too, and follows a new game
 * automatically once the current one finishes. Uses a large on-screen
 * number pad rather than the platform keyboard (project plan 3.1:
 * "Tablet-Eingabe mit großem Ziffernblock").
 */
type PendingTurn = { playerId: string; score: number }

export function TabletScoreEntry({
  eventId,
  clientDeviceId,
  boardId,
  onGoToStartMenu,
}: {
  eventId: string
  clientDeviceId: string
  boardId: string
  onGoToStartMenu: () => void
}) {
  const [game, setGame] = useState<Game | null | undefined>(undefined)

  // Nearly every size in this file is in rem, which is always relative to
  // the root <html> element, never to a styled ancestor - so a font-size
  // set on this component's own wrapper does nothing for them (only a
  // plain unstyled text node would ever see it). Bumping the actual root
  // size while the Tablet is mounted is what makes the rem-based numpad,
  // table, and labels genuinely scale up - reverted on unmount since only
  // one of the app's views is ever mounted in this document at a time, but
  // the root font-size itself is shared, document-wide state.
  useEffect(() => {
    const previous = document.documentElement.style.fontSize
    document.documentElement.style.fontSize = '112%'
    return () => {
      document.documentElement.style.fontSize = previous
    }
  }, [])

  // Prefilled by the nav menu's "Bearbeiten": cancelling the running game
  // keeps its players selected on the "Neues Spiel" screen that follows,
  // instead of starting from an empty pick list.
  const [editPrefillPlayers, setEditPrefillPlayers] = useState<PairingPlayer[] | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  // 'end' asks to abandon the game outright; 'edit' asks to abandon it and
  // reopen "Neues Spiel" with the same players preselected.
  const [confirmAction, setConfirmAction] = useState<'end' | 'edit' | null>(null)
  const [menuError, setMenuError] = useState<string | null>(null)
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const [branding, setBranding] = useState<EventBranding | null>(null)
  const [pendingCount, setPendingCount] = useState(0)
  const [boardNumber, setBoardNumber] = useState<number | null>(null)

  // Offline buffering ("Tablets puffern Eingaben: Bricht das WLAN kurz ab,
  // gehen keine Scores verloren", project plan 3.6). Persisted to
  // localStorage, not just in-memory state, so a queued throw also
  // survives the tablet being closed/crashing before the connection comes
  // back. Turns are replayed one at a time, in order - the server enforces
  // alternating turn order, so sending them out of order or in parallel
  // would just fail again.
  const queueKey = `lpd_pending_turns_${clientDeviceId}`
  const readQueue = (): PendingTurn[] => {
    try {
      return JSON.parse(localStorage.getItem(queueKey) ?? '[]')
    } catch {
      return []
    }
  }
  const writeQueue = (queue: PendingTurn[]) => {
    localStorage.setItem(queueKey, JSON.stringify(queue))
    setPendingCount(queue.length)
  }

  const flushQueue = async () => {
    let queue = readQueue()
    while (queue.length > 0) {
      const [next, ...rest] = queue
      try {
        const updated = await api.submitTabletTurn(eventId, clientDeviceId, next.playerId, next.score)
        setGame(updated)
        queue = rest
        writeQueue(queue)
      } catch (err) {
        // fetch itself throwing (not an HTTP error response) means still
        // offline - stop here and let the next reconnect/online event retry.
        if (err instanceof TypeError) return
        // A real rejection (e.g. the game finished while queued) can't
        // become valid by retrying it - drop it rather than getting stuck.
        queue = rest
        writeQueue(queue)
      }
    }
  }

  const submitTurn = async (playerId: string, score: number) => {
    try {
      const updated = await api.submitTabletTurn(eventId, clientDeviceId, playerId, score)
      setGame(updated)
    } catch (err) {
      if (!(err instanceof TypeError)) throw err
      writeQueue([...readQueue(), { playerId, score }])
    }
  }

  // "Spiel wiederholen" on the post-game screen: same players, same
  // board/tournament, but a freshly shuffled throwing order (rather than
  // just repeating the same order every time) - the just-finished game
  // itself is left untouched, so its recorded results still count towards
  // the leaderboard exactly as they did before.
  const [repeating, setRepeating] = useState(false)
  const [repeatError, setRepeatError] = useState<string | null>(null)
  const repeatGame = async () => {
    if (!game) return
    setRepeating(true)
    setRepeatError(null)
    try {
      const shuffledPlayerIds = game.entries.map((e) => e.playerId)
      for (let i = shuffledPlayerIds.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffledPlayerIds[i], shuffledPlayerIds[j]] = [shuffledPlayerIds[j], shuffledPlayerIds[i]]
      }
      const newGame = await api.createGame(game.tournamentId, game.boardId, shuffledPlayerIds)
      setGame(newGame)
    } catch (err) {
      setRepeatError(err instanceof Error ? err.message : String(err))
    } finally {
      setRepeating(false)
    }
  }

  useEffect(() => {
    setPendingCount(readQueue().length)
    flushQueue()
    window.addEventListener('online', flushQueue)
    return () => window.removeEventListener('online', flushQueue)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, clientDeviceId])

  useEffect(() => {
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
  }, [eventId])

  // Board number for the "Board N" header (old system's play-screen.tsx) -
  // getPairingBoards is the one board-listing endpoint this unauthenticated
  // device can actually reach.
  useEffect(() => {
    let cancelled = false
    api
      .getPairingBoards(eventId)
      .then((boards) => {
        if (!cancelled) setBoardNumber(boards.find((b) => b.id === boardId)?.number ?? null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [eventId, boardId])

  useEffect(() => {
    let cancelled = false

    api.getCurrentGameForBoard(boardId).then((initial) => {
      if (cancelled) return
      // getCurrentGameForBoard falls back to the board's most recent game
      // even once it's Finished (useful for the Board-Monitor/Leinwand,
      // which should keep showing final results until a new game starts) -
      // but re-pairing the Tablet to a board it just left via "Zurück zum
      // Startmenü" should go straight to a fresh "Neues Spiel" instead of
      // showing that same already-finished game again. A tie still awaiting
      // a decision is the one exception - that genuinely needs resolving,
      // not skipping.
      const needsTieResolution =
        initial?.status === 'Finished' && initial.isTied && initial.knockoutMatchId !== null && initial.tiebreakWinnerId === null
      setGame(initial && initial.status === 'Finished' && !needsTieResolution ? null : initial)
    })

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/game`)
      .withAutomaticReconnect()
      .build()

    connection.on('gameUpdated', (updated: Game) => setGame(updated))
    connection.on('gameStarted', (started: Game) => setGame(started))
    connection.onreconnecting(() => setConnectionState('connecting'))
    connection.onreconnected(() => {
      setConnectionState('connected')
      connection.invoke('JoinBoard', boardId)
      connection.invoke('RegisterDevice', clientDeviceId)
      flushQueue()
    })
    connection.onclose(() => setConnectionState('disconnected'))

    connection
      .start()
      .then(async () => {
        setConnectionState('connected')
        await connection.invoke('JoinBoard', boardId)
        await connection.invoke('RegisterDevice', clientDeviceId)
        flushQueue()
      })
      .catch(() => setConnectionState('disconnected'))

    return () => {
      cancelled = true
      connection.stop()
    }
  }, [boardId, clientDeviceId])

  // "Beenden" abandons the game and goes straight back to "Warte auf
  // Zuweisung" - it's meant to hand the board off, not to immediately
  // set up another game on it. "Bearbeiten" also abandons the game, but
  // carries the current players over to the "Neues Spiel" screen that
  // follows instead, so the scorer can swap someone out instead of
  // re-picking everyone. Both delete the game outright (see the backend
  // endpoint's own comment) - there's no partial "edit players in place"
  // for a game with recorded throws, same trade-off Game.ChangeBoard
  // already documents.
  const confirmMenuAction = async () => {
    if (!confirmAction || !game) return
    setMenuError(null)
    try {
      await api.cancelTabletGame(eventId, clientDeviceId)
      if (confirmAction === 'edit') {
        setEditPrefillPlayers(game.entries.map((e) => ({ id: e.playerId, displayName: e.playerName })))
        setGame(null)
      } else {
        onGoToStartMenu()
      }
    } catch (err) {
      setMenuError(err instanceof Error ? err.message : String(err))
    } finally {
      setConfirmAction(null)
    }
  }

  const { primary, secondary } = brandingColors(branding)

  const wrapperStyle: React.CSSProperties = {
    height: '100vh',
    overflow: 'hidden',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    padding: '1.2rem',
    background: secondary,
    color: primary,
    fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
    '--lpd-accent': primary,
  } as React.CSSProperties

  return (
    <main className="lpd-tablet" style={wrapperStyle}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', flexShrink: 0 }}>
        {/* The app's own logo, not customer branding - there's no
            spectator-facing branding on the Tablet at all, but the scorer
            still benefits from a bit of app chrome to navigate by. */}
        <img src={logo} alt="LetsPlayDarts" height={40} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem' }}>
          {pendingCount > 0 && (
            <span style={{ fontSize: '0.75rem', opacity: 0.85 }}>
              {pendingCount} {pendingCount === 1 ? 'Wurf' : 'Würfe'} werden nachgereicht…
            </span>
          )}
          <span
            title={`Verbindung: ${connectionState}`}
            style={{
              width: '0.65rem',
              height: '0.65rem',
              borderRadius: '50%',
              background: connectionState === 'connected' ? SUCCESS : connectionState === 'connecting' ? '#e8b800' : DANGER,
            }}
          />
          {/* Hidden once the game is finished - "Beenden"/"Bearbeiten" only
              ever applied to a running game anyway (both stay disabled
              here otherwise), and the post-game screen already has its own
              "Zurück zum Startmenü" button, so the menu would just be a
              mostly-greyed-out dead end. */}
          {game?.status !== 'Finished' && (
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Menü"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '2.2rem',
                height: '2.2rem',
                border: `1px solid ${primary}`,
                borderRadius: '0.5rem',
                background: menuOpen ? primary : 'transparent',
                color: menuOpen ? '#0b0a09' : primary,
                cursor: 'pointer',
              }}
            >
              <MenuIcon />
            </button>
          )}
        </div>

        {menuOpen && game?.status !== 'Finished' && (
          <>
            {/* Full-page click-catcher to close the menu on an outside tap,
                same pattern as the throw-correction overlay. */}
            <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setMenuOpen(false)} />
            <div
              style={{
                position: 'absolute',
                top: 'calc(100% + 0.5rem)',
                right: 0,
                zIndex: 1000,
                background: '#150f09',
                border: `1px solid ${primary}`,
                borderRadius: '0.6rem',
                overflow: 'hidden',
                minWidth: '10rem',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <button
                type="button"
                disabled={!game || game.status !== 'InProgress'}
                onClick={() => {
                  setMenuOpen(false)
                  setConfirmAction('end')
                }}
                style={{
                  padding: '0.8rem 1rem',
                  border: 'none',
                  borderBottom: `1px solid color-mix(in srgb, ${primary} 22%, transparent)`,
                  background: 'transparent',
                  color: DANGER,
                  textAlign: 'left',
                  fontSize: '0.95rem',
                  cursor: game && game.status === 'InProgress' ? 'pointer' : 'default',
                  opacity: game && game.status === 'InProgress' ? 1 : 0.4,
                }}
              >
                Beenden
              </button>
              <button
                type="button"
                disabled={!game || game.status !== 'InProgress'}
                onClick={() => {
                  setMenuOpen(false)
                  setConfirmAction('edit')
                }}
                style={{
                  padding: '0.8rem 1rem',
                  border: 'none',
                  background: 'transparent',
                  color: primary,
                  textAlign: 'left',
                  fontSize: '0.95rem',
                  cursor: game && game.status === 'InProgress' ? 'pointer' : 'default',
                  opacity: game && game.status === 'InProgress' ? 1 : 0.4,
                }}
              >
                Bearbeiten
              </button>
            </div>
          </>
        )}
      </header>

      {confirmAction && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.5rem',
          }}
        >
          <div
            style={{
              background: '#150f09',
              border: `1px solid ${primary}`,
              borderRadius: '0.6rem',
              padding: '1.2rem',
              maxWidth: '24rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.9rem',
            }}
          >
            <p style={{ margin: 0, fontWeight: 700 }}>
              {confirmAction === 'end' ? 'Spiel wirklich beenden?' : 'Spieler bearbeiten?'}
            </p>
            <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.85 }}>
              {confirmAction === 'end'
                ? 'Das laufende Spiel und alle bisherigen Würfe werden verworfen.'
                : 'Das laufende Spiel wird verworfen, die Spieler bleiben auf der nächsten Seite vorausgewählt.'}
            </p>
            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setConfirmAction(null)}
                style={{ border: `1px solid ${primary}`, background: 'transparent', color: primary, borderRadius: '0.5rem', padding: '0.6rem 1rem', cursor: 'pointer' }}
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={confirmMenuAction}
                style={{ border: `1px solid ${DANGER}`, background: DANGER, color: '#0b0a09', fontWeight: 700, borderRadius: '0.5rem', padding: '0.6rem 1rem', cursor: 'pointer' }}
              >
                {confirmAction === 'end' ? 'Ja, beenden' : 'Ja, bearbeiten'}
              </button>
            </div>
          </div>
        </div>
      )}

      {menuError && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {menuError}
        </p>
      )}

      {game === undefined && <p style={{ textAlign: 'center', opacity: 0.7 }}>Lädt…</p>}
      {game === null && (
        <NewGameOnBoard
          eventId={eventId}
          boardId={boardId}
          boardNumber={boardNumber}
          accent={primary}
          onGameStarted={setGame}
          initialSelectedPlayers={editPrefillPlayers}
        />
      )}
      {game && (
        <TurnEntryForm
          game={game}
          onSubmitTurn={submitTurn}
          onUndoTurn={(playerId) => api.undoTabletTurn(eventId, clientDeviceId, playerId).then(setGame)}
          onEditTurn={(playerId, throwIndex, score) => api.editTabletTurn(eventId, clientDeviceId, playerId, throwIndex, score).then(setGame)}
          onResolveTie={(winnerId) => api.resolveGameTie(eventId, clientDeviceId, winnerId).then(setGame)}
          onNewGame={() => setGame(null)}
          onRepeatGame={repeatGame}
          repeatingGame={repeating}
          repeatError={repeatError}
          onGoToStartMenu={onGoToStartMenu}
          accent={primary}
          boardNumber={boardNumber}
        />
      )}
    </main>
  )
}

/** Regie's own "Neues Turnier"-Vorbelegung (TournamentForm in EventDetailView.tsx) - reused here so a Tablet-created starter tournament matches what a human would have picked. */
const DEFAULT_TOURNAMENT_SETTINGS = {
  qualificationMode: 'Highscore' as const,
  qualificationRounds: 8,
  finalMode: 'X01' as const,
  finalStartScore: 501,
  qualificationBestOf: 3,
}

/**
 * Shown on a paired Tablet when its board has no active game - lets the
 * scorer pick who's playing, from the roster the Regie already entered,
 * and start the game right at the board instead of needing the Regie to do
 * it. Creating a starter tournament stays open to this unauthenticated
 * device (so a still-empty event never dead-ends "Spiel starten"), but
 * adding/correcting a player does not - that reverted back to Regie-only,
 * same as everything else on that entity (see EventEndpoints.cs).
 *
 * Player selection mirrors the old system's create-game screen exactly
 * (games-form.tsx, "Verfügbare Spieler" / "Ausgewählte Spieler" with
 * →/← to move players between them) rather than a plain checkbox list.
 */
function NewGameOnBoard({
  eventId,
  boardId,
  boardNumber,
  accent,
  onGameStarted,
  initialSelectedPlayers,
}: {
  eventId: string
  boardId: string
  boardNumber: number | null
  accent: string
  onGameStarted: (game: Game) => void
  initialSelectedPlayers?: PairingPlayer[] | null
}) {
  const [roster, setRoster] = useState<PairingRoster | null>(null)
  const [tournamentId, setTournamentId] = useState<string | null>(null)
  // Always shown, matching the old system: it had no shared tournament
  // concept at all, so every game freely carried its own mode/rounds. Our
  // games still hang off a shared tournament's qualification settings, so
  // picking a different mode/rounds here updates that tournament right
  // before creating the game (see handleStart) - only the games already
  // created keep their own recorded settings, so this doesn't disturb them.
  // Prefilled from the existing tournament's current settings once loadRoster
  // resolves, rather than always starting from a hardcoded default.
  const [mode, setMode] = useState<'Highscore' | 'X01'>(DEFAULT_TOURNAMENT_SETTINGS.qualificationMode)
  const [rounds, setRounds] = useState(String(DEFAULT_TOURNAMENT_SETTINGS.qualificationRounds))
  const [startScore, setStartScore] = useState<'301' | '501'>('501')
  // Carried over from the nav menu's "Bearbeiten" (see TabletScoreEntry) so
  // the just-cancelled game's players don't have to be re-picked from
  // scratch - only useState's initial value, so later changes to the prop
  // itself (there aren't any within one mount) wouldn't re-seed this.
  const [selectedPlayers, setSelectedPlayers] = useState<PairingPlayer[]>(initialSelectedPlayers ?? [])
  const [search, setSearch] = useState('')
  const [highlightedAvailable, setHighlightedAvailable] = useState<Set<string>>(new Set())
  const [highlightedSelected, setHighlightedSelected] = useState<Set<string>>(new Set())
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A player already mid-game on another board can't be picked here either
  // (see FindPlayerAlreadyInProgressAsync on the backend, and the same
  // check in GamePanel's Regie-side "Neues Spiel") - left off "Verfügbare
  // Spieler" entirely instead of only failing after "Spiel starten" is
  // tapped.
  const [busyPlayerIds, setBusyPlayerIds] = useState<Set<string>>(new Set())

  // Reused by the initial load and by the "Aktualisieren" button next to
  // "Verfügbare Spieler" - a player the Regie adds while this screen is
  // already open otherwise never shows up without leaving and re-pairing.
  const rosterLoadCancelled = useRef(false)
  const loadRoster = () => {
    rosterLoadCancelled.current = false
    api
      .getPairingRoster(eventId)
      .then((result) => {
        if (rosterLoadCancelled.current) return
        setRoster(result)
        setTournamentId(result.tournamentId)
        if (result.qualificationSettings) {
          const settings = result.qualificationSettings
          setMode(settings.mode)
          if (settings.mode === 'Highscore') setRounds(String(settings.rounds ?? DEFAULT_TOURNAMENT_SETTINGS.qualificationRounds))
          else setStartScore(settings.startScore === 301 ? '301' : '501')
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
  }

  // A changed key replays the CSS spin from scratch, independent of how
  // fast the fetch itself resolves (often near-instant on the venue's own
  // LAN) - the only feedback an icon-only button has that a tap landed.
  const [refreshSpinKey, setRefreshSpinKey] = useState(0)
  const handleRefreshClick = () => {
    setRefreshSpinKey((k) => k + 1)
    loadRoster()
  }

  useEffect(() => {
    loadRoster()
    return () => {
      rosterLoadCancelled.current = true
    }
  }, [eventId])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      api
        .getBusyPlayers(eventId)
        .then((ids) => {
          if (!cancelled) setBusyPlayerIds(new Set(ids))
        })
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, 4000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [eventId])

  // A player checked here who then starts a game elsewhere (the Regie,
  // another Tablet) would otherwise stay silently selected until submit.
  useEffect(() => {
    setSelectedPlayers((prev) => prev.filter((p) => !busyPlayerIds.has(p.id)))
    setHighlightedAvailable((prev) => {
      if (![...prev].some((id) => busyPlayerIds.has(id))) return prev
      const next = new Set(prev)
      for (const id of busyPlayerIds) next.delete(id)
      return next
    })
  }, [busyPlayerIds])

  const availablePlayers = (roster?.players ?? [])
    .filter((p) => !selectedPlayers.some((s) => s.id === p.id) && !busyPlayerIds.has(p.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'))
  const filteredAvailable = search.trim()
    ? availablePlayers.filter((p) => p.displayName.toLowerCase().includes(search.trim().toLowerCase()))
    : availablePlayers

  const toggleAvailable = (playerId: string) => {
    setHighlightedAvailable((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })
  }

  const toggleSelected = (playerId: string) => {
    setHighlightedSelected((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else next.add(playerId)
      return next
    })
  }

  const moveToSelected = () => {
    if (highlightedAvailable.size === 0) return
    const toMove = availablePlayers.filter((p) => highlightedAvailable.has(p.id))
    setSelectedPlayers((prev) => [...prev, ...toMove])
    setHighlightedAvailable(new Set())
  }

  const moveToAvailable = () => {
    if (highlightedSelected.size === 0) return
    setSelectedPlayers((prev) => prev.filter((p) => !highlightedSelected.has(p.id)))
    setHighlightedSelected(new Set())
  }

  const handleStart = async () => {
    if (selectedPlayers.length === 0) return
    setStarting(true)
    setError(null)
    try {
      let activeTournamentId = tournamentId
      if (!activeTournamentId) {
        // No tournament yet for this event - create one from the
        // mode/rounds picked above, same settings shape the Regie's own
        // "Neues Turnier" form submits.
        const tournament = await api.createTournament(eventId, {
          ...DEFAULT_TOURNAMENT_SETTINGS,
          qualificationMode: mode,
          qualificationRounds: mode === 'Highscore' ? Number(rounds) : undefined,
          qualificationStartScore: mode === 'X01' ? Number(startScore) : undefined,
        })
        activeTournamentId = tournament.id
        setTournamentId(tournament.id)
      } else {
        // A tournament already exists - sync its qualification settings to
        // whatever's picked above before creating the game, so this game
        // (and any after it, until changed again) gets the chosen
        // mode/rounds rather than whatever the tournament happened to have.
        // Games already created keep their own recorded settings either way.
        await api.updateQualificationSettings(eventId, activeTournamentId, {
          mode,
          rounds: mode === 'Highscore' ? Number(rounds) : undefined,
          startScore: mode === 'X01' ? Number(startScore) : undefined,
        })
      }
      const game = await api.createGame(
        activeTournamentId,
        boardId,
        selectedPlayers.map((p) => p.id),
      )
      onGameStarted(game)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  // A solid dark background (not "transparent") plus explicitly disabling
  // the native control appearance - on a real tablet's mobile browser,
  // <input>/<select> otherwise keep their platform chrome (a white,
  // heavily rounded box) no matter what background/border is set here.
  const inputStyle: React.CSSProperties = {
    boxSizing: 'border-box',
    border: `1px solid ${accent}`,
    background: '#150f09',
    color: accent,
    borderRadius: '0.5rem',
    padding: '0.6rem',
    fontSize: '0.95rem',
    WebkitAppearance: 'none',
    appearance: 'none',
  }

  // Mode/startScore used to be native <select> dropdowns - on a touch
  // device, the popup list itself is rendered by the OS and simply cannot
  // be restyled at all (unlike the closed control), so it always showed up
  // as a plain white system list no matter what CSS was applied. A small
  // fixed set of choices reads better as an always-visible toggle anyway,
  // same reasoning as the on-screen numpad replacing the platform keyboard.
  const toggleButtonStyle = (active: boolean): React.CSSProperties => ({
    border: 'none',
    padding: '0.6rem 0.9rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    background: active ? accent : 'transparent',
    color: active ? '#0b0a09' : accent,
  })

  const listStyle: React.CSSProperties = {
    border: `1px solid ${accent}`,
    borderRadius: '0.5rem',
    maxHeight: '13rem',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  }

  const rowStyle = (highlighted: boolean): React.CSSProperties => ({
    padding: '0.6rem 0.7rem',
    fontSize: '0.95rem',
    cursor: 'pointer',
    background: highlighted ? `${accent}33` : 'transparent',
  })

  if (!roster) return <p style={{ textAlign: 'center', opacity: 0.7 }}>Lädt…</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.2rem' }}>
      {boardNumber !== null && <h1 style={{ margin: 0, fontSize: '1.2rem' }}>Neues Spiel – Board {boardNumber}</h1>}

      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleRefreshClick}
        aria-label="Aktualisieren"
        title="Aktualisieren"
        style={{
          ...inputStyle,
          position: 'fixed',
          top: '1.2rem',
          right: '4.2rem',
          width: '2.2rem',
          height: '2.2rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          lineHeight: 0,
          zIndex: 1,
        }}
      >
        <RefreshIcon key={refreshSpinKey} spinning={refreshSpinKey > 0} />
      </button>

      {/* Always shown, matching the old system - see the comment on mode's
          own useState above for why picking here can affect an existing
          tournament's settings rather than only ever creating a new one. */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.9rem', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem' }}>
          Spielmodus
          <div style={{ display: 'flex', border: `1px solid ${accent}`, borderRadius: '0.5rem', overflow: 'hidden' }}>
            {(['Highscore', 'X01'] as const).map((m) => (
              <button key={m} type="button" onClick={() => setMode(m)} className="lpd-numpad-cell" style={toggleButtonStyle(mode === m)}>
                {m}
              </button>
            ))}
          </div>
        </label>
        {mode === 'Highscore' ? (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem' }}>
            Anzahl Runden
            <input type="number" min="1" value={rounds} onChange={(e) => setRounds(e.target.value)} style={{ ...inputStyle, width: '6rem' }} />
          </label>
        ) : (
          <label style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem' }}>
            Startwert
            <div style={{ display: 'flex', border: `1px solid ${accent}`, borderRadius: '0.5rem', overflow: 'hidden' }}>
              {(['301', '501'] as const).map((s) => (
                <button key={s} type="button" onClick={() => setStartScore(s)} className="lpd-numpad-cell" style={toggleButtonStyle(startScore === s)}>
                  {s}
                </button>
              ))}
            </div>
          </label>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'stretch' }}>
        <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
          <h2 style={{ margin: '0 0 0.6rem', fontSize: '1rem' }}>Verfügbare Spieler ({filteredAvailable.length})</h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Spieler suchen…"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            style={{ ...inputStyle, width: '100%', marginBottom: '0.5rem' }}
          />
          <div style={listStyle}>
            {filteredAvailable.length === 0 && <p style={{ opacity: 0.7, fontSize: '0.85rem', margin: '0.6rem 0.7rem' }}>Keine Spieler verfügbar.</p>}
            {filteredAvailable.map((player) => (
              <div key={player.id} onClick={() => toggleAvailable(player.id)} style={rowStyle(highlightedAvailable.has(player.id))}>
                {player.displayName}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '0.6rem' }}>
          <button type="button" onClick={moveToSelected} disabled={highlightedAvailable.size === 0} style={inputStyle}>
            Hinzufügen →
          </button>
          <button type="button" onClick={moveToAvailable} disabled={highlightedSelected.size === 0} style={inputStyle}>
            ← Entfernen
          </button>
        </div>

        <div style={{ flex: '1 1 14rem', minWidth: 0 }}>
          <h2 style={{ margin: '0 0 0.6rem', fontSize: '1rem' }}>Ausgewählte Spieler ({selectedPlayers.length})</h2>
          <div style={listStyle}>
            {selectedPlayers.length === 0 && <p style={{ opacity: 0.7, fontSize: '0.85rem', margin: '0.6rem 0.7rem' }}>Keine Spieler ausgewählt.</p>}
            {selectedPlayers.map((player, index) => (
              <div key={player.id} onClick={() => toggleSelected(player.id)} style={rowStyle(highlightedSelected.has(player.id))}>
                {index + 1}. {player.displayName}
              </div>
            ))}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleStart}
        disabled={starting || selectedPlayers.length === 0}
        style={{
          border: `1px solid ${accent}`,
          background: accent,
          color: '#0b0a09',
          borderRadius: '0.6rem',
          fontWeight: 700,
          fontSize: '1.1rem',
          padding: '1rem',
          cursor: 'pointer',
          opacity: starting || selectedPlayers.length === 0 ? 0.5 : 1,
        }}
      >
        {starting ? 'Wird gestartet…' : 'Spiel starten'}
      </button>
    </div>
  )
}

function TurnEntryForm({
  game,
  onSubmitTurn,
  onUndoTurn,
  onEditTurn,
  onResolveTie,
  onNewGame,
  onRepeatGame,
  repeatingGame,
  repeatError,
  onGoToStartMenu,
  accent,
  boardNumber,
}: {
  game: Game
  onSubmitTurn: (playerId: string, score: number) => Promise<void>
  onUndoTurn: (playerId: string) => Promise<void>
  onEditTurn: (playerId: string, throwIndex: number, score: number) => Promise<void>
  onResolveTie: (winnerId: string) => Promise<void>
  onNewGame: () => void
  onRepeatGame: () => void
  repeatingGame: boolean
  repeatError: string | null
  onGoToStartMenu: () => void
  accent: string
  boardNumber: number | null
}) {
  const currentEntry = game.entries.find((e) => e.playerId === game.currentTurnPlayerId)
  // The table has its own scroll region now (sticky header, scrollable
  // rows) - with enough players the active one could scroll out of sight
  // right when it becomes their turn, same reason LiveGameView's Board-
  // Monitor table auto-scrolls its active row into view. Not plain
  // scrollIntoView, though: it has no notion of the sticky <thead> sitting
  // on top of the scrolled content, so scrolling row 1 "into view" lands
  // it right at the container's true top edge - exactly where the header
  // then renders over it. Scrolling manually, measuring the header's own
  // height and treating it as dead space at the top, keeps the row fully
  // clear of it.
  const activeRowRef = useRef<HTMLTableRowElement | null>(null)
  useEffect(() => {
    const row = activeRowRef.current
    const container = row?.closest('table')?.parentElement
    if (!row || !container) return
    const headerHeight = container.querySelector('thead')?.getBoundingClientRect().height ?? 0
    const rowRect = row.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const hiddenAbove = containerRect.top + headerHeight - rowRect.top
    const hiddenBelow = rowRect.bottom - containerRect.bottom
    if (hiddenAbove > 0) container.scrollBy({ top: -hiddenAbove, behavior: 'smooth' })
    else if (hiddenBelow > 0) container.scrollBy({ top: hiddenBelow, behavior: 'smooth' })
  }, [game.currentTurnPlayerId])
  const [score, setScore] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [showTrophy, setShowTrophy] = useState(false)
  const [resolvingTie, setResolvingTie] = useState(false)
  const isX01 = game.mode === 'X01'
  const maxInput = isX01 ? (game.startScore ?? 501) : MAX_SCORE
  // Old system's "dual scoreboard": exactly two players/teams get shown
  // side by side so the opponent's score stays visible, instead of just
  // whoever's turn it is.
  const isDualMode = game.entries.length === 2
  // currentEntry is by definition whoever has thrown the fewest rounds so
  // far, so its own round count doubles as "the round in progress" for
  // either mode - same value the old system's header showed.
  const currentRound = currentEntry ? currentEntry.roundScores.length + 1 : null
  // Only a knockout leg strictly needs a winner to progress the match - an
  // ordinary qualification game just contributes to the leaderboard sum, a
  // tie there is a perfectly fine result and needs no decision.
  const needsTieResolution = game.status === 'Finished' && game.isTied && game.knockoutMatchId !== null && game.tiebreakWinnerId === null

  // Trophy fires once per game finish: either the moment it finishes
  // outright, or the moment a tie that was blocking it gets resolved -
  // matching the old system's play-screen.tsx per-leg winner celebration.
  const prevStatusRef = useRef(game.status)
  const prevNeedsTieRef = useRef(needsTieResolution)
  useEffect(() => {
    const justFinished = prevStatusRef.current !== 'Finished' && game.status === 'Finished' && !needsTieResolution
    const justResolvedTie = prevNeedsTieRef.current && !needsTieResolution && game.status === 'Finished'
    if (justFinished || justResolvedTie) setShowTrophy(true)
    prevStatusRef.current = game.status
    prevNeedsTieRef.current = needsTieResolution
  }, [game.status, needsTieResolution])

  const resolveTie = async (winnerId: string) => {
    setResolvingTie(true)
    setError(null)
    try {
      await onResolveTie(winnerId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setResolvingTie(false)
    }
  }

  const appendDigit = (digit: string) => {
    const next = score + digit
    if (next.length > 3 || Number(next) > maxInput) return
    setScore(next)
  }

  const submit = async () => {
    if (score === '' || !currentEntry) return
    setError(null)
    const thrown = Number(score)
    try {
      await onSubmitTurn(currentEntry.playerId, thrown)
      setScore('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // "Rest" entry: the scorer types the score remaining on the board after
  // the throw (often easier to read off than mentally summing the darts),
  // and the actual points thrown are derived from it - same mechanic as
  // the old system's dedicated Rest button.
  const submitRest = async () => {
    if (score === '' || !currentEntry || currentEntry.remaining == null) return
    setError(null)
    const thrown = currentEntry.remaining - Number(score)
    if (thrown < 0) {
      setError('Der Rest kann nicht höher als der aktuelle Rest sein.')
      return
    }
    try {
      await onSubmitTurn(currentEntry.playerId, thrown)
      setScore('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleUndo = async (undoPlayerId: string) => {
    setError(null)
    try {
      await onUndoTurn(undoPlayerId)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // Tapping a player in the table below opens this player's full throw
  // history for correction - matches the old system's per-throw edit
  // screen (reachable there by long-pressing a table row).
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null)
  const [editError, setEditError] = useState<string | null>(null)

  const handleEditThrow = async (playerId: string, throwIndex: number, newScore: number) => {
    setEditError(null)
    try {
      await onEditTurn(playerId, throwIndex, newScore)
    } catch (err) {
      setEditError(err instanceof Error ? err.message : String(err))
    }
  }

  // entries is ordered by the fixed throwing rotation (TurnOrder, see
  // GameEndpoints.ToDtoAsync), so whoever just threw is the entry right
  // before the current one, wrapping around.
  const currentIndex = game.entries.findIndex((e) => e.playerId === game.currentTurnPlayerId)
  const lastThrower =
    currentIndex === -1 ? null : game.entries[(currentIndex - 1 + game.entries.length) % game.entries.length]
  const canDeleteLastThrow = !!lastThrower && lastThrower.roundScores.length > 0

  // "Letzten Wurf löschen" - same two-step confirm as the old system's
  // play-screen.tsx: first tap arms it and auto-disarms after 2.5s, second
  // tap within that window actually deletes.
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const deleteConfirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (deleteConfirmTimeoutRef.current) clearTimeout(deleteConfirmTimeoutRef.current)
    }
  }, [])

  const handleDeleteLastThrow = () => {
    if (!lastThrower) return
    if (deleteConfirm) {
      if (deleteConfirmTimeoutRef.current) clearTimeout(deleteConfirmTimeoutRef.current)
      setDeleteConfirm(false)
      handleUndo(lastThrower.playerId)
    } else {
      setDeleteConfirm(true)
      deleteConfirmTimeoutRef.current = setTimeout(() => setDeleteConfirm(false), 2500)
    }
  }

  const buttonBase: React.CSSProperties = {
    border: `1px solid ${accent}`,
    background: 'transparent',
    color: accent,
    borderRadius: '0.6rem',
    fontSize: '1.1rem',
    padding: '0.7rem',
    cursor: 'pointer',
  }

  // Flat, bordered table cell - the old system's numpad (play-screen.tsx)
  // used plain divs with hover/active backgrounds and thin divider borders,
  // not individually boxed/rounded buttons - a gapless grid reads as one
  // familiar keypad instead of a dozen separate pill buttons.
  const gridBorder = `color-mix(in srgb, ${accent} 22%, transparent)`
  const cellBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '3.6rem',
    padding: '0.6rem',
    fontSize: '1.7rem',
    fontWeight: 600,
    color: accent,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
    WebkitTapHighlightColor: 'transparent',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1, minHeight: 0, position: 'relative' }}>
      {showTrophy && (
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
          <Lottie
            src="/animations/trophy.json"
            autoplay
            loop={false}
            subscriptions={{ complete: () => setShowTrophy(false) }}
            style={{ width: 'min(70vw, 60vh)', height: 'min(70vw, 60vh)' }}
          />
          <p style={{ margin: 0, color: 'white', fontWeight: 700, fontSize: '1.6rem', textAlign: 'center' }}>
            🎉 {winningEntry(game)?.playerName ?? ''} 🎉
          </p>
        </div>
      )}
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      {needsTieResolution && (
        <div
          style={{
            border: `1px solid ${accent}`,
            borderRadius: '0.6rem',
            padding: '1rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.8rem',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, fontWeight: 700, fontSize: '1.1rem' }}>Gleichstand!</p>
          <p style={{ margin: 0, fontSize: '0.9rem', opacity: 0.85 }}>Wer hat gewonnen?</p>
          {game.entries.map((entry) => (
            <button
              key={entry.playerId}
              type="button"
              onClick={() => resolveTie(entry.playerId)}
              disabled={resolvingTie}
              style={{
                border: `1px solid ${accent}`,
                background: accent,
                color: '#0b0a09',
                borderRadius: '0.6rem',
                fontWeight: 700,
                fontSize: '1rem',
                padding: '0.9rem',
                cursor: 'pointer',
                opacity: resolvingTie ? 0.5 : 1,
              }}
            >
              {entry.playerName} ({entry.total})
            </button>
          ))}
        </div>
      )}
      {game.status === 'Finished' && !needsTieResolution && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              border: `1px solid ${accent}`,
              borderRadius: '999px',
              padding: '0.5rem 1.3rem',
              fontWeight: 700,
              fontSize: '1rem',
            }}
          >
            🏁 Spiel beendet
          </span>
        </div>
      )}

      {game.status === 'InProgress' && currentEntry && (
        <>
          {/* Player info sits left of the numpad, not stacked above it -
              same arrangement as the old system's play-screen.tsx. There,
              "Runde"/"Board" and the scoreboard all live inside one shared
              accent-colored panel, so that's the rectangle they go in here
              too, rather than a separate row above it. With exactly two
              players the panel itself stays solid accent throughout (not
              switching per player), and only a border marks whose turn it
              is - otherwise the header would visibly jump between two
              differently-colored boxes as the turn alternates. */}
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'stretch' }}>
            <div
              style={{
                flex: '1 1 280px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.6rem',
                background: accent,
                color: '#0b0a09',
                borderRadius: '0.6rem',
                padding: '1rem',
              }}
            >
              {/* "Runde" top-left, "Board" top-right, each a small label
                  over a big number. Highscore shows the round as a fraction
                  of the total; other modes just count up, since they have
                  no fixed round limit. */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.75 }}>Runde</p>
                  <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>
                    {isX01 || game.rounds === null ? currentRound : `${Math.min(currentRound!, game.rounds)}/${game.rounds}`}
                  </p>
                </div>
                {boardNumber !== null && (
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ margin: 0, fontSize: '0.8rem', opacity: 0.75 }}>Board</p>
                    <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>{boardNumber}</p>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '0.6rem', flex: 1 }}>
                {isDualMode ? (
                  game.entries.map((entry) => {
                    const isTurn = entry.playerId === game.currentTurnPlayerId
                    return (
                      <div
                        key={entry.playerId}
                        style={{
                          flex: 1,
                          minWidth: 0,
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                          padding: '0.8rem 0.5rem',
                          borderRadius: '0.5rem',
                          border: `2px solid ${isTurn ? '#0b0a09' : 'transparent'}`,
                        }}
                      >
                        <div style={{ fontSize: '2.2rem', fontWeight: 700, lineHeight: 1 }}>
                          {isX01 ? entry.remaining : entry.total}
                        </div>
                        <div
                          style={{
                            fontSize: '0.9rem',
                            fontWeight: 600,
                            textAlign: 'center',
                            maxWidth: '100%',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {entry.playerName}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <div
                    style={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                      textAlign: 'center',
                    }}
                  >
                    <div style={{ fontSize: 'clamp(2rem, 9vw, 3.4rem)', fontWeight: 700, lineHeight: 1 }}>
                      {isX01 ? currentEntry.remaining : currentEntry.total}
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>{currentEntry.playerName}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Numpad layout matches the old system's play-screen.tsx: score
                display, then digits 1-9, then Rest/0/confirm - a single
                gapless bordered grid rather than separate boxed buttons, same
                as the old software's keypad. In Highscore mode Rest stays
                visible but inert/greyed (not hidden), also matching the old
                behaviour. The clear "x" sits inside the display itself, like
                any ordinary input field's clear button, instead of taking up
                its own grid cell - and only shows once there's something to
                clear. It shares this column with "Letzten Wurf löschen" so
                that button stays exactly as wide as the numpad, instead of
                stretching under the player info too. */}
            <div style={{ flex: '1.4 1 340px', display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
              <div style={{ border: `1px solid ${gridBorder}`, borderRadius: '0.6rem', overflow: 'hidden' }}>
                <div style={{ position: 'relative', borderBottom: `1px solid ${gridBorder}` }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0.6rem 1rem',
                      fontSize: 'clamp(2.4rem, 14vw, 4rem)',
                      fontWeight: 700,
                      color: 'white',
                      lineHeight: 1,
                    }}
                  >
                    {score || '0'}
                  </div>
                  {score !== '' && (
                    <button
                      type="button"
                      onClick={() => setScore('')}
                      aria-label="Eingabe löschen"
                      style={{
                        position: 'absolute',
                        right: '0.7rem',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '2.2rem',
                        height: '2.2rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        border: 'none',
                        borderRadius: '50%',
                        background: 'transparent',
                        color: accent,
                        opacity: 0.6,
                        fontSize: '1.2rem',
                        cursor: 'pointer',
                      }}
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit, i) => (
                    <button
                      key={digit}
                      type="button"
                      onClick={() => appendDigit(digit)}
                      className="lpd-numpad-cell"
                      style={{
                        ...cellBase,
                        borderRight: i % 3 !== 2 ? `1px solid ${gridBorder}` : 'none',
                        borderBottom: `1px solid ${gridBorder}`,
                      }}
                    >
                      {digit}
                    </button>
                  ))}
                  {isX01 ? (
                    <button
                      type="button"
                      onClick={submitRest}
                      disabled={score === ''}
                      className="lpd-numpad-cell"
                      style={{
                        ...cellBase,
                        fontWeight: 700,
                        fontSize: '1.15rem',
                        borderRight: `1px solid ${gridBorder}`,
                        opacity: score === '' ? 0.4 : 1,
                      }}
                    >
                      Rest
                    </button>
                  ) : (
                    <div
                      style={{
                        ...cellBase,
                        fontWeight: 700,
                        fontSize: '1.15rem',
                        borderRight: `1px solid ${gridBorder}`,
                        cursor: 'default',
                        opacity: 0.3,
                      }}
                    >
                      Rest
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => appendDigit('0')}
                    className="lpd-numpad-cell"
                    style={{ ...cellBase, borderRight: `1px solid ${gridBorder}` }}
                  >
                    0
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={score === ''}
                    aria-label="Wurf eintragen"
                    className="lpd-numpad-cell"
                    style={{
                      ...cellBase,
                      background: accent,
                      color: '#0b0a09',
                      fontSize: '1.9rem',
                      opacity: score === '' ? 0.5 : 1,
                    }}
                  >
                    ✓
                  </button>
                </div>
              </div>

              {canDeleteLastThrow && (
                <button
                  type="button"
                  onClick={handleDeleteLastThrow}
                  style={{
                    ...buttonBase,
                    fontWeight: 700,
                    fontSize: deleteConfirm ? '0.95rem' : '1.05rem',
                    padding: '0.9rem',
                    background: deleteConfirm ? DANGER : 'transparent',
                    borderColor: DANGER,
                    color: deleteConfirm ? '#0b0a09' : DANGER,
                  }}
                >
                  {deleteConfirm ? 'Zum Bestätigen erneut drücken' : 'Letzten Wurf löschen'}
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Player table below the numpad, same as the old system's
          play-screen-table-client.tsx: Name / Punkte / Ø / letzter Wurf /
          Abstand zum ersten, current-turn row highlighted. Tapping a row
          opens that player's full throw history for correction, replacing
          the old system's long-press (there's no long-press gesture here,
          and a correction isn't a dangerous-enough action to need one).
          Everything above (header, Runde/Board+player panel, numpad) stays
          fixed - only this table scrolls, with its own header pinned via
          position:sticky so it's still readable while scrolled. */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ opacity: 0.7, fontWeight: 400 }}>
              <th style={{ position: 'sticky', top: 0, background: '#0b0a09', textAlign: 'left', padding: '0.3rem 0.5rem', fontWeight: 400 }}>
                Name
              </th>
              <th style={{ position: 'sticky', top: 0, background: '#0b0a09', textAlign: 'right', padding: '0.3rem 0.5rem', fontWeight: 400 }}>
                {isX01 ? 'Rest' : 'Punkte'}
              </th>
              <th style={{ position: 'sticky', top: 0, background: '#0b0a09', textAlign: 'right', padding: '0.3rem 0.5rem', fontWeight: 400 }}>
                Ø
              </th>
              <th style={{ position: 'sticky', top: 0, background: '#0b0a09', textAlign: 'right', padding: '0.3rem 0.5rem', fontWeight: 400 }}>
                Wurf
              </th>
              <th style={{ position: 'sticky', top: 0, background: '#0b0a09', textAlign: 'right', padding: '0.3rem 0.5rem', fontWeight: 400 }}>
                Abstand
              </th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              const leaderValue = isX01
                ? Math.min(...game.entries.map((e) => e.remaining ?? 0))
                : Math.max(...game.entries.map((e) => e.total))
              return game.entries.map((entry) => {
                const value = isX01 ? (entry.remaining ?? 0) : entry.total
                const gap = isX01 ? value - leaderValue : leaderValue - value
                const isTurn = entry.playerId === game.currentTurnPlayerId
                const average = entry.roundScores.length > 0 ? Math.round(entry.total / entry.roundScores.length) : 0
                const lastThrow = entry.roundScores.length > 0 ? entry.roundScores[entry.roundScores.length - 1] : '–'
                return (
                  <tr
                    key={entry.playerId}
                    ref={isTurn ? activeRowRef : undefined}
                    onClick={() => setEditingPlayerId(entry.playerId)}
                    style={{
                      background: isTurn ? accent : 'transparent',
                      color: isTurn ? '#0b0a09' : accent,
                      cursor: 'pointer',
                    }}
                  >
                    <td style={{ padding: '0.4rem 0.5rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {entry.playerName}
                    </td>
                    <td style={{ textAlign: 'right', padding: '0.4rem 0.5rem', fontWeight: 700 }}>{value}</td>
                    <td style={{ textAlign: 'right', padding: '0.4rem 0.5rem' }}>{average}</td>
                    <td style={{ textAlign: 'right', padding: '0.4rem 0.5rem' }}>{lastThrow}</td>
                    <td style={{ textAlign: 'right', padding: '0.4rem 0.5rem' }}>{gap === 0 ? '🏆' : `-${gap}`}</td>
                  </tr>
                )
              })
            })()}
          </tbody>
        </table>
      </div>

      {/* Below the player table, not above it - the table is the actual
          result the scorer cares about right after a finish, so it comes
          first; these are just the next steps. Side by side rather than
          stacked, since a tablet has plenty of width for three short
          labels and it reads more like a single decision (pick one of
          three) than a sequence of steps. */}
      {game.status === 'Finished' && !needsTieResolution && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', flexShrink: 0 }}>
          {repeatError && (
            <p role="alert" style={{ color: DANGER, margin: 0, fontSize: '0.85rem', textAlign: 'center' }}>
              {repeatError}
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.7rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={onNewGame}
              style={{
                flex: '1 1 8rem',
                border: `1px solid ${accent}`,
                background: accent,
                color: '#0b0a09',
                borderRadius: '0.6rem',
                fontWeight: 700,
                fontSize: '1rem',
                padding: '0.9rem',
                cursor: 'pointer',
              }}
            >
              Neues Spiel
            </button>
            <button
              type="button"
              onClick={onRepeatGame}
              disabled={repeatingGame}
              style={{ ...buttonBase, flex: '1 1 8rem', fontWeight: 700, opacity: repeatingGame ? 0.6 : 1 }}
            >
              {repeatingGame ? 'Wird gestartet…' : 'Spiel wiederholen'}
            </button>
            <button type="button" onClick={onGoToStartMenu} style={{ ...buttonBase, flex: '1 1 8rem' }}>
              Zurück zum Startmenü
            </button>
          </div>
        </div>
      )}

      {editingPlayerId &&
        (() => {
          const editingEntry = game.entries.find((e) => e.playerId === editingPlayerId)
          if (!editingEntry) return null
          return (
            <div
              style={{
                position: 'fixed',
                inset: 0,
                zIndex: 1000,
                background: 'rgba(0, 0, 0, 0.75)',
                display: 'flex',
                alignItems: 'flex-end',
              }}
              onClick={() => setEditingPlayerId(null)}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  background: '#150f09',
                  width: '100%',
                  maxHeight: '80vh',
                  overflowY: 'auto',
                  borderTopLeftRadius: '1rem',
                  borderTopRightRadius: '1rem',
                  padding: '1rem',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.8rem',
                }}
              >
                <ThrowCorrectionPanel
                  playerName={editingEntry.playerName}
                  roundScores={editingEntry.roundScores}
                  accent={accent}
                  error={editError}
                  onClose={() => setEditingPlayerId(null)}
                  onSave={(throwIndex, value) => handleEditThrow(editingEntry.playerId, throwIndex, value)}
                />
              </div>
            </div>
          )
        })()}
    </div>
  )
}

/**
 * "Wurf N" list on the left, its own numpad on the right ("eigenes
 * Zifferblatt daneben") instead of the platform keyboard - same
 * big-numpad philosophy as the live score entry, just for overwriting an
 * already-recorded throw rather than adding a new one. Selecting a throw
 * only highlights it and shows its current value for reference; typing
 * always starts a fresh number rather than editing the old one in place,
 * the same append-from-empty behaviour the main numpad uses.
 */
function ThrowCorrectionPanel({
  playerName,
  roundScores,
  accent,
  error,
  onSave,
  onClose,
}: {
  playerName: string
  roundScores: readonly number[]
  accent: string
  error: string | null
  onSave: (throwIndex: number, value: number) => void
  onClose: () => void
}) {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(roundScores.length > 0 ? roundScores.length - 1 : null)
  const [digits, setDigits] = useState('')

  const selectThrow = (throwIndex: number) => {
    setSelectedIndex(throwIndex)
    setDigits('')
  }

  const appendDigit = (digit: string) => {
    const next = digits + digit
    if (next.length > 3 || Number(next) > 180) return
    setDigits(next)
  }

  const save = () => {
    if (selectedIndex === null || digits === '') return
    onSave(selectedIndex, Number(digits))
  }

  const cellBorder = `color-mix(in srgb, ${accent} 22%, transparent)`
  const cellBase: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '3rem',
    fontSize: '1.3rem',
    fontWeight: 600,
    color: accent,
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    fontFamily: 'inherit',
  }

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: '1.2rem' }}>{playerName} korrigieren</h2>
        <button
          type="button"
          onClick={onClose}
          style={{ border: `1px solid ${accent}`, background: 'transparent', color: accent, borderRadius: '0.5rem', padding: '0.4rem 0.8rem', cursor: 'pointer' }}
        >
          Schließen
        </button>
      </div>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      {roundScores.length === 0 ? (
        <p style={{ textAlign: 'center', opacity: 0.7, margin: 0 }}>Dieser Spieler hat noch nicht geworfen.</p>
      ) : (
        <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 10rem', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {[...roundScores]
              .map((_, throwIndex) => throwIndex)
              .reverse()
              .map((throwIndex, displayIndex) => {
                const isSelected = throwIndex === selectedIndex
                return (
                  <button
                    key={throwIndex}
                    type="button"
                    onClick={() => selectThrow(throwIndex)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.7rem 0.9rem',
                      borderRadius: '0.5rem',
                      border: `2px solid ${isSelected ? accent : 'transparent'}`,
                      background: isSelected ? 'transparent' : `color-mix(in srgb, ${accent} 8%, transparent)`,
                      color: accent,
                      fontSize: '1rem',
                      cursor: 'pointer',
                    }}
                  >
                    <span>Wurf {displayIndex + 1}</span>
                    <span style={{ fontWeight: 700 }}>{roundScores[throwIndex]}</span>
                  </button>
                )
              })}
          </div>

          <div style={{ flex: '1 1 13rem', border: `1px solid ${cellBorder}`, borderRadius: '0.6rem', overflow: 'hidden' }}>
            <div style={{ position: 'relative', borderBottom: `1px solid ${cellBorder}` }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: '0.5rem',
                  fontSize: 'clamp(1.8rem, 8vw, 2.4rem)',
                  fontWeight: 700,
                  color: 'white',
                }}
              >
                {digits || '0'}
              </div>
              {digits !== '' && (
                <button
                  type="button"
                  onClick={() => setDigits('')}
                  aria-label="Eingabe löschen"
                  style={{
                    position: 'absolute',
                    right: '0.6rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    width: '2rem',
                    height: '2rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: 'none',
                    borderRadius: '50%',
                    background: 'transparent',
                    color: accent,
                    opacity: 0.6,
                    fontSize: '1.1rem',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
              {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit, i) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => appendDigit(digit)}
                  className="lpd-numpad-cell"
                  disabled={selectedIndex === null}
                  style={{
                    ...cellBase,
                    borderRight: i % 3 !== 2 ? `1px solid ${cellBorder}` : 'none',
                    borderBottom: `1px solid ${cellBorder}`,
                  }}
                >
                  {digit}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  setSelectedIndex(null)
                  setDigits('')
                }}
                className="lpd-numpad-cell"
                disabled={selectedIndex === null}
                style={{ ...cellBase, fontSize: '1rem', fontWeight: 700, borderRight: `1px solid ${cellBorder}` }}
              >
                Rückgängig
              </button>
              <button
                type="button"
                onClick={() => appendDigit('0')}
                className="lpd-numpad-cell"
                disabled={selectedIndex === null}
                style={{ ...cellBase, borderRight: `1px solid ${cellBorder}` }}
              >
                0
              </button>
              <button
                type="button"
                onClick={save}
                disabled={selectedIndex === null || digits === ''}
                className="lpd-numpad-cell"
                style={{
                  ...cellBase,
                  background: accent,
                  color: '#0b0a09',
                  fontSize: '1rem',
                  fontWeight: 700,
                  opacity: digits === '' ? 0.5 : 1,
                }}
              >
                Speichern
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

