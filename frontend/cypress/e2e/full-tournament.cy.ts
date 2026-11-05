import { login, createEvent, addPlayer, createTournament, setTournamentStatus, createGame, recordTurn, getLeaderboard, startKnockout, nextKnockoutRound, getKnockoutMatches, setLeinwandSettings } from '../support/api'
import { playAllDecisively, findFinalAndThird } from '../support/tournament'

// A full tournament, start to finish: real qualification games decide the
// seeding (not a hand-picked order), then a genuine 8-player KO bracket
// plays out - visiting the Vorrunden-Rangliste, the Bracket-Leinwand, and
// finally the Siegerehrung along the way, so every stage is actually seen
// live rather than only checked via the API. Nobody's name is hardcoded as
// "the winner" anywhere - the bracket's own seeding algorithm decides who
// plays whom, so every assertion reads back whatever the API actually
// reports at that point instead of predicting it.

describe('Full tournament', () => {
  it('plays a real Vorrunde, seeds an 8-player KO bracket by it, and crowns a winner', () => {
    let token: string
    let eventId: string
    let boardId: string
    let tournamentId: string
    const names = [
      ['Ada', 'Adler'], ['Ben', 'Berg'], ['Cleo', 'Clark'], ['Dino', 'Dorn'],
      ['Ela', 'Ernst'], ['Finn', 'Fest'], ['Gia', 'Groll'], ['Hex', 'Holt'],
    ] as const
    // Pairs and totals for the one qualification game each player plays -
    // deliberately spread out so the resulting ranking is unambiguous.
    const quali: [number, number, number][] = [
      [0, 1, 150], // Ada beats Ben 150-50
      [2, 3, 140], // Cleo beats Dino 140-60
      [4, 5, 130], // Ela beats Finn 130-70
      [6, 7, 120], // Gia beats Hex 120-80
    ]
    const players: string[] = []

    login()
      .then((t) => {
        token = t
        return createEvent(token, { name: 'Full Tournament E2E', plannedBoardCount: 1 })
      })
      .then((event) => {
        eventId = event.id
        boardId = event.boards[0].id
        let chain = cy.wrap(null, { log: false })
        for (const [first, last] of names) {
          chain = chain.then(() => addPlayer(token, eventId, first, last)).then((p: any) => {
            players.push(p.id)
          })
        }
        return chain
      })
      .then(() => createTournament(token, eventId, { qualificationRounds: 1 }))
      .then((tournament) => {
        tournamentId = tournament.id
        return setTournamentStatus(token, eventId, tournamentId, 'Running')
      })
      .then(() => {
        // Vorrunde: one real, live-recorded game per pair - the winner's
        // total is exactly the (higher - lower) split from `quali` above,
        // the loser gets the rest, so both totals land where planned.
        let chain = cy.wrap(null, { log: false })
        for (const [winnerIdx, loserIdx, winnerTotal] of quali) {
          let gameId: string
          chain = chain
            .then(() => createGame(token, tournamentId, boardId, [players[winnerIdx], players[loserIdx]]))
            .then((game: any) => {
              gameId = game.id
              return recordTurn(token, tournamentId, gameId, players[winnerIdx], winnerTotal)
            })
            .then(() => recordTurn(token, tournamentId, gameId, players[loserIdx], 200 - winnerTotal))
        }
        return chain
      })
      .then(() => setLeinwandSettings(token, eventId, { activeScenes: ['leaderboard'], intervalSeconds: 30, pinnedScene: 'leaderboard' }))
      .then(() => {
        // See it live: the Vorrunden-Rangliste reflects real qualification
        // results, Ada (150) on top.
        cy.visit(`/?leinwand=${eventId}`)
        cy.contains('h2', 'Vorrunden-Rangliste').should('be.visible')
        cy.contains('tr', 'Ada Adler').find('td').eq(1).should('have.text', '150')

        return getLeaderboard(token, eventId, tournamentId)
      })
      .then((leaderboard) => {
        // Seed the KO bracket by actual qualification rank - top scorer
        // first, exactly as a real event would.
        const seeded = [...leaderboard].sort((a, b) => b.score - a.score).map((e) => e.playerId)
        expect(seeded).to.have.length(8)
        return startKnockout(token, eventId, tournamentId, 8, seeded)
      })
      .then((quarterfinals) => {
        // Watch the bracket fill in live as the quarterfinals are decided.
        cy.visit(`/?bracket=${eventId}&tournament=${tournamentId}`)
        cy.contains('Viertelfinale').should('be.visible')
        cy.wait(1000)

        return playAllDecisively(token, eventId, tournamentId, quarterfinals, boardId)
      })
      .then(() => nextKnockoutRound(token, eventId, tournamentId))
      .then(() => getKnockoutMatches(token, eventId, tournamentId))
      .then((matches) => {
        cy.contains('Halbfinale').should('be.visible')
        return playAllDecisively(token, eventId, tournamentId, matches.filter((m: any) => m.round === 2), boardId)
      })
      .then(() => nextKnockoutRound(token, eventId, tournamentId))
      .then(() => getKnockoutMatches(token, eventId, tournamentId))
      .then((matches) => {
        cy.contains('Finale').should('be.visible')
        const { final, thirdPlace } = findFinalAndThird(matches)
        return playAllDecisively(token, eventId, tournamentId, [final, thirdPlace], boardId).then(() => ({ finalId: final.id, thirdId: thirdPlace.id }))
      })
      .then(({ finalId, thirdId }) => getKnockoutMatches(token, eventId, tournamentId).then((matches) => ({ matches, finalId, thirdId })))
      .then(({ matches, finalId, thirdId }) => {
        const finalMatch = matches.find((m: any) => m.id === finalId)
        const thirdMatch = matches.find((m: any) => m.id === thirdId)
        const firstName = finalMatch.winnerName
        const secondName = finalMatch.winnerId === finalMatch.player1Id ? finalMatch.player2Name : finalMatch.player1Name
        const thirdName = thirdMatch.winnerName

        return setTournamentStatus(token, eventId, tournamentId, 'Finished').then(() => {
          // The full arc, live: Siegerehrung names whoever the bracket
          // actually produced.
          cy.visit(`/?siegerehrung=${eventId}&tournament=${tournamentId}`)
          cy.get('[data-testid="podium-1"]').should('contain.text', firstName)
          cy.get('[data-testid="podium-2"]').should('contain.text', secondName)
          cy.get('[data-testid="podium-3"]').should('contain.text', thirdName)
        })
      })
  })
})
