import { login, createEvent, addPlayer, createTournament, createGame } from '../support/api'
import { pairTablet, enterScore } from '../support/tablet'

// The Tablet's own confetti overlay was removed - a 100+ throw only pops
// confetti on the Board-Monitor now (see board-monitor.cy.ts), not on the
// scorer's device. Only the trophy overlay (game-finish celebration) still
// applies to the Tablet.
describe('Tablet trophy', () => {
  it("finishing a game shows the trophy overlay with the winner's name", () => {
    let token: string
    let eventId: string
    let boardId: string

    login()
      .then((t) => {
        token = t
        return createEvent(token, { name: 'Trophy E2E', plannedBoardCount: 1 })
      })
      .then((event) => {
        eventId = event.id
        boardId = event.boards[0].id
        return addPlayer(token, eventId, 'Willi', 'Winner')
      })
      .then((p1) => addPlayer(token, eventId, 'Larry', 'Loser').then((p2) => [p1, p2]))
      .then(([p1, p2]) => createTournament(token, eventId, { qualificationRounds: 1 }).then((t) => createGame(token, t.id, boardId, [p1.id, p2.id])))
      .then(() => {
        pairTablet(eventId, boardId)
        // Round 1/1 for Willi (current turn first), then Larry finishes the game.
        enterScore(60)
        enterScore(20)

        cy.get('[data-testid="trophy-overlay"]').should('be.visible').and('contain.text', 'Willi Winner')
      })
  })
})
