import { login, createEvent, addPlayer, createTournament, setTournamentStatus, createGame, playRounds, setLeinwandSettings } from '../support/api'

/** Plays several finished games for one player against a shared filler opponent - one call per game, each with that game's own two-round score pair. */
function playQualificationGames(
  token: string,
  tournamentId: string,
  boardId: string,
  playerId: string,
  fillerId: string,
  gameScorePairs: [number, number][],
): Cypress.Chainable<any> {
  let chain = cy.wrap(null, { log: false })
  for (const [round1, round2] of gameScorePairs) {
    chain = chain
      .then(() => createGame(token, tournamentId, boardId, [playerId, fillerId]))
      .then((game: any) => playRounds(token, tournamentId, game.id, playerId, [round1, round2], fillerId, [2, 2]))
  }
  return chain
}

/** Cells of the named player's row, in table order (name cell first). */
function rowCells(playerName: string) {
  return cy.contains('tr', playerName).find('td')
}

describe('Leinwand - Vorrunden-Rangliste', () => {
  it('shows every finished game as its own column, the counted (best-of-N) ones per row highlighted, and the Highscore summed', () => {
    let token: string
    let eventId: string
    let tournamentId: string
    let boardId: string
    let leaId: string
    let cemId: string
    let boId: string
    let daxId: string
    let fillerId: string

    login()
      .then((t) => {
        token = t
        return createEvent(token, { name: 'Vorrunden-Rangliste E2E', plannedBoardCount: 1 })
      })
      .then((event) => {
        eventId = event.id
        boardId = event.boards[0].id
        return addPlayer(token, eventId, 'Lea', 'Erste')
      })
      .then((p) => {
        leaId = p.id
        return addPlayer(token, eventId, 'Cem', 'Zweite')
      })
      .then((p) => {
        cemId = p.id
        return addPlayer(token, eventId, 'Bo', 'Dritte')
      })
      .then((p) => {
        boId = p.id
        return addPlayer(token, eventId, 'Dax', 'Vierte')
      })
      .then((p) => {
        daxId = p.id
        return addPlayer(token, eventId, 'Filler', 'Gegner')
      })
      .then((p) => {
        fillerId = p.id
        // qualificationBestOf: 2 - only the best 2 of however many
        // qualification games a player finishes count toward their
        // Highscore column, mirroring the old system's "Summe der besten X
        // Spiele" - but every finished game still gets its own column, not
        // just the counted ones (also matching the old system).
        return createTournament(token, eventId, { qualificationRounds: 2, qualificationBestOf: 2 })
      })
      .then((tournament) => {
        tournamentId = tournament.id
        return setTournamentStatus(token, eventId, tournamentId, 'Running')
      })
      // Lea: 3 finished games (90, 70, 50) - best 2 = 160 Highscore, but
      // all 3 still get their own column.
      .then(() => playQualificationGames(token, tournamentId, boardId, leaId, fillerId, [[45, 45], [35, 35], [25, 25]]))
      // Cem: 2 finished games (45, 35) - best 2 = 80 Highscore.
      .then(() => playQualificationGames(token, tournamentId, boardId, cemId, fillerId, [[25, 20], [20, 15]]))
      // Bo: 1 finished game - 60 Highscore.
      .then(() => playQualificationGames(token, tournamentId, boardId, boId, fillerId, [[30, 30]]))
      // Dax: 1 finished game - 20 Highscore.
      .then(() => playQualificationGames(token, tournamentId, boardId, daxId, fillerId, [[10, 10]]))
      .then(() => setLeinwandSettings(token, eventId, { activeScenes: ['leaderboard'], intervalSeconds: 10, pinnedScene: 'leaderboard' }))
      .then(() => {
        cy.visit(`/?leinwand=${eventId}`)
        cy.contains('h2', 'Vorrunden-Rangliste').should('be.visible')

        // Sorted descending by Highscore: Lea (160) > Cem (80) > Bo (60) > Dax (20).
        cy.contains('tr', 'Lea Erste').find('td').first().should('contain.text', '1. Lea Erste')
        cy.contains('tr', 'Cem Zweite').find('td').first().should('contain.text', '2. Cem Zweite')
        cy.contains('tr', 'Bo Dritte').find('td').first().should('contain.text', '3. Bo Dritte')
        cy.contains('tr', 'Dax Vierte').find('td').first().should('contain.text', '4. Dax Vierte')

        // Lea's 3 games (90, 70, 50) - only the best 2 are highlighted
        // (qualificationBestOf: 2 for this tournament), not a hardcoded
        // "best 3" regardless of that setting like the old system did; her
        // Highscore column sums exactly those two counted games.
        rowCells('Lea Erste').eq(1).should('have.text', '90').and('have.css', 'font-weight', '700')
        rowCells('Lea Erste').eq(2).should('have.text', '70').and('have.css', 'font-weight', '700')
        rowCells('Lea Erste').eq(3).should('have.text', '50').and('have.css', 'font-weight', '400')
        rowCells('Lea Erste').last().should('have.text', '160')

        // Bo has only 1 game (60, highlighted) - her Highscore column still
        // shows just that one game's total, not a dropped/missing column.
        rowCells('Bo Dritte').eq(1).should('have.text', '60').and('have.css', 'font-weight', '700')
        rowCells('Bo Dritte').last().should('have.text', '60')

        // Filler has more games than anyone (opponent in every game above),
        // so the table has more columns than Bo/Dax have games - those
        // extra columns render as "/", not blank, and outside the
        // top-3-per-row highlight.
        rowCells('Bo Dritte').eq(2).should('have.text', '/').and('have.css', 'font-weight', '400')
      })
  })

  it('paginates past 12 players, 12 per page, rotating automatically', () => {
    let token: string
    let eventId: string
    let tournamentId: string
    let boardId: string
    let fillerId: string
    const playerNames = Array.from({ length: 13 }, (_, i) => [`P${i}`, 'Vorrunde'] as const)

    login()
      .then((t) => {
        token = t
        return createEvent(token, { name: 'Vorrunden-Rangliste Pagination E2E', plannedBoardCount: 1 })
      })
      .then((event) => {
        eventId = event.id
        boardId = event.boards[0].id
        return addPlayer(token, eventId, 'Filler', 'Gegner')
      })
      .then((filler) => {
        fillerId = filler.id
        return createTournament(token, eventId, { qualificationRounds: 1 })
      })
      .then((tournament) => {
        tournamentId = tournament.id
        return setTournamentStatus(token, eventId, tournamentId, 'Running')
      })
      .then(() => {
        // 13 players, one finished game each, all against the same filler
        // - score doesn't matter here, only that all 13 show up somewhere.
        let chain = cy.wrap(null, { log: false })
        for (const [first, last] of playerNames) {
          chain = chain
            .then(() => addPlayer(token, eventId, first, last))
            .then((p: any) => createGame(token, tournamentId, boardId, [p.id, fillerId]))
            .then((game: any) => playRounds(token, tournamentId, game.id, game.entries[0].playerId, [10], fillerId, [1]))
        }
        return chain
      })
      .then(() => setLeinwandSettings(token, eventId, { activeScenes: ['leaderboard'], intervalSeconds: 10, pinnedScene: 'leaderboard' }))
      .then(() => {
        cy.visit(`/?leinwand=${eventId}`)
        cy.contains('h2', 'Vorrunden-Rangliste').should('be.visible')
        cy.contains('Seite 1/2').should('be.visible')
        cy.get('tbody tr').should('have.length', 12)

        // Auto-rotates every 5s to page 2 without a reload.
        cy.contains('Seite 2/2', { timeout: 7000 }).should('be.visible')
        cy.get('tbody tr').should('have.length.at.least', 1)
      })
  })

  it('shows a placeholder when no qualification round is running', () => {
    login()
      .then((token) =>
        createEvent(token, { name: 'Vorrunden-Rangliste Idle E2E', plannedBoardCount: 1 }).then((event) =>
          setLeinwandSettings(token, event.id, { activeScenes: ['leaderboard'], intervalSeconds: 10, pinnedScene: 'leaderboard' }).then(() => event),
        ),
      )
      .then((event) => {
        // The tournament stays Draft (never set to Running) - the Leinwand
        // must not get stuck on "Lädt…" forever for this, same as it
        // wouldn't for an event with no tournament at all.
        cy.visit(`/?leinwand=${event.id}`)
        cy.contains('Keine laufende Vorrunde.').should('be.visible')
      })
  })
})
