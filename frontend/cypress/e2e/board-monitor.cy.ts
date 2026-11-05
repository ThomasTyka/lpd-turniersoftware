import { login, createEvent, addPlayer, createTournament, createGame, recordTurn } from '../support/api'
import { pairMonitor } from '../support/monitor'

describe('Board-Monitor', () => {
  it('pairs to a board and shows the current player and standings for a 4-player game, live', () => {
    // Board-Monitors are large screens mounted portrait next to the board
    // - a 52" display, not a tablet, and not the desktop-landscape default
    // Cypress otherwise uses. 1080x1920 is that class of screen's native
    // panel resolution (1920x1080) turned portrait.
    cy.viewport(1080, 1920)

    let token: string
    let eventId: string
    let tournamentId: string
    let boardId: string
    let gameId: string
    const playerIds: string[] = []
    const names = [
      ['Mona', 'Monitor'],
      ['Theo', 'Team'],
      ['Zara', 'Zug'],
      ['Ivo', 'Ist'],
    ] as const

    login()
      .then((t) => {
        token = t
        return createEvent(token, { name: 'Board-Monitor E2E', plannedBoardCount: 1 })
      })
      .then((event) => {
        eventId = event.id
        boardId = event.boards[0].id
        return addPlayer(token, eventId, names[0][0], names[0][1])
      })
      .then((p1) => {
        playerIds.push(p1.id)
        return addPlayer(token, eventId, names[1][0], names[1][1])
      })
      .then((p2) => {
        playerIds.push(p2.id)
        return addPlayer(token, eventId, names[2][0], names[2][1])
      })
      .then((p3) => {
        playerIds.push(p3.id)
        return addPlayer(token, eventId, names[3][0], names[3][1])
      })
      .then((p4) => {
        playerIds.push(p4.id)
        return createTournament(token, eventId, { qualificationRounds: 3 }).then((t) => {
          tournamentId = t.id
          return createGame(token, tournamentId, boardId, playerIds)
        })
      })
      .then((game) => {
        gameId = game.id
        return recordTurn(token, tournamentId, gameId, playerIds[0], 55)
      })
      .then(() => {
        pairMonitor(eventId, 'Board 1')

        // Mona (index 0) threw first, so it's Theo's (index 1) turn now.
        cy.contains('Jetzt spielt').should('be.visible')
        cy.get('h1').should('have.text', 'Theo Team')
        names.forEach(([first, last]) => cy.contains(`${first} ${last}`).should('be.visible'))

        // The tiles above render from the page's initial fetch, so they
        // prove nothing about its SignalR connection - that joins the
        // board's group asynchronously in the background, with no visible
        // "connected" indicator here beyond the presence dot. Recording
        // the next turn before that join completes would make the
        // broadcast arrive before anyone's listening.
        cy.wait(1000)

        return recordTurn(token, tournamentId, gameId, playerIds[1], 30)
      })
      .then(() => {
        // No reload - turn passes to Zara (index 2) purely through SignalR.
        cy.get('h1').should('have.text', 'Zara Zug')
      })
  })

  it('simulates a whole game start to finish: idle, live start, every round, the leader changing, a mid-game 100+ throw, and the final result', () => {
    cy.viewport(1080, 1920)

    let token: string
    let eventId: string
    let tournamentId: string
    let boardId: string
    let tournament: any
    let nora: string
    let otto: string
    let pia: string
    let gameId: string

    const scoreRow = (playerName: string) => cy.contains('tr', playerName)

    login()
      .then((t) => {
        token = t
        return createEvent(token, { name: 'Board-Monitor Whole Game E2E', plannedBoardCount: 1 })
      })
      .then((event) => {
        eventId = event.id
        boardId = event.boards[0].id
        return addPlayer(token, eventId, 'Nora', 'Anfang')
      })
      .then((p) => {
        nora = p.id
        return addPlayer(token, eventId, 'Otto', 'Mitte')
      })
      .then((p) => {
        otto = p.id
        return addPlayer(token, eventId, 'Pia', 'Ende')
      })
      .then((p) => {
        pia = p.id
        return createTournament(token, eventId, { qualificationRounds: 3 })
      })
      .then((t) => {
        tournament = t
        tournamentId = t.id

        // Paired before any game exists: idle state, QR code offered for a
        // Tablet to pair directly from here and start one.
        pairMonitor(eventId, 'Board 1')
        cy.contains('Tablet hier koppeln').should('be.visible')
        cy.contains('Jetzt spielt').should('not.exist')

        // The idle screen above renders from the paired device's own local
        // state, not the board's SignalR group - that joins asynchronously
        // in the background, with no visible "connected" indicator besides
        // the presence dot. Starting the game before that join completes
        // would make the "gameStarted" broadcast arrive before anyone's
        // listening, leaving the screen stuck on idle no matter how long
        // an assertion retries.
        cy.wait(1000)

        return createGame(token, tournamentId, boardId, [nora, otto, pia])
      })
      .then((game) => {
        gameId = game.id

        // Live pickup of "gameStarted", no reload: Nora goes first. Note
        // "Tablet hier koppeln" does NOT disappear here - GameDisplay keeps
        // a small corner QR up for pairing a second Tablet even mid-game,
        // separate from the big centered idle one this replaces.
        cy.get('h1').should('have.text', 'Nora Anfang')
        cy.contains('Runde 1/3').should('be.visible')

        // Round 1: Nora 50, Otto 0, Pia 20 - Nora leads after it.
        return recordTurn(token, tournamentId, gameId, nora, 50)
      })
      .then(() => {
        cy.get('h1').should('have.text', 'Otto Mitte')
        return recordTurn(token, tournamentId, gameId, otto, 0)
      })
      .then(() => {
        cy.get('h1').should('have.text', 'Pia Ende')
        return recordTurn(token, tournamentId, gameId, pia, 20)
      })
      .then(() => {
        // Round 1 done: Nora 50 leads, live in the standings table.
        scoreRow('Nora Anfang').find('td').eq(1).should('have.text', '50')
        scoreRow('Nora Anfang').find('td').eq(2).should('have.text', '🏆')
        scoreRow('Otto Mitte').find('td').eq(2).should('have.text', '-50')
        scoreRow('Pia Ende').find('td').eq(2).should('have.text', '-30')
        cy.contains('Runde 2/3').should('be.visible')

        // Round 2: Nora 20 (-> 70), Otto 140 (-> 140, takes the lead - and
        // is this game's mid-round 100+ confetti moment).
        return recordTurn(token, tournamentId, gameId, nora, 20)
      })
      .then(() => recordTurn(token, tournamentId, gameId, otto, 140))
      .then(() => {
        // Confetti shows live for Otto's throw - no trophy alongside it,
        // the game is nowhere near over (round 3 still to come for
        // everyone).
        cy.get('[data-testid="confetti-overlay"]').should('be.visible').and('contain.text', '140')
        cy.get('[data-testid="trophy-overlay"]').should('not.exist')

        // Clears on its own after 3.5s, and the game itself was never
        // interrupted by it - turn had already passed to Pia underneath
        // the overlay.
        cy.get('[data-testid="confetti-overlay"]', { timeout: 6000 }).should('not.exist')
        cy.contains('Ergebnis').should('not.exist')
        cy.get('h1').should('have.text', 'Pia Ende')
        cy.contains('Runde 2/3').should('be.visible')

        // Lead changed hands, live: Otto (140) now leads over Nora (70).
        scoreRow('Otto Mitte').find('td').eq(1).should('have.text', '140')
        scoreRow('Otto Mitte').find('td').eq(2).should('have.text', '🏆')
        scoreRow('Nora Anfang').find('td').eq(2).should('have.text', '-70')

        return recordTurn(token, tournamentId, gameId, pia, 10)
      })
      .then(() => {
        scoreRow('Pia Ende').find('td').eq(2).should('have.text', '-110')
        cy.contains('Runde 3/3').should('be.visible')

        // Round 3 (final): Nora 10 (-> 80), Otto 5 (-> 145), Pia 150 (-> 180, wins it).
        return recordTurn(token, tournamentId, gameId, nora, 10)
      })
      .then(() => recordTurn(token, tournamentId, gameId, otto, 5))
      .then(() => recordTurn(token, tournamentId, gameId, pia, 150))
      .then(() => {
        // Trophy first: unlike confetti's fixed 3.5s, it self-clears via
        // its own Lottie animation's onComplete, which can finish quickly
        // - checking it last (after several other assertions have already
        // spent real retry time) risks missing its window entirely, even
        // though it did genuinely show.
        cy.get('[data-testid="trophy-overlay"]').should('be.visible').and('contain.text', 'Pia Ende')

        // Pia's winning throw is also 100+ - the confetti overlay must
        // still show for it, live, even though it's the exact throw that
        // ends the game (status flips to 'Finished' in that same update).
        // Unlike Otto's round 2 throw above, this one lands alongside the
        // trophy instead of the game just continuing underneath it.
        cy.get('[data-testid="confetti-overlay"]').should('be.visible').and('contain.text', '150')

        // Game finished, live: the "Ergebnis" screen replaces "Jetzt spielt",
        // winner shown big, the rest ranked below - not just the raw
        // per-player table order, real final standings.
        cy.contains('Jetzt spielt').should('not.exist')
        cy.contains('Ergebnis').should('be.visible')
        cy.get('h1').should('have.text', 'Pia Ende')
        cy.contains('180').should('be.visible')
        cy.contains('2. Otto Mitte: 145').should('be.visible')
        cy.contains('3. Nora Anfang: 80').should('be.visible')

        // Both overlays clear on their own - confetti after a fixed 3.5s,
        // the trophy once its own Lottie animation completes.
        cy.get('[data-testid="trophy-overlay"]', { timeout: 9000 }).should('not.exist')
        cy.get('[data-testid="confetti-overlay"]', { timeout: 9000 }).should('not.exist')
      })
  })
})
