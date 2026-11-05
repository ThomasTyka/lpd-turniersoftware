import { useEffect, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { API_BASE_URL, api, type AvailableSubstitute, type Board, type Game, type KnockoutMatch, type Tournament } from './api'
import { DANGER, TEXT_FAINT, TEXT_MUTED, buttonStyle, pillStyle, rowCardStyle, sectionHeadingStyle } from './theme'

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }

const ROUND_LABELS: Record<number, string> = {
  1: 'Finale',
  2: 'Halbfinale',
  4: 'Viertelfinale',
  8: 'Achtelfinale',
  16: 'Sechzehntelfinale',
}

function roundLabel(round: number, matchesInRound: number): string {
  return ROUND_LABELS[matchesInRound] ?? `Runde ${round}`
}

// Named phase presets like in the old system (dortiges Phase-Dropdown:
// Sechzehntelfinale/Achtelfinale/Viertelfinale/Halbfinale/Finale), used to
// prefill the participant count below - the count itself stays a free
// number so byes/uneven teilnehmerzahlen still work as they do today.
const KO_PHASE_PRESETS: { participantCount: number; label: string }[] = [
  { participantCount: 32, label: 'Sechzehntelfinale (32)' },
  { participantCount: 16, label: 'Achtelfinale (16)' },
  { participantCount: 8, label: 'Viertelfinale (8)' },
  { participantCount: 4, label: 'Halbfinale (4)' },
  { participantCount: 2, label: 'Finale (2)' },
]

// Same options as the old system's phase dropdown (PhaseForm), used for the
// manual "welche Phase sind wir gerade" override - a pure display label,
// completely decoupled from the real bracket data (see
// Tournament.knockoutPhaseOverride).
const PHASE_OVERRIDE_OPTIONS = ['Vorrunde', 'Sechzehntelfinale', 'Achtelfinale', 'Viertelfinale', 'Halbfinale', 'Finale']

/**
 * Freies "aktuelle Phase"-Feld wie im alten System (Dropdown + Speichern,
 * jederzeit änderbar, unabhängig vom tatsächlichen Turnierstand) - anders
 * als die per-Runde-Überschriften im Bracket unten, die weiterhin korrekt
 * automatisch aus den echten Match-Daten berechnet werden.
 */
function KnockoutPhaseOverrideControl({
  eventId,
  tournament,
  onChanged,
}: {
  eventId: string
  tournament: Tournament
  onChanged: () => void
}) {
  const [value, setValue] = useState(tournament.knockoutPhaseOverride ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      await api.setKnockoutPhaseOverride(eventId, tournament.id, value || null)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem', flexWrap: 'wrap' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0, fontSize: '0.75rem', flexBasis: '100%' }}>
          {error}
        </p>
      )}
      <label style={fieldStyle}>
        Aktuelle Phase (manuell)
        <select value={value} onChange={(e) => setValue(e.target.value)}>
          <option value="">Automatisch (aus Bracket)</option>
          {PHASE_OVERRIDE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={handleSave} disabled={saving || value === (tournament.knockoutPhaseOverride ?? '')}>
        {saving ? 'Wird gespeichert…' : 'Speichern'}
      </button>
    </div>
  )
}

/**
 * KO-Runden: bracket seeded from the qualification leaderboard, with
 * automatic pairing (Setzliste), best-of-N-legs matches, and a "Spiel um
 * Platz 3" (project plan Abschnitt 2). A leg is an ordinary Highscore game;
 * the match itself is decided once one player wins a majority of legs.
 */
