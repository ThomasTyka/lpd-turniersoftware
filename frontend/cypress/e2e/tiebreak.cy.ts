import { login, createEvent, addPlayer, createTournament, startKnockout, createKnockoutGame, playTiedLeg, getKnockoutMatches } from '../support/api'
import { pairTablet } from '../support/tablet'

describe('Tiebreak resolution', () => {
  it('a tied knockout leg blocks the match until manually resolved on the Tablet', () => {
    let token: string
    let eventId: string
    let boardId: string
    let tournamentId: string
    let match: any

    login()
      .then((t) => {
        token = t
        return createEvent(token, { name: 'Tiebreak E2E', plannedBoardCount: 1 })
      })
      .then((event) => {
        eventId = event.id
        boardId = event.boards[0].id
        return addPlayer(token, eventId, 'Uwe', 'Unentschieden')
      })
      .then((p1) => addPlayer(token, eventId, 'Vera', 'Gleichstand').then((p2) => [p1, p2]))
      .then(([p1, p2]) => createTournament(token, eventId).then((t) => ({ tournament: t, p1, p2 })))
      .then(({ tournament, p1, p2 }) => {
        tournamentId = tournament.id
        return startKnockout(token, eventId, tournamentId, 2, [p1.id, p2.id])
      })
      .then((matches) => {
        match = matches[0]
        return createKnockoutGame(token, eventId, tournamentId, match.id, boardId)
      })
      .then((game) => playTiedLeg(token, tournamentId, game.id, match.player1Id, match.player2Id))
      .then(() => getKnockoutMatches(token, eventId, tournamentId))
      .then(([beforeResolve]) => {
        expect(beforeResolve.winnerId).to.be.null

        pairTablet(eventId, boardId)
        cy.contains('Gleichstand!').should('be.visible')
        cy.contains('button', 'Uwe Unentschieden').should('be.visible')
        cy.contains('button', 'Vera Gleichstand').should('be.visible')
        cy.contains('button', 'Uwe Unentschieden').click()

        cy.contains('Gleichstand!').should('not.exist')
        cy.contains('Spiel beendet.').should('be.visible')

        const uweId = match.player1Name === 'Uwe Unentschieden' ? match.player1Id : match.player2Id
        cy.then(() => getKnockoutMatches(token, eventId, tournamentId)).then(([afterResolve]) => {
          expect(afterResolve.winnerId).to.equal(uweId)
          expect(afterResolve.player1Legs + afterResolve.player2Legs).to.equal(1)
        })
      })
  })
})
