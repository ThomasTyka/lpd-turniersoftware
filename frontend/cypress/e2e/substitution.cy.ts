import {
  login,
  createEvent,
  addPlayer,
  createTournament,
  setTournamentStatus,
  createGame,
  recordTurn,
  getLeaderboard,
  startKnockout,
  getAvailableKnockoutSubstitutes,
  startGroupRound,
  getAvailableGroupSubstitutes,
  E2E_USERNAME,
  E2E_PASSWORD,
} from '../support/api'

// Manual "Nachrücken": if a player is missing - even right at the very start
// of the KO bracket or a group round, before anyone's actually been
// eliminated - the Regie can pull in another qualified player who just
// wasn't originally seeded/grouped. Nothing here ever substitutes on its
// own; every swap is an explicit Regie action via the "Spieler ersetzen"
// form (KnockoutPanel/GroupPanel).

const NAMES = [
  ['Anton', 'Adler'],
  ['Bea', 'Berg'],
  ['Cem', 'Clark'],
  ['Dana', 'Dorn'],
  ['Emil', 'Ernst'],
  ['Finja', 'Fest'],
] as const

function loginViaUi() {
  cy.visit('/')
  cy.contains('label', 'Benutzername').find('input').type(E2E_USERNAME)
  cy.contains('label', 'Passwort').find('input[type="password"]').type(E2E_PASSWORD)
  cy.contains('button', 'Anmelden').click()
}

/**
 * Six players, three real 1-round qualification games, deliberately spread
 * so the ranking is unambiguous: Anton(150) > Cem(140) > Emil(130) >
 * Finja(70) > Dana(60) > Bea(50). Anton/Cem/Emil/Finja qualify for a 4-slot
 * bracket or group round; Dana/Bea are left over, unseeded - exactly the
 * pool a Nachrücker should be drawn from.
 */
