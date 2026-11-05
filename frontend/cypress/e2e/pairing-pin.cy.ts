import { login, createEvent } from '../support/api'

describe('Tablet pairing PIN', () => {
  it('blocks a wrong PIN and re-prompts, then pairs on the fixed PIN', () => {
    login()
      .then((token) => createEvent(token, { name: 'Pairing PIN E2E', plannedBoardCount: 1 }))
      .then((event) => {
        const boardId = event.boards[0].id

        cy.visit(`/?tablet=${event.id}&board=${boardId}`)
        cy.contains('h1', 'PIN erforderlich').should('be.visible')
        // Not pairable yet without it.
        cy.contains('button', 'Diesem Tablet zuordnen').should('not.exist')

        cy.get('input[placeholder="PIN"]').type('0000')
        cy.contains('button', 'Weiter').click()

        // The PIN is only actually checked server-side once pairing is
        // attempted, so a wrong one still reaches the normal confirmation
        // screen first - only rejected, and re-prompted, on this click.
        cy.contains('button', 'Diesem Tablet zuordnen').click()
        cy.contains('Falscher PIN.').should('be.visible')
        cy.contains('h1', 'PIN erforderlich').should('be.visible')

        // .clear() first - the failed attempt's "0000" is still sitting in
        // the field (nothing in the app resets pinInput itself, only pin
        // and its localStorage entry), so a bare .type() would append and
        // send "00004719" instead of "4719".
        cy.get('input[placeholder="PIN"]').clear().type('4719')
        cy.contains('button', 'Weiter').click()
        cy.contains('button', 'Diesem Tablet zuordnen').click()

        // Paired: the Tablet's own game-start screen loads.
        cy.contains('Verfügbare Spieler').should('be.visible')
      })
  })
})
