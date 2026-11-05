import { useEffect, useState } from 'react'
import { api, type Board, type Game, type Player, type Tournament } from './api'
import { ConfirmDeleteButton } from './ConfirmDeleteButton'
import { BORDER, DANGER, SURFACE_2, TEXT_FAINT, TEXT_MUTED, buttonStyle, pillStyle, rowCardStyle, sectionHeadingStyle, tableStyle, tdStyle, thStyle } from './theme'

const STATUS_LABELS: Record<string, string> = {
  InProgress: 'Läuft',
  Finished: 'Beendet',
}

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }

// Shared "Verfügbare Spieler" / "Ausgewählte Spieler" transfer-list look,
// same as CreateTeamForm in TeamPanel.tsx.
const transferListStyle: React.CSSProperties = {
  border: `1px solid ${BORDER}`,
  borderRadius: '0.5rem',
  background: SURFACE_2,
  maxHeight: '13rem',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
}

const transferRowStyle = (highlighted: boolean): React.CSSProperties => ({
  padding: '0.45rem 0.6rem',
  fontSize: '0.85rem',
  cursor: 'pointer',
  background: highlighted ? 'rgba(255,173,0,0.18)' : 'transparent',
})

export function GamePanel({
  eventId,
  tournament,
  players,
  boards,
}: {
  eventId: string
  tournament: Tournament
  players: Player[]
  boards: Board[]
}) {
  const [game, setGame] = useState<Game | null>(null)
  const [error, setError] = useState<string | null>(null)

  if (!game) {
    return (
      <NewGameForm
        eventId={eventId}
        tournamentId={tournament.id}
        players={players}
        boards={boards}
        onCreated={setGame}
        onError={setError}
        error={error}
      />
    )
  }

  return (
    <GameView
      tournamentId={tournament.id}
      game={game}
      players={players}
      boards={boards}
      onUpdated={setGame}
      onNewGame={() => setGame(null)}
    />
  )
}

