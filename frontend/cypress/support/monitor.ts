/** Opens the Board-Monitor picker for an event and pairs to the named board (e.g. "Board 1"). */
export function pairMonitor(eventId: string, boardLabel: string) {
  cy.visit(`/?boardmonitor=${eventId}`)
  cy.contains('button', boardLabel).click()
}
