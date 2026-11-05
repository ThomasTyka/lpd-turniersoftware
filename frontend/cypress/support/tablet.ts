/** Opens a Tablet directly pre-targeted at one board and confirms the pairing prompt. */
export function pairTablet(eventId: string, boardId: string) {
  cy.visit(`/?tablet=${eventId}&board=${boardId}`)
  cy.contains('button', 'Diesem Tablet zuordnen').click()
}

/** Types a score on the Tablet's on-screen number pad and submits it. */
export function enterScore(score: number) {
  for (const digit of String(score)) {
    cy.contains('button', new RegExp(`^${digit}$`)).click()
  }
  cy.contains('button', 'Wurf eintragen').click()
}
