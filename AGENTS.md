# AGENTS.md — fis-proxy-api-tests

Playwright TypeScript **API-only** test suite for `fis-common-standard-proxy`. No browser is launched; all tests use `APIRequestContext`.

## Setup

```bash
npm install
cp .env.example .env   # fill in values
```

Required `.env` variables — all four OAuth vars must be set for authenticated suites to run (`hasToken()` in `utils/config.ts` checks these four only; `BASE_URL` has a default):

| Variable             | Default / Purpose                                 |
| -------------------- | ------------------------------------------------- |
| `BASE_URL`           | `http://localhost:5000` — config management API root |
| `PROXY_BASE_URL`     | `http://localhost:5001` — proxy server (runtime routing) |
| `CONFIG_API_BASE_PATH` | `proxy-configs/v1` — config management prefix  |
| `AUTH_URL`           | OAuth token endpoint (no default, required)       |
| `AUTH_CLIENT_ID`     | M2M client ID                                     |
| `AUTH_CLIENT_SECRET` | M2M client secret                                 |
| `AUTH_AUDIENCE`      | OAuth audience                                    |

Auth is M2M client credentials via `utils/token-manager.ts`. Authenticated suites skip via `test.skip(!hasToken(), ...)` when any of the four OAuth vars are empty.

## Commands

```bash
npm test                  # run all tests using BASE_URL from .env
npm run test:dev          # force BASE_URL=http://localhost:5000
npm run test:uat          # run all tests (BASE_URL must be set in .env or env)
npm run test:prod         # run all tests (BASE_URL must be set in .env or env)
npm run report            # open last HTML report
npx playwright test tests/api/config-management/providers/delete-provider.spec.ts  # single file
npx playwright test --grep "returns 404"   # filter by test name
npx prettier --write .    # format before committing
```

## Project structure

```
fixtures/                          # api-request.fixture.ts + index.ts barrel (ROOT level, NOT inside tests/)
utils/
  config.ts                        # env-driven config + hasToken()
  auth.helper.ts                   # getAuthHeaders(), getOptionalAuthHeaders(), makeAuthedContext()
  assertions.helper.ts             # assertOk(), assertStatus(), assertJsonBody()
  token-manager.ts                 # per-worker cached OAuth token + invalidateToken()
  resource-tracker.ts              # trackResource() → NDJSON; consumed by global-teardown
  api-requests/                    # typed CRUD request builders (barrel: utils/api-requests/index.ts)
    ApiErrorBody.ts                # ApiErrorBody interface — import for typed error assertions
    providers/
    integrators/
    api-configs/
    api-versions/
    provider-endpoints/
    mappers/
tests/
  api/
    config-management/providers/
      delete-provider.spec.ts      # reference implementation — read this before writing a new spec
    proxy/                         # placeholder (empty)
  ui/                              # placeholder (empty)
specs/                             # test-plan markdown files (input to playwright-test-generator agent)
db-cleanup-scripts/                # auto-generated mongosh scripts from global teardown
global-teardown.ts                 # reads resource-tracker NDJSON, writes cleanup .js + .json per spec
.opencode/prompts/                 # system prompts for the three subagents
```

## tsconfig path aliases

The `tsconfig.json` maps (correct, not stale):
- `@fixtures` → `fixtures/index.ts`
- `@fixtures/*` → `fixtures/*`
- `@helpers/*` → `utils/*`

Playwright 1.60+ resolves these aliases. **Utility modules and fixtures use `@helpers/*` internally.** Spec files currently use relative imports for `fixtures` and `utils` (e.g. `'../../../../fixtures'`), but `@helpers/*` also works. Use `@helpers/api-requests/ApiErrorBody` to import the error type:

```ts
import { ApiErrorBody } from '@helpers/api-requests/ApiErrorBody'
```

Typical spec imports (from `tests/api/config-management/providers/`):

```ts
import { test, expect } from '../../../../fixtures'
import { assertStatus } from '../../../../utils/assertions.helper'
import { config, hasToken } from '../../../../utils/config'
import { createProvider, deleteProvider } from '../../../../utils/api-requests'
import { ApiErrorBody } from '@helpers/api-requests/ApiErrorBody'
// makeAuthedContext — only needed if you require a one-off context outside a fixture (rare)
// trackResource   — only needed for resources created outside createProvider/createIntegrator/createApiConfig
```

## Fixtures

| Fixture               | Scope  | Auth                     | Use for                                      |
| --------------------- | ------ | ------------------------ | -------------------------------------------- |
| `apiRequest`          | test   | None                     | Unauthenticated / 401/403 tests              |
| `authedRequest`       | test   | Bearer token (M2M OAuth) | Protected endpoints (single test)            |
| `workerAuthedRequest` | worker | Bearer token (M2M OAuth) | `beforeAll`/`afterAll` and serial suites     |

Tokens are cached per worker and refreshed 30 s before expiry. No manual token wiring needed.

