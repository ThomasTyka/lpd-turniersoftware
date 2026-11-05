import { login, createEvent, E2E_USERNAME, E2E_PASSWORD } from '../support/api'

// Regression test for a real bug: the Boards admin table sorted by the
// board's label text (`localeCompare` on "#1"/"#2"/"#10"/...) instead of
// its number, so "#10" sorted before "#2" - alphabetic, not numeric order.
describe('Boards admin table', () => {
  it('lists boards in numeric order, not alphabetic (#2 before #10)', () => {
    login()
      .then((token) => createEvent(token, { name: 'Board Order E2E', plannedBoardCount: 11 }))
      .then((event) => {
        cy.visit('/')
        cy.contains('label', 'Benutzername').find('input').type(E2E_USERNAME)
        cy.contains('label', 'Passwort').find('input[type="password"]').type(E2E_PASSWORD)
        cy.contains('button', 'Anmelden').click()

        cy.contains(event.name).click()
        cy.contains('Boards').click()

        // With 11 boards (#1..#11), alphabetic order would put #10 and
        // #11 right after #1 - numeric order puts #2 as literally the
        // second row.
        cy.get('table tbody tr').eq(1).should('contain.text', '#2')
        cy.get('table tbody tr').eq(9).should('contain.text', '#10')
        cy.get('table tbody tr').eq(10).should('contain.text', '#11')
      })
  })
})

// The underlying root cause: GET /api/events/{id}/pairing/boards (the
// anonymous board list behind the Board-Monitor/Tablet pairing pickers and
// the Leinwand's board tiles) never ordered its query at all - so it came
// back in whatever order SQLite happened to store the rows in, not
// necessarily numeric either. Fixed with an explicit OrderBy(b => b.Number)
// there (and on the main event's Boards navigation), which is what the
// admin table's own sort above now also matches, rather than papering over
// it with a frontend-only fix.
describe('Board-Monitor pairing picker', () => {
  it('lists boards in numeric order (#2 before #10)', () => {
    login()
      .then((token) => createEvent(token, { name: 'Board-Monitor Order E2E', plannedBoardCount: 11 }))
      .then((event) => {
        cy.visit(`/?boardmonitor=${event.id}`)
        cy.get('button').filter(':contains("Board ")').eq(1).should('contain.text', 'Board 2')
        cy.get('button').filter(':contains("Board ")').eq(9).should('contain.text', 'Board 10')
        cy.get('button').filter(':contains("Board ")').eq(10).should('contain.text', 'Board 11')
      })
  })
})
