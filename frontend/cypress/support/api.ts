// Thin wrapper around the same REST API the app itself uses, so specs can
// set up fixture data (events, players, tournaments, KO brackets, turns)
// in one or two calls instead of re-deriving it through the UI.
//
// Each function returns a Cypress.Chainable, composed via `.then()` -
// returning a chainable from inside a `.then()` callback flattens it back
// onto the main command queue, which is what lets these compose without
// nesting indefinitely (see podium.cy.ts for the deepest example).

export const E2E_USERNAME = 'e2e'
export const E2E_PASSWORD = 'CypressE2E!23'

function auth(token: string) {
  return { Authorization: `Bearer ${token}` }
}

export function login(): Cypress.Chainable<string> {
  return cy.request('POST', '/api/auth/login', { username: E2E_USERNAME, password: E2E_PASSWORD }).its('body.token')
}

export function createEvent(
  token: string,
  overrides: Partial<{ name: string; customerName: string; eventDate: string; location: string; plannedBoardCount: number }> = {},
): Cypress.Chainable<any> {
  return cy
    .request({
      method: 'POST',
      url: '/api/events',
      headers: auth(token),
      body: {
        name: 'E2E Event',
        customerName: 'E2E',
        eventDate: '2026-08-30T18:00',
        location: 'Testhalle',
        plannedBoardCount: 1,
        ...overrides,
      },
    })
    .its('body')
}

export function addPlayer(token: string, eventId: string, firstName: string, lastName: string): Cypress.Chainable<any> {
  return cy.request({ method: 'POST', url: `/api/events/${eventId}/players`, headers: auth(token), body: { firstName, lastName } }).its('body')
}

export function createTournament(
  token: string,
  eventId: string,
  overrides: Partial<{ qualificationMode: string; qualificationRounds: number; finalMode: string; finalRounds: number; qualificationBestOf: number }> = {},
): Cypress.Chainable<any> {
  return cy
    .request({
      method: 'POST',
      url: `/api/events/${eventId}/tournaments`,
      headers: auth(token),
      body: { qualificationMode: 'Highscore', qualificationRounds: 8, finalMode: 'Highscore', finalRounds: 3, ...overrides },
    })
    .its('body')
}

export function setTournamentStatus(token: string, eventId: string, tournamentId: string, status: string): Cypress.Chainable<any> {
  return cy.request({ method: 'PUT', url: `/api/events/${eventId}/tournaments/${tournamentId}/status`, headers: auth(token), body: { status } })
}

export function startKnockout(
  token: string,
  eventId: string,
  tournamentId: string,
  participantCount: number,
  seededPlayerIds: string[],
): Cypress.Chainable<any[]> {
  return cy
    .request({
      method: 'POST',
      url: `/api/events/${eventId}/tournaments/${tournamentId}/knockout/start`,
      headers: auth(token),
      body: { participantCount, bestOfLegs: 1, seededPlayerIds },
    })
    .its('body')
}

export function nextKnockoutRound(token: string, eventId: string, tournamentId: string): Cypress.Chainable<any> {
  return cy.request({ method: 'POST', url: `/api/events/${eventId}/tournaments/${tournamentId}/knockout/next-round`, headers: auth(token), body: {} })
}

export function getKnockoutMatches(token: string, eventId: string, tournamentId: string): Cypress.Chainable<any[]> {
  return cy.request({ method: 'GET', url: `/api/events/${eventId}/tournaments/${tournamentId}/knockout`, headers: auth(token) }).its('body')
}

export function getAvailableKnockoutSubstitutes(token: string, eventId: string, tournamentId: string): Cypress.Chainable<any[]> {
  return cy.request({ method: 'GET', url: `/api/events/${eventId}/tournaments/${tournamentId}/knockout/available-substitutes`, headers: auth(token) }).its('body')
}

export function substituteKnockoutPlayer(
  token: string,
  eventId: string,
  tournamentId: string,
  matchId: string,
  outgoingPlayerId: string,
  incomingPlayerId: string,
): Cypress.Chainable<any> {
  return cy
    .request({
      method: 'POST',
      url: `/api/events/${eventId}/tournaments/${tournamentId}/knockout/${matchId}/substitute`,
      headers: auth(token),
      body: { outgoingPlayerId, incomingPlayerId },
    })
    .its('body')
}

export function startGroupRound(
  token: string,
  eventId: string,
  tournamentId: string,
  participantCount: number,
  groupCount: number,
  advanceCount: number,
  qualificationBestOf?: number,
): Cypress.Chainable<any[]> {
  return cy
    .request({
      method: 'POST',
      url: `/api/events/${eventId}/tournaments/${tournamentId}/groups/round`,
      headers: auth(token),
      body: { participantCount, groupCount, advanceCount, qualificationBestOf },
    })
    .its('body')
}

export function getGroupRounds(token: string, eventId: string, tournamentId: string): Cypress.Chainable<any[]> {
  return cy.request({ method: 'GET', url: `/api/events/${eventId}/tournaments/${tournamentId}/groups`, headers: auth(token) }).its('body')
}

