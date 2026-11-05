// The backend now serves the built frontend itself (see Program.cs) - same
// origin, same port - so the API lives at that same origin by default.
// VITE_API_BASE_URL remains available to override this for the separate
// Vite dev server workflow, where frontend and backend run on different
// ports. Falling back to "http://localhost:8080" here would silently break
// every API call on any device other than the machine running the
// dev server, since "localhost" always means the device itself.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? window.location.origin

const TOKEN_STORAGE_KEY = 'lpd_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY)
}

function setToken(token: string) {
  localStorage.setItem(TOKEN_STORAGE_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_STORAGE_KEY)
}

export class UnauthorizedError extends Error {}

export type EventStatus = 'Draft' | 'Active' | 'Archived'

export interface EventSummary {
  id: string
  name: string
  customerName: string
  eventDate: string
  location: string
  status: EventStatus
  plannedBoardCount: number | null
  primaryColor: string | null
  secondaryColor: string | null
  logoPath: string | null
}

export interface EventBranding {
  name: string
  primaryColor: string | null
  secondaryColor: string | null
  hasLogo: boolean
  logoVersion: string | null
}

export interface Player {
  id: string
  firstName: string
  lastName: string
  nickname: string | null
  displayName: string
}

export interface Board {
  id: string
  number: number
  name: string | null
  locationDescription: string | null
  status: number
}

export type DeviceType = 'Tablet' | 'Monitor'

export interface DevicePairing {
  clientDeviceId: string
  eventId: string
  type: DeviceType
  boardId: string
  pairedAt: string
  expiresAt: string | null
}

export interface PairingBoard {
  id: string
  number: number
  name: string | null
}

export interface PairingPlayer {
  id: string
  displayName: string
}

export interface PairingRoster {
  players: PairingPlayer[]
  tournamentId: string | null
  qualificationSettings: GameSettings | null
}

export interface DeviceStatus {
  clientDeviceId: string
  type: DeviceType
  boardId: string
  boardName: string
  pairedAt: string
  expiresAt: string | null
  isOnline: boolean
}

export interface UnassignedDevice {
  clientDeviceId: string
  type: DeviceType
  shortCode: string
  lastSeenAt: string
}

export interface LeaderboardEntry {
  playerId: string
  playerName: string
  gamesPlayed: number
  gamesCounted: number
  score: number
  /** Every finished game's total, sorted descending - the same order the counted best-of-N were taken from. */
  gameScores: number[]
}

export type LeinwandScene = 'scores' | 'leaderboard'

export interface LeinwandSettings {
  activeScenes: LeinwandScene[]
  intervalSeconds: number
  pinnedScene: LeinwandScene | null
}

export interface GameSettings {
  mode: 'Highscore' | 'X01'
  startScore: number | null
  rounds: number | null
}

export interface Tournament {
  id: string
  qualificationSettings: GameSettings
  finalSettings: GameSettings
  status: string
  qualificationBestOf: number | null
  knockoutPhaseOverride: string | null
}

export interface TournamentOverview {
  activeGamesCount: number
  currentRoundWinners: { playerId: string; playerName: string }[] | null
}

export interface GameEntry {
  playerId: string
  playerName: string
  roundScores: number[]
  total: number
  remaining: number | null
}

export type GameStatus = 'InProgress' | 'Finished'

export interface Game {
  id: string
  tournamentId: string
  boardId: string
  mode: 'Highscore' | 'X01'
  rounds: number | null
  startScore: number | null
  status: GameStatus
  currentTurnPlayerId: string | null
  entries: GameEntry[]
  knockoutMatchId: string | null
  isTied: boolean
  tiebreakWinnerId: string | null
}

export interface KnockoutMatch {
  id: string
  round: number
  position: number
  bestOfLegs: number
  isThirdPlaceMatch: boolean
  player1Id: string | null
  player1Name: string | null
  player2Id: string | null
  player2Name: string | null
  winnerId: string | null
  winnerName: string | null
  player1Legs: number
  player2Legs: number
  gameIds: string[]
}

export interface AvailableSubstitute {
  playerId: string
  playerName: string
}

export interface EventKnockout {
  tournamentId: string
  matches: KnockoutMatch[]
}

