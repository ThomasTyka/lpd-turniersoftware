import { login, createEvent, addPlayer, createTournament, createGame, recordTurn } from '../support/api'

describe('Greenscreen view', () => {
  it('shows a solid chroma-key background and stays blank with no game', () => {
    login()
      .then((token) => createEvent(token, { name: 'Greenscreen Idle E2E', plannedBoardCount: 1 }))
      .then((event) => {
        cy.visit(`/?greenscreen=${event.boards[0].id}`)
        cy.get('main').should('have.css', 'background-color', 'rgb(3, 247, 3)')
        cy.get('[data-testid="greenscreen-player"]').should('not.exist')
      })
  })

  it('shows the current player and updates live as turns are recorded', () => {
    let token: string
    let eventId: string
    let boardId: string
    let tournamentId: string
    let gameId: string
    let p1Id: string

    login()
      .then((t) => {
        token = t
        return createEvent(token, { name: 'Greenscreen Live E2E', plannedBoardCount: 1 })
      })
      .then((event) => {
        eventId = event.id
        boardId = event.boards[0].id
        return addPlayer(token, eventId, 'Gina', 'Grün')
      })
      .then((p1) => {
        p1Id = p1.id
        return addPlayer(token, eventId, 'Kai', 'Key')
      })
      .then((p2) => createTournament(token, eventId, { qualificationRounds: 5 }).then((t) => ({ tournamentId: t.id, p2 })))
      .then(({ tournamentId: tId, p2 }) => {
        tournamentId = tId
        return createGame(token, tournamentId, boardId, [p1Id, p2.id])
      })
      .then((game) => {
        gameId = game.id
        cy.visit(`/?greenscreen=${boardId}`)
        cy.get('[data-testid="greenscreen-player"]').should('have.text', 'Gina Grün')
        cy.get('[data-testid="greenscreen-score"]').should('have.text', '0')

        // The initial player/score above comes from a plain fetch, so it
        // proves nothing about the SignalR connection - that negotiates +
        // connects + joins the board's group asynchronously in the
        // background, with no visible "connected" indicator on this view
        // to await instead. Recording the turn before that join completes
        // would make the broadcast arrive before anyone's listening.
        cy.wait(1000)

        return recordTurn(token, tournamentId, gameId, p1Id, 45)
      })
      .then(() => {
        // No reload - this must arrive purely through the board's SignalR group.
        cy.get('[data-testid="greenscreen-player"]').should('have.text', 'Kai Key')
      })
  })
})