export function getAvailableGroupSubstitutes(token: string, eventId: string, tournamentId: string): Cypress.Chainable<any[]> {
  return cy.request({ method: 'GET', url: `/api/events/${eventId}/tournaments/${tournamentId}/groups/available-substitutes`, headers: auth(token) }).its('body')
}

export function substituteGroupParticipant(
  token: string,
  eventId: string,
  tournamentId: string,
  groupId: string,
  outgoingPlayerId: string,
  incomingPlayerId: string,
): Cypress.Chainable<any> {
  return cy
    .request({
      method: 'POST',
      url: `/api/events/${eventId}/tournaments/${tournamentId}/groups/${groupId}/substitute`,
      headers: auth(token),
      body: { outgoingPlayerId, incomingPlayerId },
    })
    .its('body')
}

export function createKnockoutGame(token: string, eventId: string, tournamentId: string, matchId: string, boardId: string): Cypress.Chainable<any> {
  return cy
    .request({
      method: 'POST',
      url: `/api/events/${eventId}/tournaments/${tournamentId}/knockout/${matchId}/games`,
      headers: auth(token),
      body: { boardId },
    })
    .its('body')
}

export function createGame(token: string, tournamentId: string, boardId: string, playerIds: string[]): Cypress.Chainable<any> {
  return cy.request({ method: 'POST', url: `/api/tournaments/${tournamentId}/games`, headers: auth(token), body: { boardId, playerIds } }).its('body')
}

export function recordTurn(token: string, tournamentId: string, gameId: string, playerId: string, score: number): Cypress.Chainable<any> {
  return cy
    .request({ method: 'POST', url: `/api/tournaments/${tournamentId}/games/${gameId}/turns`, headers: auth(token), body: { playerId, score } })
    .its('body')
}

/** Plays `rounds` full rounds of a leg with `winnerId` scoring 60 and `loserId` scoring 22 each round - always a clean, non-tied decision. */
export function playDecisiveLeg(
  token: string,
  tournamentId: string,
  gameId: string,
  winnerId: string,
  loserId: string,
  rounds = 3,
): Cypress.Chainable<any> {
  let chain = cy.wrap(null, { log: false })
  for (let i = 0; i < rounds; i++) {
    chain = chain.then(() => recordTurn(token, tournamentId, gameId, winnerId, 60))
    chain = chain.then(() => recordTurn(token, tournamentId, gameId, loserId, 22))
  }
  return chain
}

/** Plays `rounds` full rounds with both players scoring identically - guarantees a tie. */
export function playTiedLeg(token: string, tournamentId: string, gameId: string, p1: string, p2: string, rounds = 3): Cypress.Chainable<any> {
  let chain = cy.wrap(null, { log: false })
  for (let i = 0; i < rounds; i++) {
    chain = chain.then(() => recordTurn(token, tournamentId, gameId, p1, 45))
    chain = chain.then(() => recordTurn(token, tournamentId, gameId, p2, 45))
  }
  return chain
}

/** Plays a full match between the match's two players and returns once the leg (and, via ApplyKnockoutLegResultAsync, the match) is decided. */
export function playMatchDecisively(
  token: string,
  eventId: string,
  tournamentId: string,
  match: { id: string; player1Id: string; player2Id: string },
  boardId: string,
): Cypress.Chainable<any> {
  return createKnockoutGame(token, eventId, tournamentId, match.id, boardId).then((game) =>
    playDecisiveLeg(token, tournamentId, game.id, match.player1Id, match.player2Id),
  )
}

/** Plays each player's given per-round scores, alternating turns (player 1 goes first each round) - for leaderboard fixtures where the exact totals matter, unlike playDecisiveLeg/playTiedLeg's fixed scores. */
export function playRounds(
  token: string,
  tournamentId: string,
  gameId: string,
  p1: string,
  p1Scores: number[],
  p2: string,
  p2Scores: number[],
): Cypress.Chainable<any> {
  let chain = cy.wrap(null, { log: false })
  for (let i = 0; i < p1Scores.length; i++) {
    chain = chain.then(() => recordTurn(token, tournamentId, gameId, p1, p1Scores[i]))
    chain = chain.then(() => recordTurn(token, tournamentId, gameId, p2, p2Scores[i]))
  }
  return chain
}

export function getLeaderboard(token: string, eventId: string, tournamentId: string): Cypress.Chainable<any[]> {
  return cy.request({ method: 'GET', url: `/api/events/${eventId}/tournaments/${tournamentId}/leaderboard`, headers: auth(token) }).its('body')
}

export function setLeinwandSettings(
  token: string,
  eventId: string,
  settings: { activeScenes: string[]; intervalSeconds: number; pinnedScene: string | null },
): Cypress.Chainable<any> {
  return cy.request({ method: 'PUT', url: `/api/events/${eventId}/leinwand-settings`, headers: auth(token), body: settings })
}
