import { login, createEvent, addPlayer, createTournament, createGame, recordTurn } from '../support/api'

describe('Leinwand', () => {
  it('shows every board live: an active game, an idle board, and a fresh one - and updates without reload', () => {
    let token: string
    let eventId: string
    let tournamentId: string
    let board1: string
    let board2: string
    let board3: string
    let gameId: string
    let p1Id: string
    let p2Id: string

    login()
      .then((t) => {
        token = t
        return createEvent(token, { name: 'Leinwand Simulation E2E', plannedBoardCount: 3 })
      })
      .then((event) => {
        eventId = event.id
        ;[board1, board2, board3] = event.boards.map((b: { id: string }) => b.id)
        return addPlayer(token, eventId, 'Sina', 'Spitze')
      })
      .then((p1) => {
        p1Id = p1.id
        return addPlayer(token, eventId, 'Rico', 'Rest')
      })
      .then((p2) => {
        p2Id = p2.id
        return createTournament(token, eventId, { qualificationRounds: 8 }).then((t) => {
          tournamentId = t.id
          // Board 1: an already-running game with one round in, so the
          // tile's initial fetch has real standings to sort and bold.
          // Only Sina's turn is played here - it's Rico's turn next, which
          // is exactly the turn the later live-update check plays.
          return createGame(token, tournamentId, board1, [p1Id, p2Id]).then((game) => {
            gameId = game.id
            return recordTurn(token, tournamentId, gameId, p1Id, 60)
          })
        })
      })
      .then(() => addPlayer(token, eventId, 'Finn', 'Frisch'))
      .then((p3) => addPlayer(token, eventId, 'Ella', 'Extra').then((p4) => [p3, p4]))
      // Board 2 (board3 var unused here) is deliberately left without a
      // game, to check the idle tile. Board 3 gets a brand-new 0-0 game.
      .then(([p3, p4]) => createGame(token, tournamentId, board3, [p3.id, p4.id]))
      .then(() => {
        cy.visit(`/?leinwand=${eventId}`)

        // Sina leads 60-0 after the one turn above, so she's listed first
        // and bold - Rico, second and unbold. Not asserting the raw score
        // digits here too: "0" would ambiguously substring-match "60" via
        // cy.contains, so the later live-update check (a distinct "105")
        // is what actually verifies the numbers, not just the ordering.
        cy.contains('h2', 'Board 1').parent().within(() => {
          cy.contains('Sina Spitze').should('have.css', 'font-weight', '700')
          cy.contains('Rico Rest').should('have.css', 'font-weight', '400')
        })
        cy.contains('h2', 'Board 2').parent().should('contain.text', 'Kein aktives Spiel.')
        cy.contains('h2', 'Board 3').parent().within(() => {
          cy.contains('Finn Frisch')
          cy.contains('Ella Extra')
        })

        // The board tiles above render from the page's initial fetch, so
        // they prove nothing about its SignalR connection - that joins
        // every board's group (plus the event's Leinwand group)
        // asynchronously in the background, with no visible "connected"
        // indicator to await here beyond the header text. Recording the
        // next turn before that join completes would make the broadcast
        // arrive before anyone's listening.
        cy.contains('Verbindung: live').should('be.visible')

        // It's Rico's turn now (Sina already threw once above).
        return recordTurn(token, tournamentId, gameId, p2Id, 45)
      })
      .then(() => {
        // No reload - Rico's total must update purely through SignalR.
        cy.contains('h2', 'Board 1').parent().within(() => {
          cy.contains('Rico Rest')
          cy.contains('45')
        })
      })
  })

  it('shows a full-screen highlight overlay on a 180 and clears it on its own', () => {
    let token: string
    let eventId: string
    let tournamentId: string
    let boardId: string
    let gameId: string
    let p1Id: string

    login()
      .then((t) => {
        token = t
        return createEvent(token, { name: 'Leinwand Highlight E2E', plannedBoardCount: 1 })
      })
      .then((event) => {
        eventId = event.id
        boardId = event.boards[0].id
        return addPlayer(token, eventId, 'Hana', 'Hoch')
      })
      .then((p1) => {
        p1Id = p1.id
        return addPlayer(token, eventId, 'Nils', 'Niedrig')
      })
      .then((p2) => createTournament(token, eventId, { qualificationRounds: 8 }).then((t) => createGame(token, t.id, boardId, [p1Id, p2.id]).then((game) => ({ tournamentId: t.id, game }))))
      .then(({ tournamentId: tId, game }) => {
        tournamentId = tId
        gameId = game.id
        cy.visit(`/?leinwand=${eventId}`)
        cy.contains('Verbindung: live').should('be.visible')
        cy.wait(1000)

        return recordTurn(token, tournamentId, gameId, p1Id, 180)
      })
      .then(() => {
        cy.contains('180!').should('be.visible')
        cy.contains('Hana Hoch').should('be.visible')
        cy.contains('180!', { timeout: 7000 }).should('not.exist')
      })
  })
})
