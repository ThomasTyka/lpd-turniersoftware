import type { Game, GameEntry } from './api'

/**
 * Ein am Tablet eingetragener Wurf, der noch nicht vom Server bestätigt ist
 * (E-17, P1-10). Jeder Wurf hat eine eigene Kennung, damit der Server einen
 * erneut gesendeten Wurf erkennt und nicht doppelt zählt.
 */
export interface PendingTurn {
  clientTurnId: string
  gameId: string
  playerId: string
  playerName: string
  score: number
  /** 0-basierte Aufnahme-Nummer des Spielers, die dieser Wurf belegt. */
  roundIndex: number
  createdAt: string
  /** Gesetzt, wenn der Server den Wurf abgelehnt hat - die Warteschlange hält dann an, bis am Tablet entschieden wird. */
  rejection?: TurnRejection
}

export interface TurnRejection {
  code: string
  message: string
}

/** Lesbare Gründe für die festen Ablehnungs-Codes des Servers (TabletTurnHandler.cs). */
export const REJECTION_TEXTS: Record<string, string> = {
  NotPaired: 'Dieses Tablet ist keinem Board mehr zugeordnet.',
  GameNotFound: 'Das Spiel gibt es nicht mehr (abgebrochen oder gelöscht).',
  GameFinished: 'Das Spiel ist bereits beendet.',
  PlayerNotInGame: 'Der Spieler gehört nicht zu diesem Spiel.',
  NotYourTurn: 'Der Spieler war laut Server noch nicht dran.',
  RoundAlreadyRecorded: 'Diese Aufnahme ist beim Server schon eingetragen.',
  InvalidScore: 'Die Punktzahl ist ungültig.',
  Legacy: 'Wurf aus der Zeit vor dem Update – bitte prüfen.',
}

export function rejectionText(rejection: TurnRejection): string {
  return REJECTION_TEXTS[rejection.code] ?? rejection.message
}

// crypto.randomUUID() gibt es nur in sicheren Kontexten (HTTPS/localhost) -
// die Tablets laufen über http:// im Event-Netz, daher die Ersatzlösung
// (gleiches Vorgehen wie die Geräte-ID in DevicePairing.tsx).
export function newClientTurnId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

/**
 * Wer ist dran - dieselbe Regel wie Game.CurrentTurnPlayerId im Backend:
 * wer die wenigsten Aufnahmen hat; bei Gleichstand der Erste in der
 * Wurfreihenfolge. `entries` kommt vom Server bereits in Wurfreihenfolge
 * sortiert (GameEndpoints.ToDtoAsync).
 */
export function currentTurnPlayerId(entries: GameEntry[]): string | null {
  let best: GameEntry | null = null
  for (const entry of entries) {
    if (!best || entry.roundScores.length < best.roundScores.length) best = entry
  }
  return best?.playerId ?? null
}

function isFinished(game: Game, entries: GameEntry[]): boolean {
  if (game.mode === 'Highscore') return game.rounds !== null && entries.every((e) => e.roundScores.length >= game.rounds!)
  return entries.some((e) => e.remaining === 0)
}

/**
 * Rechnet die noch nicht bestätigten Würfe auf den letzten bekannten
 * Server-Stand, damit das Tablet auch offline korrekt zum nächsten Spieler
 * weiterrückt (E-17). Ein wartender Wurf, dessen Aufnahme der Server schon
 * enthält (Antwort ging verloren, Stand kam aber per Live-Verbindung an),
 * wird nicht noch einmal aufgerechnet. Ab dem ersten abgelehnten Wurf wird
 * nichts mehr aufgerechnet - die Reihenfolge danach ist erst nach der
 * Entscheidung am Tablet wieder sicher.
 */
export function applyPendingTurns(game: Game, queue: PendingTurn[]): Game {
  const pending = queue.filter((t) => t.gameId === game.id)
  if (pending.length === 0 || game.status !== 'InProgress') return game

  const entries = game.entries.map((e) => ({ ...e, roundScores: [...e.roundScores] }))
  let applied = false
  for (const turn of pending) {
    if (turn.rejection) break
    const entry = entries.find((e) => e.playerId === turn.playerId)
    if (!entry) break
    if (turn.roundIndex < entry.roundScores.length) continue
    if (turn.roundIndex > entry.roundScores.length) break
    entry.roundScores.push(turn.score)
    entry.total += turn.score
    if (entry.remaining !== null) entry.remaining -= turn.score
    applied = true
  }
  if (!applied) return game

  const finished = isFinished(game, entries)
  return {
    ...game,
    entries,
    status: finished ? 'Finished' : 'InProgress',
    currentTurnPlayerId: finished ? null : currentTurnPlayerId(entries),
  }
}

/** Aufnahme-Nummer, die der nächste Wurf des Spielers belegt (auf dem bereits hochgerechneten Stand). */
export function nextRoundIndex(game: Game, playerId: string): number {
  return game.entries.find((e) => e.playerId === playerId)?.roundScores.length ?? 0
}

export const LEGACY_REJECTION_CODE = 'Legacy'

/**
 * Speicher der Warteschlange im Tablet (localStorage) - überlebt Neuladen
 * und Absturz. Einträge im alten Format (vor E-17: nur Spieler + Punkte)
 * werden nicht verworfen, sondern als „bitte prüfen“ markiert: Ohne Spiel
 * und Aufnahme-Nummer ist ein automatisches Nachsenden nicht sicher, also
 * entscheidet die Bedienung am Tablet (erneut senden oder verwerfen).
 */
export function readQueue(key: string): PendingTurn[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(localStorage.getItem(key) ?? '[]')
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []

  let migrated = false
  const queue = parsed
    .filter((t) => typeof t?.playerId === 'string' && typeof t?.score === 'number')
    .map((t): PendingTurn => {
      if (typeof t.clientTurnId === 'string' && typeof t.gameId === 'string') return t as PendingTurn
      migrated = true
      return {
        clientTurnId: newClientTurnId(),
        gameId: '',
        playerId: t.playerId,
        playerName: 'Spieler',
        score: t.score,
        roundIndex: -1,
        createdAt: new Date().toISOString(),
        rejection: { code: LEGACY_REJECTION_CODE, message: 'Wurf aus der Zeit vor dem Update – bitte prüfen.' },
      }
    })
  if (migrated) writeQueue(key, queue)
  return queue
}

export function writeQueue(key: string, queue: PendingTurn[]) {
  localStorage.setItem(key, JSON.stringify(queue))
}