export interface GroupParticipant {
  playerId: string
  playerName: string
  total: number
  isAdvancing: boolean
}

export interface GroupRound {
  id: string
  round: number
  position: number
  advanceCount: number
  isDecided: boolean
  needsTieBreak: boolean
  gameId: string | null
  gameStatus: GameStatus | null
  participants: GroupParticipant[]
}

export interface TeamPlayer {
  playerId: string
  playerName: string
}

export interface Team {
  id: string
  name: string
  players: TeamPlayer[]
}

export interface TeamLeaderboardEntry {
  teamId: string
  teamName: string
  gamesPlayed: number
  gamesCounted: number
  score: number
}

export interface EventDetail extends EventSummary {
  players: Player[]
  boards: Board[]
  tournaments: Tournament[]
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })
  if (response.status === 401) {
    clearToken()
    throw new UnauthorizedError('Nicht angemeldet')
  }
  if (!response.ok) {
    const message = await response.json().catch(() => `API returned ${response.status}`)
    throw new Error(typeof message === 'string' ? message : `API returned ${response.status}`)
  }
  return response.json() as Promise<T>
}

async function requestForm<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken()
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  })
  if (response.status === 401) {
    clearToken()
    throw new UnauthorizedError('Nicht angemeldet')
  }
  if (!response.ok) {
    const message = await response.json().catch(() => `API returned ${response.status}`)
    throw new Error(typeof message === 'string' ? message : `API returned ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const api = {
  login: async (username: string, password: string) => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    if (!response.ok) {
      throw new Error(response.status === 401 ? 'Benutzername oder Passwort falsch' : `API returned ${response.status}`)
    }
    const { token } = (await response.json()) as { token: string }
    setToken(token)
  },
  logout: clearToken,
  listEvents: () => request<EventSummary[]>('/api/events'),
  getEvent: (id: string) => request<EventDetail>(`/api/events/${id}`),
  createEvent: (body: { name: string; customerName: string; eventDate: string; location: string; plannedBoardCount?: number }) =>
    request<EventSummary>('/api/events', { method: 'POST', body: JSON.stringify(body) }),
  updateEvent: (eventId: string, body: { name: string; customerName: string; eventDate: string; location: string }) =>
    request<EventSummary>(`/api/events/${eventId}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteEvent: (eventId: string) =>
    fetch(`${API_BASE_URL}/api/events/${eventId}`, {
      method: 'DELETE',
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }),
  addPlayer: (eventId: string, body: { firstName: string; lastName: string; nickname?: string }) =>
    request<Player>(`/api/events/${eventId}/players`, { method: 'POST', body: JSON.stringify(body) }),
  updatePlayer: (eventId: string, playerId: string, body: { firstName: string; lastName: string; nickname?: string }) =>
    request<Player>(`/api/events/${eventId}/players/${playerId}`, { method: 'PUT', body: JSON.stringify(body) }),
  deletePlayer: (eventId: string, playerId: string) =>
    fetch(`${API_BASE_URL}/api/events/${eventId}/players/${playerId}`, {
      method: 'DELETE',
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }),
  addBoard: (eventId: string, body: { number: number; locationDescription?: string; name?: string }) =>
    request<Board>(`/api/events/${eventId}/boards`, { method: 'POST', body: JSON.stringify(body) }),
  renameBoard: (eventId: string, boardId: string, name: string | null) =>
    request<Board>(`/api/events/${eventId}/boards/${boardId}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  shuffleBoardNames: (eventId: string) =>
    request<Board[]>(`/api/events/${eventId}/boards/shuffle-names`, { method: 'POST' }),
  deleteBoard: (eventId: string, boardId: string) =>
    fetch(`${API_BASE_URL}/api/events/${eventId}/boards/${boardId}`, {
      method: 'DELETE',
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }),
  setPlannedBoardCount: (eventId: string, plannedBoardCount: number | null) =>
    request<EventSummary>(`/api/events/${eventId}/planned-board-count`, {
      method: 'PUT',
      body: JSON.stringify({ plannedBoardCount }),
    }),
  setBranding: (eventId: string, primaryColor: string | null, secondaryColor: string | null) =>
    request<EventSummary>(`/api/events/${eventId}/branding`, {
      method: 'PUT',
      body: JSON.stringify({ primaryColor, secondaryColor }),
    }),
  uploadLogo: (eventId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return requestForm<EventSummary>(`/api/events/${eventId}/logo`, formData)
  },
  importPlayersCsv: (eventId: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return requestForm<{ created: number; skipped: number; players: Player[] }>(`/api/events/${eventId}/players/import`, formData)
  },
  exportPlayersCsv: async (eventId: string, eventName: string) => {
    const token = getToken()
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/players/export`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
    if (!response.ok) throw new Error(`API returned ${response.status}`)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `spieler-${eventName}.csv`
    a.click()
    URL.revokeObjectURL(url)
  },
  logoUrl: (eventId: string, version?: string | null) =>
    version ? `${API_BASE_URL}/api/events/${eventId}/logo?v=${encodeURIComponent(version)}` : `${API_BASE_URL}/api/events/${eventId}/logo`,
  getCurrentEventId: async () => {
    const response = await fetch(`${API_BASE_URL}/api/events/current`)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`API returned ${response.status}`)
    return ((await response.json()) as { id: string }).id
  },
  getBranding: async (eventId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/branding`)
    if (!response.ok) throw new Error(`API returned ${response.status}`)
    return (await response.json()) as EventBranding
  },
  setEventStatus: (eventId: string, status: string) =>
    request<EventSummary>(`/api/events/${eventId}/status`, { method: 'PUT', body: JSON.stringify({ status }) }),
  createTournament: (
    eventId: string,
    body: {
      qualificationMode: 'Highscore' | 'X01'
      qualificationStartScore?: number
      qualificationRounds?: number
      finalMode: 'Highscore' | 'X01'
      finalStartScore?: number
      finalRounds?: number
      qualificationBestOf?: number
    },
  ) => request<Tournament>(`/api/events/${eventId}/tournaments`, { method: 'POST', body: JSON.stringify(body) }),
  setTournamentStatus: (eventId: string, tournamentId: string, status: string) =>
    request<Tournament>(`/api/events/${eventId}/tournaments/${tournamentId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    }),
  deleteTournament: (eventId: string, tournamentId: string) =>
    fetch(`${API_BASE_URL}/api/events/${eventId}/tournaments/${tournamentId}`, {
      method: 'DELETE',
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }),
  setQualificationBestOf: (eventId: string, tournamentId: string, qualificationBestOf: number | null) =>
    request<Tournament>(`/api/events/${eventId}/tournaments/${tournamentId}/qualification-best-of`, {
      method: 'PUT',
      body: JSON.stringify({ qualificationBestOf }),
    }),
  setKnockoutPhaseOverride: (eventId: string, tournamentId: string, knockoutPhaseOverride: string | null) =>
    request<Tournament>(`/api/events/${eventId}/tournaments/${tournamentId}/knockout-phase-override`, {
      method: 'PUT',
      body: JSON.stringify({ knockoutPhaseOverride }),
    }),
  getTournamentOverview: (eventId: string, tournamentId: string) =>
    request<TournamentOverview>(`/api/events/${eventId}/tournaments/${tournamentId}/overview`),
  updateQualificationSettings: (
    eventId: string,
    tournamentId: string,
    body: { mode: 'Highscore' | 'X01'; startScore?: number; rounds?: number },
  ) =>
    request<Tournament>(`/api/events/${eventId}/tournaments/${tournamentId}/qualification-settings`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  updateFinalSettings: (
    eventId: string,
    tournamentId: string,
    body: { mode: 'Highscore' | 'X01'; startScore?: number; rounds?: number },
  ) =>
    request<Tournament>(`/api/events/${eventId}/tournaments/${tournamentId}/final-settings`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  getLeaderboard: (eventId: string, tournamentId: string, bestOf?: number) =>
    request<LeaderboardEntry[]>(
      `/api/events/${eventId}/tournaments/${tournamentId}/leaderboard${bestOf ? `?bestOf=${bestOf}` : ''}`,
    ),
  getLeinwandSettings: async (eventId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/leinwand-settings`)
    if (!response.ok) throw new Error(`API returned ${response.status}`)
    return (await response.json()) as LeinwandSettings
  },
  updateLeinwandSettings: (eventId: string, settings: LeinwandSettings) =>
    request<LeinwandSettings>(`/api/events/${eventId}/leinwand-settings`, {
      method: 'PUT',
      body: JSON.stringify(settings),
    }),
  getLeinwandLeaderboard: async (eventId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/leinwand-leaderboard`)
    // No Running qualification tournament reads the same as "nothing to
    // rank yet" ([]), not as "still loading" (null) - returning null here
    // left LeaderboardScene stuck on "Lädt…" forever instead of showing
    // "Keine laufende Vorrunde.", since its initial state is also null.
    if (response.status === 404) return []
    if (!response.ok) throw new Error(`API returned ${response.status}`)
    return (await response.json()) as LeaderboardEntry[]
  },
  getTeamLeaderboard: (eventId: string, tournamentId: string, bestOf?: number) =>
    request<TeamLeaderboardEntry[]>(
      `/api/events/${eventId}/tournaments/${tournamentId}/team-leaderboard${bestOf ? `?bestOf=${bestOf}` : ''}`,
    ),
  getTeams: (eventId: string) => request<Team[]>(`/api/events/${eventId}/teams`),
  createTeam: (eventId: string, name: string, playerIds: string[]) =>
    request<Team>(`/api/events/${eventId}/teams`, { method: 'POST', body: JSON.stringify({ name, playerIds }) }),
  renameTeam: (eventId: string, teamId: string, name: string) =>
    request<Team>(`/api/events/${eventId}/teams/${teamId}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  addTeamPlayer: (eventId: string, teamId: string, playerId: string) =>
    request<Team>(`/api/events/${eventId}/teams/${teamId}/players`, { method: 'POST', body: JSON.stringify({ playerId }) }),
  removeTeamPlayer: (eventId: string, teamId: string, playerId: string) =>
    request<Team>(`/api/events/${eventId}/teams/${teamId}/players/${playerId}`, { method: 'DELETE' }),
  deleteTeam: (eventId: string, teamId: string) =>
    fetch(`${API_BASE_URL}/api/events/${eventId}/teams/${teamId}`, {
      method: 'DELETE',
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }),
  createGame: (tournamentId: string, boardId: string, playerIds: string[]) =>
    request<Game>(`/api/tournaments/${tournamentId}/games`, { method: 'POST', body: JSON.stringify({ boardId, playerIds }) }),
  getGame: (tournamentId: string, gameId: string) => request<Game>(`/api/tournaments/${tournamentId}/games/${gameId}`),
  deleteGame: (tournamentId: string, gameId: string) =>
    fetch(`${API_BASE_URL}/api/tournaments/${tournamentId}/games/${gameId}`, {
      method: 'DELETE',
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }),
  changeGameBoard: (tournamentId: string, gameId: string, boardId: string) =>
    request<Game>(`/api/tournaments/${tournamentId}/games/${gameId}/board`, {
      method: 'PUT',
      body: JSON.stringify({ boardId }),
    }),
  recordTurn: (tournamentId: string, gameId: string, playerId: string, score: number) =>
    request<Game>(`/api/tournaments/${tournamentId}/games/${gameId}/turns`, {
      method: 'POST',
      body: JSON.stringify({ playerId, score }),
    }),
  undoTurn: (tournamentId: string, gameId: string, playerId: string) =>
    request<Game>(`/api/tournaments/${tournamentId}/games/${gameId}/turns/undo`, {
      method: 'POST',
      body: JSON.stringify({ playerId }),
    }),
  undoPlayerTurns: (tournamentId: string, gameId: string, playerId: string) =>
    request<Game>(`/api/tournaments/${tournamentId}/games/${gameId}/turns/undo-player`, {
      method: 'POST',
      body: JSON.stringify({ playerId }),
    }),
  resetGameTurns: (tournamentId: string, gameId: string) =>
    request<Game>(`/api/tournaments/${tournamentId}/games/${gameId}/turns/reset`, { method: 'POST' }),
  getKnockoutMatches: (eventId: string, tournamentId: string) =>
    request<KnockoutMatch[]>(`/api/events/${eventId}/tournaments/${tournamentId}/knockout`),
  startKnockout: (
    eventId: string,
    tournamentId: string,
    body: { participantCount: number; bestOfLegs: number; qualificationBestOf?: number; seededPlayerIds?: string[] },
  ) =>
    request<KnockoutMatch[]>(`/api/events/${eventId}/tournaments/${tournamentId}/knockout/start`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  generateNextRound: (eventId: string, tournamentId: string, bestOfLegs?: number) =>
    request<KnockoutMatch[]>(`/api/events/${eventId}/tournaments/${tournamentId}/knockout/next-round`, {
      method: 'POST',
      body: JSON.stringify({ bestOfLegs }),
    }),
  createKnockoutLeg: (eventId: string, tournamentId: string, matchId: string, boardId: string) =>
    request<Game>(`/api/events/${eventId}/tournaments/${tournamentId}/knockout/${matchId}/games`, {
      method: 'POST',
      body: JSON.stringify({ boardId }),
    }),
  getAvailableKnockoutSubstitutes: (eventId: string, tournamentId: string) =>
    request<AvailableSubstitute[]>(`/api/events/${eventId}/tournaments/${tournamentId}/knockout/available-substitutes`),
  substituteKnockoutPlayer: (eventId: string, tournamentId: string, matchId: string, outgoingPlayerId: string, incomingPlayerId: string) =>
    request<KnockoutMatch>(`/api/events/${eventId}/tournaments/${tournamentId}/knockout/${matchId}/substitute`, {
      method: 'POST',
      body: JSON.stringify({ outgoingPlayerId, incomingPlayerId }),
    }),
  getGroupRounds: (eventId: string, tournamentId: string) =>
    request<GroupRound[]>(`/api/events/${eventId}/tournaments/${tournamentId}/groups`),
  startGroupRound: (
    eventId: string,
    tournamentId: string,
    body: { participantCount: number; groupCount: number; advanceCount: number; qualificationBestOf?: number },
  ) =>
    request<GroupRound[]>(`/api/events/${eventId}/tournaments/${tournamentId}/groups/round`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  createGroupGame: (eventId: string, tournamentId: string, groupId: string, boardId: string) =>
    request<Game>(`/api/events/${eventId}/tournaments/${tournamentId}/groups/${groupId}/games`, {
      method: 'POST',
      body: JSON.stringify({ boardId }),
    }),
  resolveGroupTie: (eventId: string, tournamentId: string, groupId: string, advancingPlayerIds: string[]) =>
    request<GroupRound>(`/api/events/${eventId}/tournaments/${tournamentId}/groups/${groupId}/resolve-tie`, {
      method: 'POST',
      body: JSON.stringify({ advancingPlayerIds }),
    }),
  getAvailableGroupSubstitutes: (eventId: string, tournamentId: string) =>
    request<AvailableSubstitute[]>(`/api/events/${eventId}/tournaments/${tournamentId}/groups/available-substitutes`),
  substituteGroupParticipant: (eventId: string, tournamentId: string, groupId: string, outgoingPlayerId: string, incomingPlayerId: string) =>
    request<GroupRound>(`/api/events/${eventId}/tournaments/${tournamentId}/groups/${groupId}/substitute`, {
      method: 'POST',
      body: JSON.stringify({ outgoingPlayerId, incomingPlayerId }),
    }),
  getEventKnockout: async (eventId: string, tournamentId?: string) => {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/knockout${tournamentId ? `?tournamentId=${tournamentId}` : ''}`)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`API returned ${response.status}`)
    return (await response.json()) as EventKnockout
  },
  getPairingBoards: async (eventId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/pairing/boards`)
    if (!response.ok) throw new Error(`API returned ${response.status}`)
    return (await response.json()) as PairingBoard[]
  },
  getPairingRoster: async (eventId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/pairing/roster`)
    if (!response.ok) throw new Error(`API returned ${response.status}`)
    return (await response.json()) as PairingRoster
  },
  getCurrentGameForBoard: async (boardId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/boards/${boardId}/current-game`)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`API returned ${response.status}`)
    return (await response.json()) as Game
  },
  getBusyPlayers: (eventId: string) => request<string[]>(`/api/events/${eventId}/players/busy`),
  listDevices: (eventId: string) => request<DeviceStatus[]>(`/api/events/${eventId}/devices`),
  getUnassignedDevices: (eventId: string) => request<UnassignedDevice[]>(`/api/events/${eventId}/devices/unassigned`),
  announceUnassignedDevice: (eventId: string, clientDeviceId: string, type: DeviceType, shortCode: string) =>
    fetch(`${API_BASE_URL}/api/events/${eventId}/devices/announce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientDeviceId, type, shortCode }),
    }),
  assignDevice: (eventId: string, clientDeviceId: string, boardId: string, type: DeviceType) =>
    request<DevicePairing>(`/api/events/${eventId}/devices/${clientDeviceId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ boardId, type }),
    }),
  removeDevice: (eventId: string, clientDeviceId: string) =>
    fetch(`${API_BASE_URL}/api/events/${eventId}/devices/${clientDeviceId}`, {
      method: 'DELETE',
      headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
    }),
  getDevicePairing: async (eventId: string, clientDeviceId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/devices/${clientDeviceId}`)
    if (response.status === 404) return null
    if (!response.ok) throw new Error(`API returned ${response.status}`)
    return (await response.json()) as DevicePairing
  },
  pairDevice: async (
    eventId: string,
    clientDeviceId: string,
    type: DeviceType,
    boardId: string,
    force = false,
    validForMinutes?: number,
    pin?: string,
  ) => {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/devices/pair`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientDeviceId, type, boardId, force, validForMinutes, pin }),
    })
    if (response.status === 409) {
      const message = await response.json().catch(() => 'Board is already paired.')
      throw new DeviceConflictError(typeof message === 'string' ? message : 'Board is already paired.')
    }
    if (response.status === 401) {
      const message = await response.json().catch(() => 'Falscher PIN.')
      throw new WrongPinError(typeof message === 'string' ? message : 'Falscher PIN.')
    }
    if (!response.ok) throw new Error(`API returned ${response.status}`)
    return (await response.json()) as DevicePairing
  },
  submitTabletTurn: async (eventId: string, clientDeviceId: string, playerId: string, score: number) => {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/devices/${clientDeviceId}/turns`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, score }),
    })
    if (!response.ok) {
      const message = await response.json().catch(() => `API returned ${response.status}`)
      throw new Error(typeof message === 'string' ? message : `API returned ${response.status}`)
    }
    return (await response.json()) as Game
  },
  undoTabletTurn: async (eventId: string, clientDeviceId: string, playerId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/devices/${clientDeviceId}/turns/undo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId }),
    })
    if (!response.ok) {
      const message = await response.json().catch(() => `API returned ${response.status}`)
      throw new Error(typeof message === 'string' ? message : `API returned ${response.status}`)
    }
    return (await response.json()) as Game
  },
  editTabletTurn: async (eventId: string, clientDeviceId: string, playerId: string, throwIndex: number, score: number) => {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/devices/${clientDeviceId}/turns/edit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, throwIndex, score }),
    })
    if (!response.ok) {
      const message = await response.json().catch(() => `API returned ${response.status}`)
      throw new Error(typeof message === 'string' ? message : `API returned ${response.status}`)
    }
    return (await response.json()) as Game
  },
  cancelTabletGame: async (eventId: string, clientDeviceId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/devices/${clientDeviceId}/games/cancel`, {
      method: 'POST',
    })
    if (!response.ok) {
      const message = await response.json().catch(() => `API returned ${response.status}`)
      throw new Error(typeof message === 'string' ? message : `API returned ${response.status}`)
    }
  },
  resolveGameTie: async (eventId: string, clientDeviceId: string, winnerId: string) => {
    const response = await fetch(`${API_BASE_URL}/api/events/${eventId}/devices/${clientDeviceId}/resolve-tie`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ winnerId }),
    })
    if (!response.ok) {
      const message = await response.json().catch(() => `API returned ${response.status}`)
      throw new Error(typeof message === 'string' ? message : `API returned ${response.status}`)
    }
    return (await response.json()) as Game
  },
  triggerUpdate: () => request<UpdateStatus>('/api/admin/update', { method: 'POST' }),
  getUpdateStatus: () => request<UpdateStatus>('/api/admin/update/status'),
}

export class DeviceConflictError extends Error {}
export class WrongPinError extends Error {}

export type UpdateState = 'idle' | 'running' | 'success' | 'error'

export interface UpdateStatus {
  state: UpdateState
  message: string | null
  at: string | null
}
