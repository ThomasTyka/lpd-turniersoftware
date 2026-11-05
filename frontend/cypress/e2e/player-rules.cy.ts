import { login, createEvent, addPlayer, createTournament, createGame } from '../support/api'
import { pairTablet } from '../support/tablet'

// Both rules here were real bugs/gaps fixed earlier in this project (see
// git history for Event.cs's EnsureUniqueName and GameEndpoints'
// FindPlayerAlreadyInProgressAsync) - regression coverage for the exact
// business rules and error copy, driven through the real API rather than
// the UI (the UI forms are thin wrappers with no logic of their own to
// verify beyond "does it show the server's error message", which these
// still confirm via the raw response body).

describe('Player uniqueness', () => {
  it('rejects a second player with the same first/last name, even under a different nickname', () => {
    login()
      .then((token) => createEvent(token, { name: 'Uniqueness E2E', plannedBoardCount: 1 }).then((event) => ({ token, event })))
      .then(({ token, event }) =>
        addPlayer(token, event.id, 'Max', 'Mustermann').then(() => ({ token, eventId: event.id })),
      )
      .then(({ token, eventId }) => {
        cy.request({
          method: 'POST',
          url: `/api/events/${eventId}/players`,
          headers: { Authorization: `Bearer ${token}` },
          body: { firstName: 'Max', lastName: 'Mustermann', nickname: 'MaxTheSecond' },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.equal(400)
          expect(res.body).to.contain('Dieser Spieler ist bereits in der Liste dieses Events vorhanden.')
        })
      })
  })

  it('allows the same name in a different event', () => {
    login()
      .then((token) =>
        createEvent(token, { name: 'Uniqueness Event A E2E', plannedBoardCount: 1 }).then((eventA) =>
          addPlayer(token, eventA.id, 'Max', 'Mustermann').then(() =>
            createEvent(token, { name: 'Uniqueness Event B E2E', plannedBoardCount: 1 }).then((eventB) => ({ token, eventB })),
          ),
        ),
      )
      .then(({ token, eventB }) =>
        cy.request({
          method: 'POST',
          url: `/api/events/${eventB.id}/players`,
          headers: { Authorization: `Bearer ${token}` },
          body: { firstName: 'Max', lastName: 'Mustermann' },
        }),
      )
      .then((res) => {
        expect(res.status).to.equal(201)
      })
  })
})

describe('Double-booking prevention', () => {
  it('refuses to start a second game for a player already playing on another board', () => {
    let token: string
    let eventId: string
    let tournamentId: string
    let board2: string
    let busyPlayerId: string
    let busyPlayerName: string

    login()
      .then((t) => {
        token = t
        return createEvent(token, { name: 'Double-Booking E2E', plannedBoardCount: 2 })
      })
      .then((event) => {
        eventId = event.id
        const board1 = event.boards[0].id
        board2 = event.boards[1].id
        return addPlayer(token, eventId, 'Busy', 'Player').then((p1) =>
          addPlayer(token, eventId, 'Other', 'One').then((p2) =>
            createTournament(token, eventId).then((tournament) => {
              tournamentId = tournament.id
              busyPlayerId = p1.id
              busyPlayerName = p1.displayName ?? `${p1.firstName} ${p1.lastName}`
              return createGame(token, tournamentId, board1, [p1.id, p2.id])
            }),
          ),
        )
      })
      .then(() => addPlayer(token, eventId, 'Third', 'Wheel'))
      .then((p3) => {
        cy.request({
          method: 'POST',
          url: `/api/tournaments/${tournamentId}/games`,
          headers: { Authorization: `Bearer ${token}` },
          body: { boardId: board2, playerIds: [busyPlayerId, p3.id] },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.equal(409)
          expect(res.body).to.contain(`${busyPlayerName} spielt bereits an einem anderen Board.`)
        })
      })
  })
})

// Player creation was briefly opened up to unauthenticated Tablets for
// walk-up registration, then reverted per explicit feedback: adding (and
// correcting) a player is Regie-only, same as everything else on this
// entity. Two angles: the API itself, and the Tablet UI that used to offer
// this no longer does.
describe('Player creation requires Regie login', () => {
  it('rejects an unauthenticated request to create a player', () => {
    login()
      .then((token) => createEvent(token, { name: 'Anonymous Player E2E', plannedBoardCount: 1 }))
      .then((event) => {
        cy.request({
          method: 'POST',
          url: `/api/events/${event.id}/players`,
          body: { firstName: 'Walkup', lastName: 'Guest' },
          failOnStatusCode: false,
        }).then((res) => {
          expect(res.status).to.equal(401)
        })
      })
  })

  it('does not offer a "Neuer Spieler" form on the Tablet\'s game-start screen', () => {
    login()
      .then((token) =>
        createEvent(token, { name: 'No Walkup Form E2E', plannedBoardCount: 1 }).then((event) =>
          addPlayer(token, event.id, 'Existing', 'Player').then(() => event),
        ),
      )
      .then((event) => {
        pairTablet(event.id, event.boards[0].id)

        // Only the roster the Regie already entered - no way to add a new one here.
        cy.contains('Verfügbare Spieler').should('be.visible')
        cy.contains('Existing Player').should('be.visible')
        cy.contains('Neuer Spieler').should('not.exist')
        cy.get('input[placeholder="Vorname"]').should('not.exist')
      })
  })
})
