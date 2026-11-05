import { login, createEvent, addPlayer, createTournament, startKnockout, nextKnockoutRound, playMatchDecisively, getKnockoutMatches } from '../support/api'

describe('Bracket-Leinwand', () => {
  it('shows a full 4-player KO tree (semis + final) and updates live as matches are decided', () => {
    let token: string
    let eventId: string
    let boardId: string
    let tournamentId: string
    const playerIds: string[] = []
    const names = [
      ['Mara', 'Eins'],
      ['Tom', 'Zwei'],
      ['Lia', 'Drei'],
      ['Ben', 'Vier'],
    ] as const

    login()
      .then((t) => {
        token = t
        return createEvent(token, { name: 'Bracket E2E', plannedBoardCount: 1 })
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
        return createTournament(token, eventId)
      })
      .then((tournament) => {
        tournamentId = tournament.id
        return startKnockout(token, eventId, tournamentId, 4, playerIds)
      })
      .then((semis) => {
        cy.visit(`/?bracket=${eventId}&tournament=${tournamentId}`)
        cy.contains('Halbfinale').should('be.visible')
        names.forEach(([first, last]) => cy.contains(`${first} ${last}`).should('be.visible'))

        // The assertions above come from the page's initial fetch, so they
        // prove nothing about its SignalR connection - that joins the
        // tournament's group asynchronously in the background, with no
        // visible "connected" indicator here to await instead. Deciding a
        // match before that join completes would make the
        // "knockoutUpdated" broadcast arrive before anyone's listening,
        // leaving the page stuck showing the pre-match state no matter how
        // long an assertion retries.
        cy.wait(1000)

        return playMatchDecisively(token, eventId, tournamentId, semis[0], boardId).then(() =>
          playMatchDecisively(token, eventId, tournamentId, semis[1], boardId),
        )
      })
      .then(() => getKnockoutMatches(token, eventId, tournamentId))
      .then((decidedSemis) => {
        // Both semis' winners render bold, live, with no reload - scoped to
        // each match's own box by data-testid, since a name can legitimately
        // appear twice on this page (its semi box, later also its final
        // box), and an unscoped cy.contains() would silently keep matching
        // the first (semi) occurrence even after the final is decided too.
        for (const semi of decidedSemis.filter((m: any) => m.round === 1)) {
          cy.get(`[data-testid="match-${semi.id}"]`).contains(semi.winnerName).should('have.css', 'font-weight', '700')
        }

        return nextKnockoutRound(token, eventId, tournamentId)
      })
      .then(() => getKnockoutMatches(token, eventId, tournamentId))
      .then((matches) => {
        const final = matches.find((m: any) => m.round === 2)
        cy.contains('Finale').should('be.visible')
        cy.get(`[data-testid="match-${final.id}"]`).within(() => {
          cy.contains(final.player1Name).should('be.visible')
          cy.contains(final.player2Name).should('be.visible')
        })

        return playMatchDecisively(token, eventId, tournamentId, final, boardId).then(() => final.id)
      })
      .then((finalId) => getKnockoutMatches(token, eventId, tournamentId).then((matches) => ({ matches, finalId })))
      .then(({ matches, finalId }) => {
        const decided = matches.find((m: any) => m.id === finalId)
        cy.get(`[data-testid="match-${finalId}"]`).contains(decided.winnerName).should('have.css', 'font-weight', '700')
      })
  })
})
