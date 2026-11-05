import { useEffect, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { API_BASE_URL, api, type KnockoutMatch } from './api'
import logo from './assets/logo-full-transparent.svg'
import { brandingColors, useBranding } from './LiveGameView'

/**
 * Siegerehrung: static 1./2./3.-Platz podium for the Leinwand, matching the
 * old system's scoreboard/[eventId]/siegerehrung page - a plain, unanimated
 * result screen, opened manually by the Regie once a tournament has
 * finished (there was no auto-trigger in the old system either). Derives
 * placements from the existing KO-bracket data rather than a dedicated
 * endpoint: the final match's winner/loser are 1st/2nd, the "Spiel um
 * Platz 3" match's winner is 3rd. Reached via ?siegerehrung=<eventId>, with
 * an optional &tournament=<tournamentId> for events running several
 * tournaments side by side.
 */
export function SiegerehrungView({ eventId, requestedTournamentId }: { eventId: string; requestedTournamentId?: string }) {
  const [tournamentId, setTournamentId] = useState<string | null>(null)
  const [matches, setMatches] = useState<KnockoutMatch[] | null>(null)
  const branding = useBranding(eventId)
  const { primary, secondary } = brandingColors(branding)

  // Re-resolves which tournament to show every 10s, not just once on mount -
  // see the identical comment in BracketLeinwandView.tsx for why.
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
    connection.onreconnected(() => connection.invoke('JoinTournament', tournamentId))
    connection.start().then(() => connection.invoke('JoinTournament', tournamentId))
    return () => {
      connection.stop()
    }
  }, [tournamentId])

  const bracketMatches = (matches ?? []).filter((m) => !m.isThirdPlaceMatch)
  const finalRound = bracketMatches.length > 0 ? Math.max(...bracketMatches.map((m) => m.round)) : null
  const finalMatch = finalRound !== null ? bracketMatches.find((m) => m.round === finalRound) : undefined
  const thirdPlaceMatch = (matches ?? []).find((m) => m.isThirdPlaceMatch)

  const first = finalMatch?.winnerId
    ? { name: finalMatch.winnerName, isPlayer1: finalMatch.winnerId === finalMatch.player1Id }
    : null
  const second =
    finalMatch?.winnerId && first
      ? { name: first.isPlayer1 ? finalMatch.player2Name : finalMatch.player1Name }
      : null
  const third = thirdPlaceMatch?.winnerId ? { name: thirdPlaceMatch.winnerName } : null

  return (
    <main
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        boxSizing: 'border-box',
        padding: '2rem',
        background: secondary,
        color: primary,
        fontFamily: 'system-ui, "Segoe UI", Roboto, sans-serif',
      }}
    >
      <img
        src={branding?.hasLogo ? api.logoUrl(eventId, branding.logoVersion) : logo}
        alt="Logo"
        height={40}
        style={{ alignSelf: 'center', marginBottom: '1.5rem' }}
      />

      {matches === null && <p style={{ textAlign: 'center' }}>Lädt…</p>}
      {matches !== null && !first && <p style={{ textAlign: 'center', opacity: 0.7 }}>Turnier noch nicht abgeschlossen.</p>}

      {first && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '1.5rem' }}>
          <PodiumPlace place={2} name={second?.name ?? null} medal="🥈" height="60%" color={primary} />
          <PodiumPlace place={1} name={first.name} medal="🏆" height="85%" color={primary} />
          <PodiumPlace place={3} name={third?.name ?? null} medal="🥉" height="42%" color={primary} />
        </div>
      )}
    </main>
  )
}

function PodiumPlace({ place, name, medal, height, color }: { place: number; name: string | null; medal: string; height: string; color: string }) {
  return (
    <div data-testid={`podium-${place}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', width: '16rem' }}>
      <span style={{ fontSize: '2.5rem' }}>{medal}</span>
      <span style={{ fontSize: '1.3rem', fontWeight: 700, textAlign: 'center' }}>{name ?? '—'}</span>
      <div
        style={{
          width: '100%',
          height,
          borderRadius: '0.5rem 0.5rem 0 0',
          background: `color-mix(in srgb, ${color} 22%, transparent)`,
          border: `1px solid ${color}`,
          borderBottom: 'none',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          paddingTop: '0.6rem',
          fontSize: '2rem',
          fontWeight: 700,
        }}
      >
        {place}
      </div>
    </div>
  )
}
