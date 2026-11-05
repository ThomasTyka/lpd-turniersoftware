import { useEffect, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { API_BASE_URL, api, type KnockoutMatch } from './api'
import logo from './assets/logo-full-transparent.svg'
import { brandingColors, useBranding } from './LiveGameView'

const ROUND_LABELS: Record<number, string> = {
  1: 'Finale',
  2: 'Halbfinale',
  4: 'Viertelfinale',
  8: 'Achtelfinale',
  16: 'Sechzehntelfinale',
}

function roundLabel(matchesInRound: number): string {
  return ROUND_LABELS[matchesInRound] ?? `Runde`
}

const MATCH_W = 220
const MATCH_H = 60
const COL_GAP = 70
const ROW_GAP = 28
const PAD = 40

/**
 * KO-Baum: bracket tree scene for the Leinwand (project plan 3.3 lists
 * "KO-Baum" as one of the freely combinable scene building blocks). Read-only
 * and anonymous, same as LeinwandView - reached via ?bracket=<eventId>, with
 * an optional &tournament=<tournamentId> to target a specific tournament
 * once an event runs several side by side. Without it, the server picks one
 * for backward compatibility with single-tournament events.
 */
export function BracketLeinwandView({ eventId, requestedTournamentId }: { eventId: string; requestedTournamentId?: string }) {
  const [tournamentId, setTournamentId] = useState<string | null>(null)
  const [matches, setMatches] = useState<KnockoutMatch[] | null>(null)
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const branding = useBranding(eventId)
  const { primary, secondary } = brandingColors(branding)

  // Re-resolves which tournament to show every 10s, not just once on mount -
  // without `requestedTournamentId` pinning a specific one, this follows
  // whichever tournament the Regie just started/activated (GET /knockout
  // picks FinalStarted, falling back to Finished). A screen left open for
  // the whole event would otherwise keep showing the tournament that was
  // current when it first loaded, forever.
  useEffect(() => {
    let cancelled = false
    const load = () =>
      api.getEventKnockout(eventId, requestedTournamentId).then((result) => {
        if (cancelled) return
        setTournamentId(result?.tournamentId ?? null)
        setMatches(result?.matches ?? [])
      })
    load()
    const interval = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [eventId, requestedTournamentId])

  useEffect(() => {
    if (!tournamentId) return

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE_URL}/hubs/game`)
      .withAutomaticReconnect()
      .build()

    connection.on('knockoutUpdated', (updated: KnockoutMatch[]) => setMatches(updated))
    connection.onreconnecting(() => setConnectionState('connecting'))
    connection.onreconnected(() => {
      setConnectionState('connected')
      connection.invoke('JoinTournament', tournamentId)
    })
    connection.onclose(() => setConnectionState('disconnected'))

    connection
      .start()
      .then(async () => {
        setConnectionState('connected')
        await connection.invoke('JoinTournament', tournamentId)
      })
      .catch(() => setConnectionState('disconnected'))

    return () => {
      connection.stop()
    }
  }, [tournamentId])

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        boxSizing: 'border-box',
        padding: '1.5rem 2rem',
        background: secondary,
        color: primary,
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexShrink: 0, marginBottom: '1rem' }}>
        <img src={branding?.hasLogo ? api.logoUrl(eventId, branding.logoVersion) : logo} alt="Logo" height={40} />
        <p style={{ margin: 0, fontSize: '0.85rem', opacity: 0.7 }}>
          Verbindung: {connectionState === 'connected' ? 'live' : connectionState === 'connecting' ? 'verbinde…' : 'getrennt'}
        </p>
      </div>
      {matches === null && <p>Lädt…</p>}
      {matches !== null && matches.length === 0 && <p style={{ opacity: 0.7 }}>Noch keine KO-Runde gestartet.</p>}
      {matches !== null && matches.length > 0 && (
        <div className="lpd-fade-in-slow" style={{ flex: 1, minHeight: 0 }}>
          <Bracket matches={matches} />
        </div>
      )}
    </main>
  )
}

// Rendered as one scalable SVG (viewBox + width 100%) rather than pixel-sized
// divs, so text and layout scale with the actual screen size (project plan
// 3.4: "Schriftgrößen skalieren automatisch mit der Bildschirmgröße").
function Bracket({ matches }: { matches: KnockoutMatch[] }) {
  const bracketMatches = matches.filter((m) => !m.isThirdPlaceMatch)
  const thirdPlaceMatch = matches.find((m) => m.isThirdPlaceMatch)
  const rounds = [...new Set(bracketMatches.map((m) => m.round))].sort((a, b) => a - b)
  const minRound = rounds[0]

  const round1Matches = bracketMatches.filter((m) => m.round === minRound).sort((a, b) => a.position - b.position)
  const centerY: Record<string, number> = {}
  round1Matches.forEach((m, i) => {
    centerY[`${m.round}-${m.position}`] = PAD + i * (MATCH_H + ROW_GAP) + MATCH_H / 2
  })
  for (const round of rounds.slice(1)) {
    const roundMatches = bracketMatches.filter((m) => m.round === round)
    for (const m of roundMatches) {
      const y0 = centerY[`${round - 1}-${m.position * 2}`]
      const y1 = centerY[`${round - 1}-${m.position * 2 + 1}`]
      centerY[`${round}-${m.position}`] = y0 !== undefined && y1 !== undefined ? (y0 + y1) / 2 : (y0 ?? y1 ?? PAD)
    }
  }

  const xOf = (round: number) => PAD + rounds.indexOf(round) * (MATCH_W + COL_GAP)
  const width = PAD * 2 + rounds.length * MATCH_W + (rounds.length - 1) * COL_GAP
  const bracketHeight = PAD * 2 + round1Matches.length * (MATCH_H + ROW_GAP) - ROW_GAP
  const thirdPlaceY = bracketHeight + 40
  const height = thirdPlaceMatch ? thirdPlaceY + MATCH_H + PAD : bracketHeight

  const connectors: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (const round of rounds.slice(1)) {
    const roundMatches = bracketMatches.filter((m) => m.round === round)
    for (const m of roundMatches) {
      const y0 = centerY[`${round - 1}-${m.position * 2}`]
      const y1 = centerY[`${round - 1}-${m.position * 2 + 1}`]
      const yNext = centerY[`${round}-${m.position}`]
      if (y0 === undefined || y1 === undefined) continue
      const xFeeder = xOf(round - 1) + MATCH_W
      const xMid = xFeeder + COL_GAP / 2
      const xNext = xOf(round)
      connectors.push({ x1: xFeeder, y1: y0, x2: xMid, y2: y0 })
      connectors.push({ x1: xFeeder, y1: y1, x2: xMid, y2: y1 })
      connectors.push({ x1: xMid, y1: y0, x2: xMid, y2: y1 })
      connectors.push({ x1: xMid, y1: yNext, x2: xNext, y2: yNext })
    }
  }

  return (
    <svg width="100%" height="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" style={{ fill: 'currentColor' }}>
      {connectors.map((c, i) => (
        <line key={i} x1={c.x1} y1={c.y1} x2={c.x2} y2={c.y2} stroke="currentColor" strokeWidth={1.5} />
      ))}
      {rounds.map((round) => {
        const roundMatches = bracketMatches.filter((m) => m.round === round)
        return (
          <text key={round} x={xOf(round)} y={20} fontSize={16}>
            {roundLabel(roundMatches.length)}
          </text>
        )
      })}
      {bracketMatches.map((m) => (
        <MatchBox key={m.id} match={m} x={xOf(m.round)} y={centerY[`${m.round}-${m.position}`] - MATCH_H / 2} />
      ))}
      {thirdPlaceMatch && (
        <g>
          <text x={xOf(rounds[rounds.length - 1])} y={thirdPlaceY - 12} fontSize={16}>
            Spiel um Platz 3
          </text>
          <MatchBox match={thirdPlaceMatch} x={xOf(rounds[rounds.length - 1])} y={thirdPlaceY} />
        </g>
      )}
    </svg>
  )
}

function MatchBox({ match, x, y }: { match: KnockoutMatch; x: number; y: number }) {
  const player1IsWinner = match.winnerId !== null && match.winnerId === match.player1Id
  const player2IsWinner = match.winnerId !== null && match.winnerId === match.player2Id

  return (
    <g data-testid={`match-${match.id}`}>
      <rect x={x} y={y} width={MATCH_W} height={MATCH_H} fill="none" stroke="currentColor" strokeWidth={1.5} />
      <line x1={x} y1={y + MATCH_H / 2} x2={x + MATCH_W} y2={y + MATCH_H / 2} stroke="currentColor" strokeWidth={1} opacity={0.4} />
      <text x={x + 12} y={y + 25} fontSize={15} fontWeight={player1IsWinner ? 700 : 400} opacity={match.winnerId && !player1IsWinner ? 0.5 : 1}>
        {match.player1Name ?? (match.player2Id ? 'Freilos' : 'offen')}
      </text>
      <text x={x + MATCH_W - 12} y={y + 25} fontSize={15} textAnchor="end" fontWeight={player1IsWinner ? 700 : 400} opacity={match.winnerId && !player1IsWinner ? 0.5 : 1}>
        {match.player1Legs}
      </text>
      <text x={x + 12} y={y + 49} fontSize={15} fontWeight={player2IsWinner ? 700 : 400} opacity={match.winnerId && !player2IsWinner ? 0.5 : 1}>
        {match.player2Name ?? (match.player1Id ? 'Freilos' : 'offen')}
      </text>
      <text x={x + MATCH_W - 12} y={y + 49} fontSize={15} textAnchor="end" fontWeight={player2IsWinner ? 700 : 400} opacity={match.winnerId && !player2IsWinner ? 0.5 : 1}>
        {match.player2Legs}
      </text>
    </g>
  )
}