function setUpQualifiedPlayers(token: string, eventNamePrefix: string) {
  // Unique per run - this container is reused across repeated local test
  // runs, and a duplicate event name would make `cy.contains(eventName)`
  // ambiguous (it matches the first DOM hit, which need not be the one this
  // run just created).
  const eventName = `${eventNamePrefix} ${Date.now()}-${Math.floor(Math.random() * 1e6)}`
  const players: Record<string, string> = {}
  let eventId: string
  let boardId: string
  let tournamentId: string

  return createEvent(token, { name: eventName, plannedBoardCount: 1 })
    .then((event) => {
      eventId = event.id
      boardId = event.boards[0].id
      let chain = cy.wrap(null, { log: false })
      for (const [first, last] of NAMES) {
        chain = chain.then(() => addPlayer(token, eventId, first, last)).then((p: any) => {
          players[`${first} ${last}`] = p.id
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
      const quali: [string, string, number][] = [
        ['Anton Adler', 'Bea Berg', 150],
        ['Cem Clark', 'Dana Dorn', 140],
        ['Emil Ernst', 'Finja Fest', 130],
      ]
      let chain = cy.wrap(null, { log: false })
      for (const [winner, loser, winnerTotal] of quali) {
        let gameId: string
        chain = chain
          .then(() => createGame(token, tournamentId, boardId, [players[winner], players[loser]]))
          .then((game: any) => {
            gameId = game.id
            return recordTurn(token, tournamentId, gameId, players[winner], winnerTotal)
          })
          .then(() => recordTurn(token, tournamentId, gameId, players[loser], 200 - winnerTotal))
      }
      return chain
    })
    .then(() => setTournamentStatus(token, eventId, tournamentId, 'FinalStarted'))
    .then(() => getLeaderboard(token, eventId, tournamentId))
    .then((leaderboard) => {
      const ranked = [...leaderboard].sort((a, b) => b.score - a.score).map((e) => e.playerId)
      expect(ranked).to.deep.equal([
        players['Anton Adler'], players['Cem Clark'], players['Emil Ernst'], players['Finja Fest'],
        players['Dana Dorn'], players['Bea Berg'],
      ])
      return { eventId, eventName, boardId, tournamentId, players, top4: ranked.slice(0, 4) }
    })
}

describe('Manual Nachrücken (substitution)', () => {
  it('lets a round-1 KO no-show be replaced by an unseeded qualified player, before anyone is eliminated', () => {
    login()
      .then((token) =>
        setUpQualifiedPlayers(token, 'KO Substitution E2E').then((setup) => ({ token, ...setup })),
      )
      .then(({ token, eventId, eventName, tournamentId, top4 }) =>
        startKnockout(token, eventId, tournamentId, 4, top4).then((matches) => ({ token, eventId, eventName, tournamentId, matches })),
      )
      .then(({ token, eventId, eventName, tournamentId, matches }) =>
        // Round 1, no legs played anywhere, nobody eliminated yet - the pool
        // must still surface the two never-seeded qualified players.
        getAvailableKnockoutSubstitutes(token, eventId, tournamentId).then((available) => {
          expect(available.map((p: any) => p.playerName).sort()).to.deep.equal(['Bea Berg', 'Dana Dorn'])

          const finjaMatch = matches.find((m: any) => m.player1Name === 'Finja Fest' || m.player2Name === 'Finja Fest')
          expect(finjaMatch).to.exist

          loginViaUi()
          cy.contains(eventName).click()
          cy.contains('Turniere').click()
          cy.contains('Gruppenrunde & KO-Runde').click()

          cy.get(`[data-testid="match-${finjaMatch.id}"]`).within(() => {
            cy.contains('button', 'Spieler ersetzen').click()
            cy.contains('label', 'Ausscheidender Spieler').find('select').select('Finja Fest')
            cy.contains('label', 'Nachrückspieler').find('select').select('Dana Dorn')
            cy.contains('button', 'Ersetzen').click()
          })

          cy.get(`[data-testid="match-${finjaMatch.id}"]`).should('contain.text', 'Dana Dorn').and('not.contain.text', 'Finja Fest')
        }),
      )
  })

  it("lets a group-round no-show be replaced by an unseeded qualified player before the group's game starts", () => {
    login()
      .then((token) =>
        setUpQualifiedPlayers(token, 'Group Substitution E2E').then((setup) => ({ token, ...setup })),
      )
      .then(({ token, eventId, eventName, tournamentId, top4 }) =>
        // 4 qualified players, 2 groups of 2, top 1 per group advances -
        // striped by rank so Anton/Emil land in group 1, Cem/Finja in group 2.
        startGroupRound(token, eventId, tournamentId, 4, 2, 1).then((groups) => ({ token, eventId, eventName, tournamentId, groups })),
      )
      .then(({ token, eventId, eventName, tournamentId, groups }) =>
        // Nobody's game has started, nobody's been eliminated - the pool
        // must still surface the two never-grouped qualified players.
        getAvailableGroupSubstitutes(token, eventId, tournamentId).then((available) => {
          expect(available.map((p: any) => p.playerName).sort()).to.deep.equal(['Bea Berg', 'Dana Dorn'])

          const finjaGroup = groups.find((g: any) => g.participants.some((p: any) => p.playerName === 'Finja Fest'))
          expect(finjaGroup).to.exist

          loginViaUi()
          cy.contains(eventName).click()
          cy.contains('Turniere').click()
          cy.contains('Gruppenrunde & KO-Runde').click()

          cy.get(`[data-testid="group-${finjaGroup.id}"]`).within(() => {
            cy.contains('button', 'Spieler ersetzen').click()
            cy.contains('label', 'Fehlender Spieler').find('select').select('Finja Fest')
            cy.contains('label', 'Nachrückspieler').find('select').select('Dana Dorn')
            cy.contains('button', 'Ersetzen').click()
          })

          cy.get(`[data-testid="group-${finjaGroup.id}"]`).should('contain.text', 'Dana Dorn').and('not.contain.text', 'Finja Fest')
        }),
      )
  })
})
