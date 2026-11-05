import { execSync } from 'node:child_process'
import { defineConfig } from 'cypress'

export default defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5299',
    specPattern: 'cypress/e2e/**/*.cy.ts',
    supportFile: 'cypress/support/e2e.ts',
    defaultCommandTimeout: 8000,
    setupNodeEvents(on) {
      // Fires inside Cypress's own Node process (not the child process
      // running cypress/start-server.mjs), so - unlike that script's own
      // shutdown handlers, which Windows never lets run because the parent
      // force-kills the whole process tree - this reliably tears the
      // container down after `cypress run`. It does NOT fire when closing
      // an interactive `cypress open` window; that's fine, the next
      // `docker rm -fv` in start-server.mjs cleans up before the next run.
      on('after:run', () => {
        try {
          execSync('docker rm -fv letsplaydarts-cypress-e2e', { stdio: 'ignore' })
        } catch {
          // Nothing to remove - fine.
        }
      })
    },
  },
})
