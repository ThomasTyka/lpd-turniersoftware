import { useEffect, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { API_BASE_URL, api, type AvailableSubstitute, type Board, type Game, type GroupRound } from './api'
import { DANGER, DANGER_BG, TEXT_FAINT, TEXT_MUTED, buttonStyle, rowCardStyle, sectionHeadingStyle, tableStyle, tdStyle } from './theme'

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }

/**
 * Gruppen-Runden: an alternative to the 1v1 KO-bracket, matching how the old
 * Tournament-Manager's "numberOfWinners per game" rounds worked. Each group
 * plays one shared Highscore game; the top AdvanceCount by score advance -
 * automatically unless there's a tie at the cutoff, which needs manual
 * resolution (project plan 3.1: "Tiebreak-Auflösung bei Punktgleichstand").
 */
export function GroupPanel({
  eventId,
  tournamentId,
  boards,
}: {
  eventId: string
  tournamentId: string
  boards: Board[]
}) {
  const [groups, setGroups] = useState<GroupRound[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    api
      .getGroupRounds(eventId, tournamentId)
      .then(setGroups)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(reload, [eventId, tournamentId])

  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/game`)
      .withAutomaticReconnect()
      .build()

    connection.on('groupsUpdated', (updated: GroupRound[]) =>
      setGroups((prev) => {
        if (!prev) return updated
        const byId = new Map(prev.map((g) => [g.id, g]))
        for (const g of updated) byId.set(g.id, g)
        return [...byId.values()]
      }),
    )
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
  if (!groups) return <p style={{ color: TEXT_MUTED, fontSize: '0.85rem', margin: 0 }}>Lädt…</p>

  const rounds = [...new Set(groups.map((g) => g.round))].sort((a, b) => a - b)
  const currentRound = rounds.length > 0 ? Math.max(...rounds) : 0
  const currentRoundGroups = groups.filter((g) => g.round === currentRound)
  const currentRoundDecided = currentRoundGroups.length > 0 && currentRoundGroups.every((g) => g.isDecided)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <h4 style={sectionHeadingStyle()}>Gruppen-Runde</h4>
      {rounds.map((round) => (
        <div key={round} style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          <h5 style={{ margin: 0, fontSize: '0.78rem', color: TEXT_FAINT, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Runde {round}</h5>
          {groups
            .filter((g) => g.round === round)
            .sort((a, b) => a.position - b.position)
            .map((group) => (
              <GroupRow key={group.id} eventId={eventId} tournamentId={tournamentId} group={group} boards={boards} onChanged={reload} />
            ))}
        </div>
      ))}
      {currentRoundDecided && (
        <StartGroupRoundForm eventId={eventId} tournamentId={tournamentId} onStarted={reload} advancingCount={currentRoundGroups.reduce((sum, g) => sum + g.advanceCount, 0)} />
      )}
      {rounds.length === 0 && <StartGroupRoundForm eventId={eventId} tournamentId={tournamentId} onStarted={reload} advancingCount={null} />}
    </div>
  )
}

function StartGroupRoundForm({
  eventId,
  tournamentId,
  onStarted,
  advancingCount,
}: {
  eventId: string
  tournamentId: string
  onStarted: () => void
  advancingCount: number | null
}) {
  const [participantCount, setParticipantCount] = useState(advancingCount ? String(advancingCount) : '16')
  const [groupCount, setGroupCount] = useState('4')
  const [advanceCount, setAdvanceCount] = useState('2')
  const [qualificationBestOf, setQualificationBestOf] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api.startGroupRound(eventId, tournamentId, {
        participantCount: Number(participantCount),
        groupCount: Number(groupCount),
        advanceCount: Number(advanceCount),
        qualificationBestOf: qualificationBestOf ? Number(qualificationBestOf) : undefined,
      })
      onStarted()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ ...rowCardStyle(), display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <h5 style={{ margin: 0, fontSize: '0.85rem' }}>{advancingCount ? 'Nächste Gruppen-Runde starten' : 'Gruppen-Runde starten'}</h5>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(10rem, 1fr))', gap: '0.7rem' }}>
        <label style={fieldStyle}>
          Teilnehmer {advancingCount ? '(aus den Aufsteigern)' : '(aus der Rangliste)'}
          <input type="number" min="2" value={participantCount} onChange={(e) => setParticipantCount(e.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Anzahl Gruppen
          <input type="number" min="1" value={groupCount} onChange={(e) => setGroupCount(e.target.value)} required />
        </label>
        <label style={fieldStyle}>
          Top X kommen pro Gruppe weiter
          <input type="number" min="1" value={advanceCount} onChange={(e) => setAdvanceCount(e.target.value)} required />
        </label>
        {!advancingCount && (
          <label style={fieldStyle}>
            Beste X Vorrunden-Spiele zur Setzung (leer = alle)
            <input type="number" min="1" value={qualificationBestOf} onChange={(e) => setQualificationBestOf(e.target.value)} />
          </label>
        )}
      </div>
      <button type="submit" className="primary" style={{ alignSelf: 'flex-start' }}>
        Gruppen-Runde starten
      </button>
    </form>
  )
}

function GroupRow({
  eventId,
  tournamentId,
  group,
  boards,
  onChanged,
}: {
  eventId: string
  tournamentId: string
  group: GroupRound
  boards: Board[]
  onChanged: () => void
}) {
  const [boardId, setBoardId] = useState(boards[0]?.id ?? '')
  const [activeGame, setActiveGame] = useState<Game | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Resume the group's game after a page reload - regardless of whether
  // it's still in progress or just finished, so a mis-entered throw can
  // still be corrected (see GroupTurnForm) until the group is decided.
  useEffect(() => {
    setActiveGame(null)
    if (!group.gameId || group.isDecided) return
    api.getGame(tournamentId, group.gameId).then(setActiveGame)
  }, [tournamentId, group.gameId, group.isDecided])

  const startGame = async () => {
    setError(null)
    try {
      const game = await api.createGroupGame(eventId, tournamentId, group.id, boardId)
      setActiveGame(game)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleGameChanged = (game: Game) => {
    setActiveGame(game)
    if (game.status === 'Finished') onChanged()
  }

  const standings = [...group.participants].sort((a, b) => b.total - a.total)

  return (
    <div data-testid={`group-${group.id}`} style={{ ...rowCardStyle(), display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
        <strong style={{ fontSize: '0.85rem' }}>Gruppe {group.position + 1}</strong>
        <span style={{ fontSize: '0.78rem', color: TEXT_FAINT }}>Top {group.advanceCount} kommen weiter</span>
      </div>
      <table style={tableStyle()}>
        <tbody>
          {standings.map((p) => (
            <tr key={p.playerId} style={{ opacity: group.isDecided && !p.isAdvancing ? 0.5 : 1 }}>
              <td style={{ ...tdStyle(), fontWeight: p.isAdvancing ? 700 : 400 }}>{p.playerName}</td>
              <td style={{ ...tdStyle(), textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{p.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!group.gameId && !activeGame && (
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
          <button type="button" onClick={startGame} disabled={!boardId}>
            Spiel starten
          </button>
        </div>
      )}
      {!group.gameId && !activeGame && (
        <SubstituteForm eventId={eventId} tournamentId={tournamentId} group={group} onChanged={onChanged} />
      )}
      {activeGame && <GroupTurnForm tournamentId={tournamentId} game={activeGame} onChanged={handleGameChanged} />}
      {group.needsTieBreak && (
        <TieBreakForm eventId={eventId} tournamentId={tournamentId} group={group} onResolved={onChanged} />
      )}
    </div>
  )
}

function SubstituteForm({
  eventId,
  tournamentId,
  group,
  onChanged,
}: {
  eventId: string
  tournamentId: string
  group: GroupRound
  onChanged: () => void
}) {
  const [open, setOpen] = useState(false)
  const [eligible, setEligible] = useState<AvailableSubstitute[] | null>(null)
  const [outgoingPlayerId, setOutgoingPlayerId] = useState(group.participants[0]?.playerId ?? '')
  const [incomingPlayerId, setIncomingPlayerId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const openForm = () => {
    setOpen(true)
    setError(null)
    api
      .getAvailableGroupSubstitutes(eventId, tournamentId)
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
      await api.substituteGroupParticipant(eventId, tournamentId, group.id, outgoingPlayerId, incomingPlayerId)
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
          Fehlender Spieler
          <select value={outgoingPlayerId} onChange={(e) => setOutgoingPlayerId(e.target.value)}>
            {group.participants.map((p) => (
              <option key={p.playerId} value={p.playerId}>
                {p.playerName}
              </option>
            ))}
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

function GroupTurnForm({
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

function TieBreakForm({
  eventId,
  tournamentId,
  group,
  onResolved,
}: {
  eventId: string
  tournamentId: string
  group: GroupRound
  onResolved: () => void
}) {
  const sorted = [...group.participants].sort((a, b) => b.total - a.total)
  const cutoffScore = sorted[group.advanceCount - 1]?.total
  const definiteAdvancers = sorted.filter((p) => p.total > cutoffScore)
  const tiedPlayers = sorted.filter((p) => p.total === cutoffScore)
  const spotsToChoose = group.advanceCount - definiteAdvancers.length

  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const toggle = (playerId: string) => {
    setChosen((prev) => {
      const next = new Set(prev)
      if (next.has(playerId)) next.delete(playerId)
      else if (next.size < spotsToChoose) next.add(playerId)
      return next
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      const advancingPlayerIds = [...definiteAdvancers.map((p) => p.playerId), ...chosen]
      await api.resolveGroupTie(eventId, tournamentId, group.id, advancingPlayerIds)
      onResolved()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', padding: '0.7rem 0.8rem', background: DANGER_BG, borderRadius: '0.5rem' }}>
      <p style={{ margin: 0, fontSize: '0.85rem', color: DANGER }}>
        Gleichstand bei {cutoffScore} Punkten - wähle {spotsToChoose} von {tiedPlayers.length} Spielern, die weiterkommen.
      </p>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
        {tiedPlayers.map((p) => (
          <label key={p.playerId} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.85rem' }}>
            <input type="checkbox" checked={chosen.has(p.playerId)} onChange={() => toggle(p.playerId)} />
            {p.playerName} ({p.total})
          </label>
        ))}
      </div>
      <button type="submit" className="primary" disabled={chosen.size !== spotsToChoose} style={{ alignSelf: 'flex-start' }}>
        Entscheidung bestätigen
      </button>
    </form>
  )
}
