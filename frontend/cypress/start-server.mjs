import { execSync, spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

// Boots a throwaway backend for the Cypress suite in Docker, not via a
// plain `dotnet run`/`dotnet *.dll` - this project ships as a Docker image
// specifically because Windows Smart App Control blocks unsigned,
// locally-built binaries from running directly (see docker/Dockerfile,
// docker-compose.yml). A container started here is completely separate
// from the compose-managed deployment: its own name, its own host port
// (5299, vs. 8080 for dev/Docker), and - since no `-v` is passed - a fresh
// anonymous volume every run, so the SQLite file is always empty at the
// start of a test run.
const IMAGE = 'letsplaydarts-cypress-e2e'
const CONTAINER = 'letsplaydarts-cypress-e2e'
const PORT = 5299

const frontendRoot = path.dirname(fileURLToPath(import.meta.url)).replace(/[\\/]cypress$/, '')
const repoRoot = path.resolve(frontendRoot, '..')

console.log('[cypress-e2e] Building Docker image (letsplaydarts-cypress-e2e)...')
execSync(`docker build -f docker/Dockerfile -t ${IMAGE} .`, { cwd: repoRoot, stdio: 'inherit' })

console.log('[cypress-e2e] Removing any leftover container...')
try {
  execSync(`docker rm -fv ${CONTAINER}`, { stdio: 'ignore' })
} catch {
  // Nothing to remove - fine.
}

console.log(`[cypress-e2e] Starting container on http://localhost:${PORT} ...`)
execSync(
  [
    'docker run -d',
    `--name ${CONTAINER}`,
    `-p ${PORT}:8080`,
    // Throwaway credentials, only ever protecting this throwaway,
    // ephemeral-volume test database - never used against real data.
    '-e Auth__Username=e2e',
    '-e Auth__PasswordHash=100000.S29c8WcOpukxHIE7ROLlUg==.FC8jOAzpm13P2UDpsi78KDfbzyzsBtEbJt+HUquGNqk=',
    '-e Auth__JwtSigningKey=L8jWJI4oMHA7u0umNGWPsekpsXI9zdkf1Dt2AtI5q1H4TicHVgTyeWT0pQns1TjZ',
    IMAGE,
  ].join(' '),
  { cwd: repoRoot, stdio: 'inherit' },
)

// Keep this process alive (streaming the container's logs) so
// start-server-and-test sees a running "server". Actual container cleanup
// happens in cypress.config.ts's after:run hook for `npm run e2e` (that
// hook runs inside Cypress's own long-lived Node process, not this child
// one) - the `docker rm -fv` above is what makes an interactive
// `cypress open` session (which has no equivalent single teardown moment)
// self-healing on its next run instead.
spawn('docker', ['logs', '-f', CONTAINER], { stdio: 'inherit' })
