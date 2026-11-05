import { login, createEvent, addPlayer, createTournament, startKnockout, nextKnockoutRound, getKnockoutMatches, playMatchDecisively, setTournamentStatus } from '../support/api'

/** Plays every match in the given list one after another, sequentially. */
function playAllDecisively(token: string, eventId: string, tournamentId: string, matches: any[], boardId: string): Cypress.Chainable<any> {
  let chain = cy.wrap(null, { log: false })
  for (const match of matches) {
    chain = chain.then(() => playMatchDecisively(token, eventId, tournamentId, match, boardId))
  }
  return chain
}

describe('Siegerehrung', () => {
  it('shows the correct 1./2./3. Platz once an 8-player KO bracket finishes', () => {
    let token: string
    let eventId: string
    let boardId: string
    let tournamentId: string
    const playerIds: string[] = []
    const names = [
      ['Anna', 'Erste'],
      ['Ben', 'Zweite'],
      ['Cara', 'Dritte'],
      ['Dave', 'Vierte'],
      ['Ella', 'Fuenfte'],
      ['Finn', 'Sechste'],
      ['Gina', 'Siebte'],
      ['Hugo', 'Achte'],
    ] as const

    login()
      .then((t) => {
        token = t
        return createEvent(token, { name: 'Podium E2E', plannedBoardCount: 1 })
      })
      .then((event) => {
        eventId = event.id
        boardId = event.boards[0].id
        return addPlayer(token, eventId, names[0][0], names[0][1])
      })
      .then((p) => {
        playerIds.push(p.id)
        return addPlayer(token, eventId, names[1][0], names[1][1])
      })
      .then((p) => {
        playerIds.push(p.id)
        return addPlayer(token, eventId, names[2][0], names[2][1])
      })
      .then((p) => {
        playerIds.push(p.id)
        return addPlayer(token, eventId, names[3][0], names[3][1])
      })
      .then((p) => {
        playerIds.push(p.id)
        return addPlayer(token, eventId, names[4][0], names[4][1])
      })
      .then((p) => {
        playerIds.push(p.id)
        return addPlayer(token, eventId, names[5][0], names[5][1])
      })
      .then((p) => {
        playerIds.push(p.id)
        return addPlayer(token, eventId, names[6][0], names[6][1])
      })
      .then((p) => {
        playerIds.push(p.id)
        return addPlayer(token, eventId, names[7][0], names[7][1])
      })
      .then((p) => {
        playerIds.push(p.id)
        return createTournament(token, eventId)
      })
      .then((tournament) => {
        tournamentId = tournament.id
        return startKnockout(token, eventId, tournamentId, 8, playerIds)
      })
      // Viertelfinale: 4 matches.
      .then((quarterfinals) => playAllDecisively(token, eventId, tournamentId, quarterfinals, boardId))
      .then(() => nextKnockoutRound(token, eventId, tournamentId))
      .then(() => getKnockoutMatches(token, eventId, tournamentId))
      // Halbfinale: 2 matches.
      .then((matches) => playAllDecisively(token, eventId, tournamentId, matches.filter((m: any) => m.round === 2), boardId))
      .then(() => nextKnockoutRound(token, eventId, tournamentId))
      .then(() => getKnockoutMatches(token, eventId, tournamentId))
      .then((matches) => {
        const maxRound = Math.max(...matches.filter((m: any) => !m.isThirdPlaceMatch).map((m: any) => m.round))
        const final = matches.find((m: any) => m.round === maxRound && !m.isThirdPlaceMatch)
        const thirdPlace = matches.find((m: any) => m.isThirdPlaceMatch)
        return playMatchDecisively(token, eventId, tournamentId, final, boardId)
          .then(() => playMatchDecisively(token, eventId, tournamentId, thirdPlace, boardId))
          .then(() => getKnockoutMatches(token, eventId, tournamentId))
          .then((finalState) => {
            const finalMatch = finalState.find((m: any) => m.round === maxRound && !m.isThirdPlaceMatch)
            const thirdMatch = finalState.find((m: any) => m.isThirdPlaceMatch)
            const firstName = finalMatch.winnerName
            const secondName = finalMatch.winnerId === finalMatch.player1Id ? finalMatch.player2Name : finalMatch.player1Name
            const thirdName = thirdMatch.winnerName

            return setTournamentStatus(token, eventId, tournamentId, 'Finished').then(() => {
              cy.visit(`/?siegerehrung=${eventId}&tournament=${tournamentId}`)
              cy.get('[data-testid="podium-1"]').should('contain.text', firstName)
              cy.get('[data-testid="podium-2"]').should('contain.text', secondName)
              cy.get('[data-testid="podium-3"]').should('contain.text', thirdName)
            })
          })
      })
  })

  it('shows a placeholder before the tournament is decided', () => {
    login()
      .then((token) => createEvent(token, { name: 'Podium Pending E2E', plannedBoardCount: 1 }))
      .then((event) => {
        cy.visit(`/?siegerehrung=${event.id}`)
        cy.contains('Turnier noch nicht abgeschlossen.').should('be.visible')
      })
  })
})
