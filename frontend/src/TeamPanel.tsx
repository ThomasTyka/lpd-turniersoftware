import { useEffect, useState } from 'react'
import { api, type Player, type Team } from './api'
import { ConfirmDeleteButton } from './ConfirmDeleteButton'
import { BORDER, DANGER, SURFACE_2, TEXT_FAINT, TEXT_MUTED, buttonStyle, rowCardStyle, sectionHeadingStyle } from './theme'

const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.8rem' }

/**
 * Teams: a named group of an event's players, matching the old
 * Tournament-Manager's Team model (project plan: "Highscore ... und 501,
 * jeweils als Einzel- oder Team-Variante"). Members still throw
 * individually - see TeamLeaderboard in EventDetailView for how a team's
 * score is aggregated from its members' game totals.
 */
export function TeamPanel({ eventId, players }: { eventId: string; players: Player[] }) {
  const [teams, setTeams] = useState<Team[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = () => {
    api
      .getTeams(eventId)
      .then(setTeams)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
  }

  useEffect(reload, [eventId])

  if (error)
    return (
      <p role="alert" style={{ color: DANGER, margin: 0 }}>
        {error}
      </p>
    )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {teams && teams.length === 0 && <p style={{ color: TEXT_MUTED, fontSize: '0.85rem', margin: 0 }}>Noch keine Teams angelegt.</p>}
      {teams && teams.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
          {teams.map((team) => (
            <TeamRow key={team.id} eventId={eventId} team={team} players={players} onChanged={reload} />
          ))}
        </div>
      )}
      <CreateTeamForm eventId={eventId} players={players} onCreated={reload} />
    </div>
  )
}

function TeamRow({
  eventId,
  team,
  players,
  onChanged,
}: {
  eventId: string
  team: Team
  players: Player[]
  onChanged: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [addPlayerId, setAddPlayerId] = useState('')
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(team.name)

  const availablePlayers = players
    .filter((p) => !team.players.some((tp) => tp.playerId === p.id))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'de'))

  const handleRename = async () => {
    setError(null)
    try {
      await api.renameTeam(eventId, team.id, name)
      setEditingName(false)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api.addTeamPlayer(eventId, team.id, addPlayerId)
      setAddPlayerId('')
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleRemove = async (playerId: string) => {
    setError(null)
    try {
      await api.removeTeamPlayer(eventId, team.id, playerId)
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div style={{ ...rowCardStyle(), display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem' }}>
        {editingName ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: '10rem' }} autoFocus />
            <button type="button" className="primary" onClick={handleRename}>
              Speichern
            </button>
            <button
              type="button"
              onClick={() => {
                setName(team.name)
                setEditingName(false)
              }}
              style={buttonStyle('', 'secondary', 'sm')}
            >
              Abbrechen
            </button>
          </div>
        ) : (
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <strong style={{ fontSize: '0.9rem' }}>{team.name}</strong>
            <button type="button" onClick={() => setEditingName(true)} style={buttonStyle('', 'secondary', 'sm')}>
              Umbenennen
            </button>
          </span>
        )}
        <ConfirmDeleteButton label="Team löschen" size="sm" onConfirm={() => api.deleteTeam(eventId, team.id).then(onChanged)} />
      </div>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      {team.players.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, fontSize: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
          {team.players.map((p) => (
            <li key={p.playerId} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {p.playerName}
              <button type="button" onClick={() => handleRemove(p.playerId)} style={buttonStyle('', 'secondary', 'sm')}>
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}
      {availablePlayers.length === 0 && team.players.length === 0 && (
        <p style={{ color: TEXT_FAINT, fontSize: '0.78rem', margin: 0 }}>Keine Spieler im Team.</p>
      )}
      {availablePlayers.length > 0 && (
        <form onSubmit={handleAdd} style={{ display: 'flex', gap: '0.5rem' }}>
          <select value={addPlayerId} onChange={(e) => setAddPlayerId(e.target.value)}>
            <option value="">Spieler wählen…</option>
            {availablePlayers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.displayName}
              </option>
            ))}
          </select>
          <button type="submit" disabled={!addPlayerId} style={buttonStyle('', 'secondary', 'sm')}>
            Hinzufügen
          </button>
        </form>
      )}
    </div>
  )
}

/**
 * Same "Verfügbare Spieler" / "Ausgewählte Spieler" transfer-list UX as
 * the Tablet's own game-start screen (NewGameOnBoard in
 * TabletScoreEntry.tsx, itself matching the old system's games-form.tsx) -
 * a plain stacked checkbox list got unwieldy once an event has more than a
 * handful of players, with no way to find one by name.
 */
function CreateTeamForm({
  eventId,
  players,
  onCreated,
}: {
  eventId: string
  players: Player[]
  onCreated: () => void
}) {
  const [name, setName] = useState('')
  const [selectedPlayers, setSelectedPlayers] = useState<Player[]>([])
  const [search, setSearch] = useState('')
  const [highlightedAvailable, setHighlightedAvailable] = useState<Set<string>>(new Set())
  const [highlightedSelected, setHighlightedSelected] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  const availablePlayers = players
    .filter((p) => !selectedPlayers.some((s) => s.id === p.id))
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await api.createTeam(
        eventId,
        name,
        selectedPlayers.map((p) => p.id),
      )
      setName('')
      setSelectedPlayers([])
      onCreated()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const listStyle: React.CSSProperties = {
    border: `1px solid ${BORDER}`,
    borderRadius: '0.5rem',
    background: SURFACE_2,
    maxHeight: '11rem',
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  }

  const rowStyle = (highlighted: boolean): React.CSSProperties => ({
    padding: '0.45rem 0.6rem',
    fontSize: '0.85rem',
    cursor: 'pointer',
    background: highlighted ? 'rgba(255,173,0,0.18)' : 'transparent',
  })

  return (
    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
      <h4 style={sectionHeadingStyle()}>Neues Team</h4>
      {error && (
        <p role="alert" style={{ color: DANGER, margin: 0 }}>
          {error}
        </p>
      )}
      <label style={fieldStyle}>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required style={{ maxWidth: '16rem' }} />
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
            <div style={listStyle}>
              {filteredAvailable.length === 0 && <p style={{ color: TEXT_FAINT, fontSize: '0.78rem', margin: '0.5rem 0.6rem' }}>Keine Spieler verfügbar.</p>}
              {filteredAvailable.map((player) => (
                <div key={player.id} onClick={() => toggleAvailable(player.id)} style={rowStyle(highlightedAvailable.has(player.id))}>
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
            <div style={listStyle}>
              {selectedPlayers.length === 0 && <p style={{ color: TEXT_FAINT, fontSize: '0.78rem', margin: '0.5rem 0.6rem' }}>Keine Spieler ausgewählt.</p>}
              {selectedPlayers.map((player) => (
                <div key={player.id} onClick={() => toggleSelected(player.id)} style={rowStyle(highlightedSelected.has(player.id))}>
                  {player.displayName}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <button type="submit" className="primary" disabled={selectedPlayers.length === 0} style={{ alignSelf: 'flex-start' }}>
        Team anlegen
      </button>
    </form>
  )
}
