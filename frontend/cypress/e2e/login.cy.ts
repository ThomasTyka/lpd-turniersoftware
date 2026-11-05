import { E2E_USERNAME, E2E_PASSWORD } from '../support/api'

describe('Regie login', () => {
  it('shows the event list', () => {
    cy.visit('/')
    cy.contains('label', 'Benutzername').find('input').type(E2E_USERNAME)
    cy.contains('label', 'Passwort').find('input[type="password"]').type(E2E_PASSWORD)
    cy.contains('button', 'Anmelden').click()

    cy.contains('h1', 'Events').should('be.visible')
  })

  it('rejects a wrong password', () => {
    cy.visit('/')
    cy.contains('label', 'Benutzername').find('input').type(E2E_USERNAME)
    cy.contains('label', 'Passwort').find('input[type="password"]').type('definitely-wrong')
    cy.contains('button', 'Anmelden').click()

    cy.contains('h1', 'Events').should('not.exist')
  })
})