function NewGameForm({
  eventId,
  tournamentId,
  players,
  boards,
  onCreated,
  onError,
  error,
}: {
  eventId: string
  tournamentId: string
  players: Player[]
  boards: Board[]
  onCreated: (game: Game) => void
  onError: (message: string | null) => void
  error: string | null
}) {
  // Same "Verfügbare Spieler" / "Ausgewählte Spieler" transfer-list UX as
  // the Tablet's own game-start screen (NewGameOnBoard in
  // TabletScoreEntry.tsx) and CreateTeamForm in TeamPanel.tsx - a plain
  // stacked checkbox list got unwieldy once an event has more than a
  // handful of players, with no way to find one by name. Kept as an
  // ordered array (not a Set) since the order here doubles as the game's
  // throwing order, shown via the numbered "Ausgewählte Spieler" rows.
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([])
  const [search, setSearch] = useState('')
  const [highlightedAvailable, setHighlightedAvailable] = useState<Set<string>>(new Set())
  const [highlightedSelected, setHighlightedSelected] = useState<Set<string>>(new Set())
  const [boardId, setBoardId] = useState(boards[0]?.id ?? '')
  // A player already mid-game on another board can't be picked here either
  // (see FindPlayerAlreadyInProgressAsync on the backend) - left off the
  // list entirely instead of only failing after "Weiter" is clicked.
  // Polled like the rest of this dashboard rather than fetched once, since
  // another board's game can start or finish at any moment.
  const [busyPlayerIds, setBusyPlayerIds] = useState<Set<string>>(new Set())
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
  // A player checked here who then starts a game elsewhere (another Regie
  // tab, a Tablet) would otherwise stay silently selected until submit.
  useEffect(() => {
    setSelectedPlayers((prev) => prev.filter((p) => !busyPlayerIds.has(p.id)))
    setHighlightedAvailable((prev) => {
      if (![...prev].some((id) => busyPlayerIds.has(id))) return prev
      const next = new Set(prev)
      for (const id of busyPlayerIds) next.delete(id)
      return next
    })
  }, [busyPlayerIds])
  const [reviewing, setReviewing] = useState(false)
  const [starting, setStarting] = useState(false)

  const availablePlayers = players
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
    setSelectedPlayers((prev) => [...prev, ...availablePlayers.filter((p) => highlightedAvailable.has(p.id))])
    setHighlightedAvailable(new Set())
  }

  const moveToAvailable = () => {
    if (highlightedSelected.size === 0) return
    setSelectedPlayers((prev) => prev.filter((p) => !highlightedSelected.has(p.id)))
    setHighlightedSelected(new Set())
  }

  const board = boards.find((b) => b.id === boardId)

  // Confirmation step ("Bestätigungsseite vor Spielstart", altes System) -
  // Board und Spieler werden erst zur Überprüfung angezeigt, das Spiel wird
  // erst mit dem zweiten Klick tatsächlich angelegt.
  const handleReview = (e: React.FormEvent) => {
    e.preventDefault()
    onError(null)
    setReviewing(true)
  }

  const handleConfirm = async () => {
    onError(null)
    setStarting(true)
    try {
      const game = await api.createGame(
        tournamentId,
        boardId,
        selectedPlayers.map((p) => p.id),
      )
      onCreated(game)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
      setReviewing(false)
    } finally {
      setStarting(false)
    }
  }

  if (reviewing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <h4 style={sectionHeadingStyle()}>Spiel bestätigen</h4>
        {error && (
          <p role="alert" style={{ color: DANGER, margin: 0 }}>
            {error}
          </p>
        )}
        <div style={{ fontSize: '0.85rem' }}>
          <span style={{ color: TEXT_FAINT }}>Board: </span>
          <strong>{board ? (board.name ?? `Board ${board.number}`) : boardId}</strong>
        </div>
        <div style={{ fontSize: '0.85rem' }}>
          <span style={{ color: TEXT_FAINT }}>Spieler:</span>
          <ul style={{ margin: '0.3rem 0 0', padding: '0 0 0 1.1rem' }}>
            {selectedPlayers.map((p) => (
              <li key={p.id}>{p.displayName}</li>
            ))}
          </ul>
        </div>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <button type="button" onClick={() => setReviewing(false)} disabled={starting}>
            Zurück
          </button>
          <button type="button" className="primary" onClick={handleConfirm} disabled={starting}>
            {starting ? 'Wird gestartet…' : 'Jetzt starten'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleReview} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <h4 style={sectionHeadingStyle()}>Neues Spiel</h4>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      {boards.length === 0 && <p style={{ color: TEXT_MUTED, fontSize: '0.85rem', margin: 0 }}>Keine Boards im Event vorhanden.</p>}
      <label style={{ ...fieldStyle, maxWidth: '16rem' }}>
        Board
        <select value={boardId} onChange={(e) => setBoardId(e.target.value)}>
          {boards.map((board) => (
            <option key={board.id} value={board.id}>
              {board.name ?? `Board ${board.number}`}
            </option>
          ))}
        </select>
      </label>
      {players.length === 0 && <p style={{ color: TEXT_MUTED, fontSize: '0.85rem', margin: 0 }}>Keine Spieler im Event vorhanden.</p>}
      {players.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '0.8rem', alignItems: 'start', maxWidth: '42rem' }}>
          <div style={fieldStyle}>
            Verfügbare Spieler ({filteredAvailable.length})
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Spieler suchen…"
              style={{ boxSizing: 'border-box' }}
            />
            <div style={transferListStyle}>
              {filteredAvailable.length === 0 && (
                <p style={{ color: TEXT_FAINT, fontSize: '0.78rem', margin: '0.5rem 0.6rem' }}>Keine Spieler verfügbar.</p>
              )}
              {filteredAvailable.map((player) => (
                <div key={player.id} onClick={() => toggleAvailable(player.id)} style={transferRowStyle(highlightedAvailable.has(player.id))}>
                  {player.displayName}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', paddingTop: '1.7rem' }}>
            <button type="button" onClick={moveToSelected} disabled={highlightedAvailable.size === 0} style={buttonStyle('', 'secondary', 'sm')}>
              →
            </button>
            <button type="button" onClick={moveToAvailable} disabled={highlightedSelected.size === 0} style={buttonStyle('', 'secondary', 'sm')}>
              ←
            </button>
          </div>

          <div style={fieldStyle}>
            Ausgewählte Spieler ({selectedPlayers.length})
            <input type="text" aria-hidden tabIndex={-1} disabled value="" style={{ visibility: 'hidden', boxSizing: 'border-box' }} />
            <div style={transferListStyle}>
              {selectedPlayers.length === 0 && (
                <p style={{ color: TEXT_FAINT, fontSize: '0.78rem', margin: '0.5rem 0.6rem' }}>Keine Spieler ausgewählt.</p>
              )}
              {selectedPlayers.map((player, index) => (
                <div key={player.id} onClick={() => toggleSelected(player.id)} style={transferRowStyle(highlightedSelected.has(player.id))}>
                  {index + 1}. {player.displayName}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <button type="submit" className="primary" disabled={selectedPlayers.length === 0 || !boardId} style={{ alignSelf: 'flex-start' }}>
        Weiter
      </button>
    </form>
  )
}

function GameView({
  tournamentId,
  game,
  players,
  boards,
  onUpdated,
  onNewGame,
}: {
  tournamentId: string
  game: Game
  players: Player[]
  boards: Board[]
  onUpdated: (game: Game) => void
  onNewGame: () => void
}) {
  const playerName = (playerId: string) => players.find((p) => p.id === playerId)?.displayName ?? playerId
  const board = boards.find((b) => b.id === game.boardId)
  const [undoError, setUndoError] = useState<string | null>(null)
  const isX01 = game.mode === 'X01'

  const standings = isX01
    ? [...game.entries].sort((a, b) => (a.remaining ?? 0) - (b.remaining ?? 0))
    : [...game.entries].sort((a, b) => b.total - a.total)

  const handleUndo = async (playerId: string) => {
    setUndoError(null)
    try {
      const updated = await api.undoTurn(tournamentId, game.id, playerId)
      onUpdated(updated)
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleUndoPlayer = async (playerId: string) => {
    setUndoError(null)
    try {
      const updated = await api.undoPlayerTurns(tournamentId, game.id, playerId)
      onUpdated(updated)
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : String(err))
    }
  }

  const noThrowsYet = game.entries.every((e) => e.roundScores.length === 0)

  const handleChangeBoard = async (boardId: string) => {
    if (!boardId || boardId === game.boardId) return
    setUndoError(null)
    try {
      const updated = await api.changeGameBoard(tournamentId, game.id, boardId)
      onUpdated(updated)
    } catch (err) {
      setUndoError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
        <h4 style={sectionHeadingStyle()}>
          Spiel auf {board ? (board.name ?? `Board ${board.number}`) : game.boardId}
        </h4>
        <span style={pillStyle(game.status === 'InProgress' ? 'on' : 'off')}>{STATUS_LABELS[game.status] ?? game.status}</span>
        <span style={{ fontSize: '0.78rem', color: TEXT_FAINT }}>{isX01 ? `${game.startScore} (X01)` : `${game.rounds} Runden`}</span>
        {noThrowsYet && (
          <select value={game.boardId} onChange={(e) => handleChangeBoard(e.target.value)} style={{ fontSize: '0.75rem' }}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name ?? `Board ${b.number}`}
              </option>
            ))}
          </select>
        )}
        <div style={{ marginLeft: 'auto' }}>
          <ConfirmDeleteButton label="Spiel löschen" size="sm" onConfirm={() => api.deleteGame(tournamentId, game.id).then(onNewGame)} />
        </div>
      </div>
      {undoError && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {undoError}
        </p>
      )}
      <table style={tableStyle()}>
        <thead>
          <tr>
            <th style={thStyle()}>Spieler</th>
            <th style={thStyle()}>{isX01 ? 'Rest' : 'Punkte'}</th>
            <th style={thStyle()}>Würfe</th>
            <th style={thStyle()}></th>
          </tr>
        </thead>
        <tbody>
          {standings.map((entry) => (
            <tr key={entry.playerId}>
              <td style={{ ...tdStyle(), fontWeight: 600 }}>{playerName(entry.playerId)}</td>
              <td style={{ ...tdStyle(), fontVariantNumeric: 'tabular-nums' }}>{isX01 ? entry.remaining : entry.total}</td>
              <td style={{ ...tdStyle(), color: TEXT_FAINT, fontSize: '0.78rem' }}>{entry.roundScores.join(', ') || 'noch keine Würfe'}</td>
              <td style={tdStyle()}>
                {entry.roundScores.length > 0 && (
                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <button type="button" onClick={() => handleUndo(entry.playerId)} style={buttonStyle('', 'secondary', 'sm')}>
                      Letzten Wurf korrigieren
                    </button>
                    <button type="button" onClick={() => handleUndoPlayer(entry.playerId)} style={buttonStyle('', 'secondary', 'sm')}>
                      Spieler zurücksetzen
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {game.entries.some((e) => e.roundScores.length > 0) && (
        <div style={{ alignSelf: 'flex-start' }}>
          <ConfirmDeleteButton label="Alle Würfe zurücksetzen" size="sm" onConfirm={() => api.resetGameTurns(tournamentId, game.id).then(onUpdated)} />
        </div>
      )}
      {game.status === 'InProgress' && (
        <TurnForm tournamentId={tournamentId} game={game} players={players} onRecorded={onUpdated} />
      )}
      {game.status === 'Finished' && (
        <button type="button" className="primary" onClick={onNewGame} style={{ alignSelf: 'flex-start' }}>
          Neues Spiel
        </button>
      )}
    </div>
  )
}

function TurnForm({
  tournamentId,
  game,
  players,
  onRecorded,
}: {
  tournamentId: string
  game: Game
  players: Player[]
  onRecorded: (game: Game) => void
}) {
  const currentEntry = game.entries.find((e) => e.playerId === game.currentTurnPlayerId)
  const [score, setScore] = useState('')
  const [error, setError] = useState<string | null>(null)
  const isX01 = game.mode === 'X01'

  const playerName = (id: string) => players.find((p) => p.id === id)?.displayName ?? id

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentEntry) return
    setError(null)
    try {
      const updated = await api.recordTurn(tournamentId, game.id, currentEntry.playerId, Number(score))
      setScore('')
      onRecorded(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRest = async () => {
    if (!currentEntry || currentEntry.remaining == null || score === '') return
    setError(null)
    const thrown = currentEntry.remaining - Number(score)
    if (thrown < 0) {
      setError('Der Rest kann nicht höher als der aktuelle Rest sein.')
      return
    }
    try {
      const updated = await api.recordTurn(tournamentId, game.id, currentEntry.playerId, thrown)
      setScore('')
      onRecorded(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!currentEntry) return null

  return (
    <form onSubmit={handleSubmit} style={{ ...rowCardStyle(), display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <p style={{ margin: 0, fontSize: '0.85rem' }}>
        Jetzt spielt: <strong>{playerName(currentEntry.playerId)}</strong>{' '}
        <span style={{ color: TEXT_FAINT }}>
          {isX01 ? `(Rest: ${currentEntry.remaining})` : `(Runde ${currentEntry.roundScores.length + 1}/${game.rounds})`}
        </span>
      </p>
      <label style={fieldStyle}>
        {isX01 ? 'Punkte (3 Darts) oder Rest' : 'Punkte (3 Darts)'}
        <input
          type="number"
          min="0"
          max={isX01 ? game.startScore ?? 501 : 180}
          value={score}
          onChange={(e) => setScore(e.target.value)}
          required
          style={{ maxWidth: '10rem' }}
        />
      </label>
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button type="submit" className="primary">
          Wurf eintragen
        </button>
        {isX01 && (
          <button type="button" onClick={handleRest} disabled={score === ''}>
            Rest eintragen
          </button>
        )}
      </div>
    </form>
  )
}