export function KnockoutPanel({
  eventId,
  tournamentId,
  boards,
  tournament,
  onTournamentChanged,
}: {
  eventId: string
  tournamentId: string
  boards: Board[]
  tournament: Tournament
  onTournamentChanged: () => void
}) {
  const [matches, setMatches] = useState<KnockoutMatch[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    api
      .getKnockoutMatches(eventId, tournamentId)
      .then(setMatches)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(reload, [eventId, tournamentId])

  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/game`)
      .withAutomaticReconnect()
      .build()

    connection.on('knockoutUpdated', (updated: KnockoutMatch[]) => setMatches(updated))
    connection.onreconnected(() => connection.invoke('JoinTournament', tournamentId))
    connection.start().then(() => connection.invoke('JoinTournament', tournamentId))

    return () => {
      connection.stop()
    }
  }, [tournamentId])

  if (error)
    return (
      <p role="alert" style={{ color: DANGER, margin: 0 }}>
        {error}
      </p>
    )
  if (!matches) return <p style={{ color: TEXT_MUTED, fontSize: '0.85rem', margin: 0 }}>Lädt…</p>

  if (matches.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <KnockoutPhaseOverrideControl eventId={eventId} tournament={tournament} onChanged={onTournamentChanged} />
        <StartKnockoutForm eventId={eventId} tournamentId={tournamentId} onStarted={setMatches} />
      </div>
    )
  }

  const bracketMatches = matches.filter((m) => !m.isThirdPlaceMatch)
  const thirdPlaceMatch = matches.find((m) => m.isThirdPlaceMatch)
  const currentRound = Math.max(...bracketMatches.map((m) => m.round))
  const currentRoundMatches = bracketMatches.filter((m) => m.round === currentRound)
  const currentRoundDecided = currentRoundMatches.every((m) => m.winnerId !== null)
  const bracketComplete = currentRoundMatches.length === 1 && currentRoundDecided

  const rounds = [...new Set(bracketMatches.map((m) => m.round))].sort((a, b) => a - b)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <KnockoutPhaseOverrideControl eventId={eventId} tournament={tournament} onChanged={onTournamentChanged} />
      <h4 style={sectionHeadingStyle()}>KO-Runde</h4>
      {rounds.map((round) => {
        const roundMatches = bracketMatches.filter((m) => m.round === round).sort((a, b) => a.position - b.position)
        return (
          <div key={round} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
            <h5 style={{ margin: 0, fontSize: '0.78rem', color: TEXT_FAINT, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {roundLabel(round, roundMatches.length)}
            </h5>
            {roundMatches.map((match) => (
              <MatchRow key={match.id} eventId={eventId} tournamentId={tournamentId} match={match} boards={boards} onChanged={reload} />
            ))}
          </div>
        )
      })}
      {thirdPlaceMatch && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <h5 style={{ margin: 0, fontSize: '0.78rem', color: TEXT_FAINT, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Spiel um Platz 3</h5>
          <MatchRow eventId={eventId} tournamentId={tournamentId} match={thirdPlaceMatch} boards={boards} onChanged={reload} />
        </div>
      )}
      {bracketComplete && (
        <p style={{ margin: 0, fontSize: '0.9rem' }}>
          🏆 KO-Runde abgeschlossen. Sieger: <strong>{currentRoundMatches[0].winnerName}</strong>
        </p>
      )}
      {!bracketComplete && currentRoundDecided && (
        <NextRoundButton eventId={eventId} tournamentId={tournamentId} onGenerated={reload} onError={setError} />
      )}
    </div>
  )
}

function NextRoundButton({
  eventId,
  tournamentId,
  onGenerated,
  onError,
}: {
  eventId: string
  tournamentId: string
  onGenerated: () => void
  onError: (message: string | null) => void
}) {
  const handleClick = async () => {
    onError(null)
    try {
      await api.generateNextRound(eventId, tournamentId)
      onGenerated()
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <button type="button" className="primary" onClick={handleClick} style={{ alignSelf: 'flex-start' }}>
      Nächste Runde generieren
    </button>
  )
}

function StartKnockoutForm({
  eventId,
  tournamentId,
  onStarted,
}: {
  eventId: string
  tournamentId: string
  onStarted: (matches: KnockoutMatch[]) => void
}) {
  const [participantCount, setParticipantCount] = useState('8')
  const [bestOfLegs, setBestOfLegs] = useState('3')
  const [qualificationBestOf, setQualificationBestOf] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const matches = await api.startKnockout(eventId, tournamentId, {
        participantCount: Number(participantCount),
        bestOfLegs: Number(bestOfLegs),
        qualificationBestOf: qualificationBestOf ? Number(qualificationBestOf) : undefined,
      })
      onStarted(matches)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <h4 style={sectionHeadingStyle()}>KO-Runde starten</h4>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '0.7rem' }}>
        <label style={fieldStyle}>
          Phase
          <select value={participantCount} onChange={(e) => setParticipantCount(e.target.value)}>
            {KO_PHASE_PRESETS.map((preset) => (
              <option key={preset.participantCount} value={preset.participantCount}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>
        <label style={fieldStyle}>
          Teilnehmer (aus der Rangliste)
          <input type="number" min="2" value={participantCount} onChange={(e) => setParticipantCount(e.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Best of (Legs)
          <input type="number" min="1" step="2" value={bestOfLegs} onChange={(e) => setBestOfLegs(e.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Beste X Vorrunden-Spiele zur Setzung (leer = alle)
          <input type="number" min="1" value={qualificationBestOf} onChange={(e) => setQualificationBestOf(e.target.value)} />
        </label>
      </div>
      <button type="submit" className="primary" style={{ alignSelf: 'flex-start' }}>
        KO-Runde starten
      </button>
    </form>
  )
}

function MatchRow({
  eventId,
  tournamentId,
  match,
  boards,
  onChanged,
}: {
  eventId: string
  tournamentId: string
  match: KnockoutMatch
  boards: Board[]
  onChanged: () => void
}) {
  const [boardId, setBoardId] = useState(boards[0]?.id ?? '')
  const [activeLeg, setActiveLeg] = useState<Game | null>(null)
  const [error, setError] = useState<string | null>(null)
  const lastGameId = match.gameIds[match.gameIds.length - 1]

  // Resume the last leg after a page reload - regardless of whether it's
  // still in progress or just finished, so a mis-entered final throw can
  // still be corrected before the next leg starts (see LegTurnForm). Once
  // the match itself is decided there's nothing left to correct here.
  useEffect(() => {
    setActiveLeg(null)
    if (!lastGameId || match.winnerId) return
    api.getGame(tournamentId, lastGameId).then(setActiveLeg)
  }, [tournamentId, lastGameId, match.winnerId])

  const isBye = match.player1Id === null || match.player2Id === null
  const isPending = match.player1Id === null && match.player2Id === null

  const startLeg = async () => {
    setError(null)
    try {
      const game = await api.createKnockoutLeg(eventId, tournamentId, match.id, boardId)
      setActiveLeg(game)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleLegChanged = (game: Game) => {
    setActiveLeg(game)
    if (game.status === 'Finished') onChanged()
  }

  return (
    <div data-testid={`match-${match.id}`} style={{ ...rowCardStyle(), display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap', fontSize: '0.85rem' }}>
        <span style={{ fontWeight: match.winnerId === match.player1Id ? 700 : 400 }}>
          {match.player1Name ?? (isPending ? 'offen' : 'Freilos')} ({match.player1Legs})
        </span>
        <span style={{ color: TEXT_FAINT }}>vs</span>
        <span style={{ fontWeight: match.winnerId === match.player2Id ? 700 : 400 }}>
          {match.player2Name ?? (isPending ? 'offen' : 'Freilos')} ({match.player2Legs})
        </span>
        <span style={{ color: TEXT_FAINT, fontSize: '0.78rem' }}>Best of {match.bestOfLegs}</span>
        {match.winnerId && <span style={pillStyle('on')}>Sieger: {match.winnerName}</span>}
      </div>
      {!match.winnerId && !isBye && !activeLeg && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.6rem' }}>
          <label style={fieldStyle}>
            Board
            <select value={boardId} onChange={(e) => setBoardId(e.target.value)}>
              {boards.map((board) => (
                <option key={board.id} value={board.id}>
                  {board.name ?? `Board ${board.number}`}
                </option>
              ))}
            </select>
          </label>
          <button type="button" onClick={startLeg} disabled={!boardId}>
            Leg starten
          </button>
        </div>
      )}
      {activeLeg && <LegTurnForm tournamentId={tournamentId} game={activeLeg} onChanged={handleLegChanged} />}
      {activeLeg && activeLeg.status === 'Finished' && !match.winnerId && (
        <button type="button" onClick={() => setActiveLeg(null)} style={{ alignSelf: 'flex-start' }}>
          Nächstes Leg vorbereiten
        </button>
      )}
      {!match.winnerId && !isBye && match.gameIds.length === 0 && (
        <SubstituteForm eventId={eventId} tournamentId={tournamentId} match={match} onChanged={onChanged} />
      )}
    </div>
  )
}

function SubstituteForm({
  eventId,
  tournamentId,
  match,
  onChanged,
}: {
  eventId: string
  tournamentId: string
  match: KnockoutMatch
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [eligible, setEligible] = useState<AvailableSubstitute[] | null>(null)
  const [outgoingPlayerId, setOutgoingPlayerId] = useState(match.player1Id ?? '')
  const [incomingPlayerId, setIncomingPlayerId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const openForm = () => {
    setOpen(true)
    setError(null)
    api
      .getAvailableKnockoutSubstitutes(eventId, tournamentId)
      .then((players) => {
        setEligible(players)
        setIncomingPlayerId(players[0]?.playerId ?? '')
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api.substituteKnockoutPlayer(eventId, tournamentId, match.id, outgoingPlayerId, incomingPlayerId)
      setOpen(false)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={openForm} style={{ ...buttonStyle('', 'secondary', 'sm'), alignSelf: 'flex-start' }}>
        Spieler ersetzen
      </button>
    )
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      {eligible && eligible.length === 0 && <p style={{ color: TEXT_MUTED, fontSize: '0.85rem', margin: 0 }}>Keine Nachrückspieler verfügbar.</p>}
      <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
        <label style={fieldStyle}>
          Ausscheidender Spieler
          <select value={outgoingPlayerId} onChange={(e) => setOutgoingPlayerId(e.target.value)}>
            {match.player1Id && <option value={match.player1Id}>{match.player1Name}</option>}
            {match.player2Id && <option value={match.player2Id}>{match.player2Name}</option>}
          </select>
        </label>
        <label style={fieldStyle}>
          Nachrückspieler
          <select value={incomingPlayerId} onChange={(e) => setIncomingPlayerId(e.target.value)}>
            {eligible?.map((player) => (
              <option key={player.playerId} value={player.playerId}>
                {player.playerName}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div style={{ display: 'flex', gap: '0.6rem' }}>
        <button type="submit" className="primary" disabled={!eligible || eligible.length === 0}>
          Ersetzen
        </button>
        <button type="button" onClick={() => setOpen(false)}>
          Abbrechen
        </button>
      </div>
    </form>
  )
}

function LegTurnForm({
  tournamentId,
  game,
  onChanged,
}: {
  tournamentId: string
  game: Game
  onChanged: (game: Game) => void
}) {
  const currentEntry = game.entries.find((e) => e.playerId === game.currentTurnPlayerId)
  const [score, setScore] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentEntry) return
    setError(null)
    try {
      const updated = await api.recordTurn(tournamentId, game.id, currentEntry.playerId, Number(score))
      setScore('')
      onChanged(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleUndo = async (undoPlayerId: string) => {
    setError(null)
    try {
      const updated = await api.undoTurn(tournamentId, game.id, undoPlayerId)
      onChanged(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {game.entries.map((entry) => (
          <li key={entry.playerId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>
              {entry.playerName}: {entry.total} ({entry.roundScores.join(', ') || 'noch keine Würfe'})
            </span>
            {entry.roundScores.length > 0 && (
              <button type="button" onClick={() => handleUndo(entry.playerId)} style={buttonStyle('', 'secondary', 'sm')}>
                Letzten Wurf korrigieren
              </button>
            )}
          </li>
        ))}
      </ul>
      {game.status === 'InProgress' && currentEntry && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <p style={{ margin: 0, fontSize: '0.85rem' }}>
            Jetzt spielt: <strong>{currentEntry.playerName}</strong>{' '}
            <span style={{ color: TEXT_FAINT }}>(Runde {currentEntry.roundScores.length + 1}/{game.rounds ?? '?'})</span>
          </p>
          <label style={fieldStyle}>
            Punkte (3 Darts)
            <input type="number" min="0" max="180" value={score} onChange={(e) => setScore(e.target.value)} required style={{ maxWidth: '10rem' }} />
          </label>
          <button type="submit" className="primary" style={{ alignSelf: 'flex-start' }}>
            Wurf eintragen
          </button>
        </form>
      )}
    </div>
  )
}
