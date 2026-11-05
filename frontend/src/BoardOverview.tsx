import { useEffect, useRef, useState } from 'react'
import * as signalR from '@microsoft/signalr'
import { API_BASE_URL, api, type DeviceStatus, type Game, type GameStatus, type PairingBoard } from './api'
import { TEXT_FAINT, pillStyle, tableStyle, tdStyle, thStyle } from './theme'

const STATUS_LABELS: Record<GameStatus, string> = {
  InProgress: 'Läuft',
  Finished: 'Beendet',
}

/**
 * Live overview of every board in the event for the Regie ("Notebook =
 * Regiezentrale mit Live-Übersicht", project plan 3.2: "Alle Boards auf
 * einen Blick - wer spielt gerade wo, aktueller Score, welche Runde,
 * welches Tablet/welcher Monitor ist verbunden [...] Aktualisiert sich
 * in Echtzeit von selbst"). Same single-shared-connection pattern as
 * LeinwandView - one SignalR connection joined to every board's group,
 * not one per tile.
 *
 * Device online status has no SignalR broadcast (see the pairing-picker
 * work), so that half is a 5s poll of the existing device list endpoint
 * rather than push - only the game state (score/round/status) is truly
 * pushed live.
 */
export interface BoardOverviewStats {
  boardsLive: number
  boardsTotal: number
  devicesOnline: number
  devicesTotal: number
  highestThrow: { score: number; playerName: string } | null
}

export function BoardOverview({
  eventId,
  onGameFinished,
  onStats,
}: {
  eventId: string
  onGameFinished?: () => void
  onStats?: (stats: BoardOverviewStats) => void
}) {
  const [boards, setBoards] = useState<PairingBoard[] | null>(null)
  const [games, setGames] = useState<Record<string, Game | null>>({})
  const [devices, setDevices] = useState<DeviceStatus[]>([])
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const boardsRef = useRef<PairingBoard[]>([])
  const finishedGameIdsRef = useRef<Set<string>>(new Set())
  const onGameFinishedRef = useRef(onGameFinished)
  onGameFinishedRef.current = onGameFinished
  const onStatsRef = useRef(onStats)
  onStatsRef.current = onStats

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

      const applyUpdate = (game: Game) => {
        setGames((prev) => ({ ...prev, [game.boardId]: game }))
        if (game.status === 'Finished' && !finishedGameIdsRef.current.has(game.id)) {
          finishedGameIdsRef.current.add(game.id)
          onGameFinishedRef.current?.()
        }
      }
      connection.on('gameUpdated', applyUpdate)
      connection.on('gameStarted', applyUpdate)

      const joinAllBoards = () => Promise.all(boardsRef.current.map((b) => connection!.invoke('JoinBoard', b.id)))

      connection.onreconnecting(() => setConnectionState('connecting'))
      connection.onreconnected(() => {
        setConnectionState('connected')
        joinAllBoards()
      })
      connection.onclose(() => setConnectionState('disconnected'))

      try {
        await connection.start()
        if (cancelled) return
        setConnectionState('connected')
        await joinAllBoards()
      } catch {
        if (!cancelled) setConnectionState('disconnected')
      }
    })

    return () => {
      cancelled = true
      connection?.stop()
    }
  }, [eventId])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      api.listDevices(eventId).then((loaded) => {
        if (!cancelled) setDevices(loaded)
      })
    }
    load()
    const interval = setInterval(load, 5000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [eventId])

  // Reports summary numbers up to whoever wants a dashboard-style overview
  // (stat tiles) without them needing to duplicate this component's own
  // board/game/device fetching.
  useEffect(() => {
    if (!onStatsRef.current) return
    let highestThrow: { score: number; playerName: string } | null = null
    for (const game of Object.values(games)) {
      for (const entry of game?.entries ?? []) {
        const best = Math.max(0, ...entry.roundScores)
        if (best > 0 && (!highestThrow || best > highestThrow.score)) {
          highestThrow = { score: best, playerName: entry.playerName }
        }
      }
    }
    onStatsRef.current({
      boardsLive: Object.values(games).filter((g) => g?.status === 'InProgress').length,
      boardsTotal: boards?.length ?? 0,
      devicesOnline: devices.filter((d) => d.isOnline).length,
      devicesTotal: devices.length,
      highestThrow,
    })
  }, [boards, games, devices])

  const deviceFor = (boardId: string, type: 'Tablet' | 'Monitor') =>
    devices.find((d) => d.boardId === boardId && d.type === type)

  const devicePill = (device: DeviceStatus | undefined) =>
    device ? (
      <span style={pillStyle(device.isOnline ? 'on' : 'off')}>{device.isOnline ? 'Online' : 'Offline'}</span>
    ) : (
      <span style={{ fontSize: '0.78rem', color: TEXT_FAINT }}>Nicht gepairt</span>
    )

  return (
    <div>
      <p style={{ margin: '0 0 0.7rem', fontSize: '0.78rem', color: TEXT_FAINT }}>
        Verbindung: {connectionState === 'connected' ? 'live' : connectionState === 'connecting' ? 'verbinde…' : 'getrennt'}
      </p>
      {boards === null && <p>Lädt…</p>}
      {boards !== null && boards.length === 0 && <p>Keine Boards für dieses Event vorhanden.</p>}
      {boards !== null && boards.length > 0 && (
        <table style={tableStyle()}>
          <thead>
            <tr>
              <th style={thStyle()}>Board</th>
              <th style={thStyle()}>Status</th>
              <th style={thStyle()}>Jetzt spielt</th>
              <th style={thStyle()}>Runde</th>
              <th style={thStyle()}>Tablet</th>
              <th style={thStyle()}>Monitor</th>
            </tr>
          </thead>
          <tbody>
            {boards.map((board) => {
              const game = games[board.id]
              const currentEntry = game?.entries.find((e) => e.playerId === game.currentTurnPlayerId)
              const tablet = deviceFor(board.id, 'Tablet')
              const monitor = deviceFor(board.id, 'Monitor')
              return (
                <tr key={board.id}>
                  <td style={{ ...tdStyle(), fontWeight: 600 }}>{board.name ?? `Board ${board.number}`}</td>
                  <td style={tdStyle()}>
                    {game ? (
                      <span style={pillStyle(game.status === 'InProgress' ? 'on' : 'off')}>{STATUS_LABELS[game.status]}</span>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: TEXT_FAINT }}>Kein Spiel</span>
                    )}
                  </td>
                  <td style={tdStyle()}>
                    {game?.status === 'InProgress' && currentEntry ? (
                      <>
                        {currentEntry.playerName} <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>({currentEntry.total})</span>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td style={{ ...tdStyle(), fontVariantNumeric: 'tabular-nums' }}>
                    {game?.status === 'InProgress'
                      ? game.mode === 'X01'
                        ? `Rest ${currentEntry?.remaining ?? game.startScore}`
                        : `${(currentEntry?.roundScores.length ?? 0) + 1}/${game.rounds}`
                      : '—'}
                  </td>
                  <td style={tdStyle()}>{devicePill(tablet)}</td>
                  <td style={tdStyle()}>{devicePill(monitor)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
