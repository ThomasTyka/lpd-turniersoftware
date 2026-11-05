// Generic helpers for simulating a full tournament end to end, without
// hardcoding who ends up playing whom - the bracket's own seeding algorithm
// decides pairings, so specs assert against whatever the API actually
// reports at each step rather than a name baked in ahead of time.

import { playMatchDecisively, getKnockoutMatches } from './api'

/** Plays every match in the given list one after another, sequentially - player1 always wins. */
export function playAllDecisively(token: string, eventId: string, tournamentId: string, matches: any[], boardId: string): Cypress.Chainable<any> {
  let chain = cy.wrap(null, { log: false })
  for (const match of matches) {
    chain = chain.then(() => playMatchDecisively(token, eventId, tournamentId, match, boardId))
  }
  return chain
}

/** The final match (max round among non-third-place matches) and the third-place match, from a knockout state. */
export function findFinalAndThird(matches: any[]): { final: any; thirdPlace: any } {
  const bracketMatches = matches.filter((m) => !m.isThirdPlaceMatch)
  const maxRound = Math.max(...bracketMatches.map((m) => m.round))
  return {
    final: matches.find((m) => m.round === maxRound && !m.isThirdPlaceMatch),
    thirdPlace: matches.find((m) => m.isThirdPlaceMatch),
  }
}
