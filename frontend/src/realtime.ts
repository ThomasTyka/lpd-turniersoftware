import * as signalR from '@microsoft/signalr'
import { API_BASE_URL } from './api'

export type ConnectionState = 'connecting' | 'connected' | 'disconnected'

/**
 * Wartezeiten fürs Neuverbinden (E-18, P1-09): schnell am Anfang, danach
 * dauerhaft alle 10 s - ohne Zeitlimit. Die Standard-Einstellung von
 * SignalR (0, 2, 10, 30 s, dann aufgeben) ließ die Geräte nach ca. 45 s
 * ohne WLAN endgültig getrennt zurück.
 */
const RETRY_DELAYS_MS = [0, 1000, 2000, 5000]
const MAX_RETRY_DELAY_MS = 10000

export function retryDelay(attempt: number): number {
  return RETRY_DELAYS_MS[attempt] ?? MAX_RETRY_DELAY_MS
}

/**
 * Live-Verbindung zum Hub, die nie aufgibt.
 *
 * - `setup` registriert die Meldungs-Handler (einmal, vor dem Start).
 * - `onConnected` läuft nach JEDER erfolgreichen (Wieder-)Verbindung - hier
 *   treten die Geräte ihren Gruppen bei, melden sich online und laden den
 *   aktuellen Stand neu, damit nichts verpasst wird, was während der
 *   Trennung passiert ist.
 * - Bricht die Verbindung trotz automatischem Neuverbinden ganz ab (z. B.
 *   Server-Neustart), wird sie von hier aus neu gestartet.
 *
 * Gibt eine Funktion zum Beenden zurück (für den useEffect-Cleanup).
 */
export function createLiveConnection({
  setup,
  onConnected,
  onStateChange,
}: {
  setup?: (connection: signalR.HubConnection) => void
  onConnected?: (connection: signalR.HubConnection) => void | Promise<void>
  onStateChange?: (state: ConnectionState) => void
}): () => void {
  let stopped = false
  let restartTimer: ReturnType<typeof setTimeout> | undefined

  const connection = new signalR.HubConnectionBuilder()
    .withUrl(`${API_BASE_URL}/hubs/game`)
    .withAutomaticReconnect({ nextRetryDelayInMilliseconds: (ctx) => retryDelay(ctx.previousRetryCount) })
    .build()

  setup?.(connection)

  const connected = async () => {
    onStateChange?.('connected')
    try {
      await onConnected?.(connection)
    } catch {
      // Beitreten/Neuladen fehlgeschlagen (Verbindung gleich wieder weg) -
      // der nächste Neuverbindungs-Durchlauf versucht es erneut.
    }
  }

  const start = async (attempt: number) => {
    if (stopped) return
    onStateChange?.('connecting')
    try {
      await connection.start()
      if (stopped) {
        connection.stop()
        return
      }
      await connected()
    } catch {
      if (stopped) return
      onStateChange?.('disconnected')
      restartTimer = setTimeout(() => start(attempt + 1), retryDelay(attempt + 1) || 1000)
    }
  }

  connection.onreconnecting(() => onStateChange?.('connecting'))
  connection.onreconnected(() => {
    connected()
  })
  connection.onclose(() => {
    if (stopped) return
    onStateChange?.('disconnected')
    restartTimer = setTimeout(() => start(0), 1000)
  })

  start(0)

  return () => {
    stopped = true
    clearTimeout(restartTimer)
    connection.stop()
  }
}

/**
 * Wiederholt einen Abruf, bis er klappt (E-18: „der erste Abruf beim Start
 * wird wiederholt, bis er klappt“) - erst nach 3 s, dann immer länger bis
 * höchstens 10 s. Eine gültige Antwort wie „kein Spiel am Board“ (null) ist
 * ein Erfolg, nur ein echter Fehler (Netz weg, Server-Fehler) wird
 * wiederholt. Gibt undefined zurück, wenn `isCancelled()` vorher wahr wird.
 */
export async function retryUntilSuccess<T>(load: () => Promise<T>, isCancelled: () => boolean): Promise<T | undefined> {
  let delay = 3000
  for (;;) {
    if (isCancelled()) return undefined
    try {
      return await load()
    } catch {
      if (isCancelled()) return undefined
      await new Promise((resolve) => setTimeout(resolve, delay))
      delay = Math.min(delay * 2, MAX_RETRY_DELAY_MS)
    }
  }
}