`workerAuthedRequest` is created once per worker (spec file) and disposed automatically — use it instead of the `let ctx / makeAuthedContext / ctx.dispose()` pattern in serial suites.

## Writing tests

Structure every spec with:

1. **Unauthenticated suite** — always runs, no skip guard.
2. **Authenticated suite** — guard with `test.skip(!hasToken(), '...')` in `beforeEach`.
3. **Serial suites with shared state** — use `test.describe.serial(...)` + `beforeAll` to create fixtures once; put cleanup in `afterAll`. The skip guard goes inside `beforeAll` (not `beforeEach`) for serial suites.

For serial suites that need an authenticated context across `beforeAll`/`afterAll`, use the `workerAuthedRequest` fixture — no manual `ctx` lifecycle needed:

```ts
test.describe.serial('...', () => {
    test.beforeAll(async ({ workerAuthedRequest }) => {
        test.skip(!hasToken(), 'OAuth credentials required')
        // use workerAuthedRequest directly
    })
})
```

If you need a one-off context outside a fixture (rare), `makeAuthedContext` is still available:

```ts
import { makeAuthedContext } from '../../../../utils/auth.helper'

let ctx: APIRequestContext

test.beforeAll(async ({ playwright }) => {
    test.skip(!hasToken(), 'OAuth credentials required')
    ctx = await makeAuthedContext(playwright)
})

test.afterAll(async () => {
    if (ctx) await ctx.dispose()
})
```

Track any resources created during the test run so global teardown can generate a mongosh cleanup script. Pass `autoTrack` as the third argument to `createProvider`, `createIntegrator`, or `createApiConfig` — `trackResource` is called automatically:

```ts
// autoTrack = base filename without .spec.ts
const { id } = await createProvider(ctx, payload, 'my-spec')
```

To track manually (e.g. for resources created outside these helpers):

```ts
import { trackResource } from '../../../../utils/resource-tracker'

trackResource({ id: created.id, type: 'provider', description: payload.name, spec: 'my-spec' })
// type must be: 'provider' | 'integrator' | 'api-config'
// spec = base filename without .spec.ts (used for db-cleanup-scripts/{date}-{spec}.js)
```

Use typed request builders instead of inline `ctx.post(...)` calls:

```ts
import { createProvider, updateProvider, deleteProvider } from '../../../../utils/api-requests'

const { id } = await createProvider(ctx, { name: 'Test', description: '...', proxyCode: 'test' }, 'my-spec')
await deleteProvider(ctx, id)
```

Use `config.configApiBasePath` to build paths — do not hardcode the prefix string:

```ts
const PROVIDERS_PATH = `/${config.configApiBasePath}/providers`
```

Error response shape from the API (`errors` is `null` for domain-level errors, not an array):

```ts
{
    type: string       // RFC 9110 URI
    title: string      // e.g. 'Provider.HasActiveEndpoints'
    status: number
    detail: string
    errors: Array<{ errorCode: string; errorDescription: string }> | null
}
```

Use a well-formed but non-existent ObjectId for 404/401 tests: `68f064df1ba266b972ee56a0`.

## Cleanup scripts

After each test run, `global-teardown.ts` reads the resource tracker NDJSON and writes/merges:
- `db-cleanup-scripts/mm-dd-yyyy-{spec}.js` — runnable `mongosh` script
- `db-cleanup-scripts/mm-dd-yyyy-{spec}.json` — state file (enables re-run merging)

Set `COLLECTION_PREFIX` in the script before running (`''` = local dev, `'dev-'` = dev env, `'uat-'` = UAT).

MongoDB collection map: `provider` → `providers`, `integrator` → `integrators`, `api-config` → `apis` (ApiVersions + ProviderApiEndpoints are embedded subdocs — deleting the api-config document removes them).

## OpenCode subagents

Three specialised subagents are configured in `opencode.json`. The Playwright MCP server (`playwright-test`) is globally disabled (`"tools": { "playwright*": false }`) and selectively re-enabled inside each subagent via explicit tool entries.

| Agent                       | Trigger                                                 |
| --------------------------- | ------------------------------------------------------- |
| `playwright-test-generator` | Generate a new spec from a plan in `specs/`             |
| `playwright-test-healer`    | Debug and fix a failing spec                            |
| `playwright-test-planner`   | Create a test plan markdown file for a feature/endpoint |

## Style

Prettier enforces: 4-space indent, no semicolons, single quotes, trailing commas (`es5`). Run with `npx prettier --write .` before committing. `.prettierignore` excludes reports and lock files.

TypeScript is strict with `ignoreDeprecations: "6.0"` (required for the TS 6 dependency).

## CI notes

- Retries once on failure when `CI=true`.
- Stops the run after 5 failures (`maxFailures: 5`).
- Workers capped at 2 on CI.
- `HTTPS` errors are **not** ignored (`ignoreHTTPSErrors: false`).
- `actionTimeout` is 15 s per API call; `timeout` is 30 s per test.
