# fis-proxy-api-tests

Playwright (TypeScript) **API tests** for the `fis-common-standard-proxy` config-management API, its proxy runtime, and the `fis-common-transformer` service. These are API tests only — there are no browser/UI tests.

## Prerequisites

- Node.js 18+ (the OAuth token fetch uses the global `fetch`) and npm 9+
- The target backend services running locally or reachable at your env URLs:
    - config-management API (`BASE_URL`, default `:5000`)
    - proxy runtime (`PROXY_BASE_URL`, default `:5001`) — only for proxy-routing tests
    - transformer service (`TRANSFORMER_BASE_URL`, default `:5002`) — only for transformer tests

## Setup

```bash
# Install dependencies
npm install

# Copy the env template and fill in values
cp .env.example .env
```

### `.env` configuration

`.env` is gitignored and must never be committed. Defaults come from `utils/config.ts`.

| Variable               | Required            | Description                                                            |
| ---------------------- | ------------------- | ---------------------------------------------------------------------- |
| `BASE_URL`             | Yes                 | Config-management API base URL (default `http://localhost:5000`)       |
| `PROXY_BASE_URL`       | Proxy tests         | Proxy runtime base URL (default `http://localhost:5001`)               |
| `TRANSFORMER_BASE_URL` | Transformer tests   | Transformer service base URL (`.env.example`: `http://localhost:5002`) |
| `CONFIG_API_BASE_PATH` | Yes                 | Config API route prefix (default `proxy-configs/v1`)                   |
| `AUTH_URL`             | Authenticated tests | OAuth2 token endpoint (M2M `client_credentials`)                       |
| `AUTH_CLIENT_ID`       | Authenticated tests | OAuth2 client id                                                       |
| `AUTH_CLIENT_SECRET`   | Authenticated tests | OAuth2 client secret                                                   |
| `AUTH_AUDIENCE`        | Authenticated tests | OAuth2 audience                                                        |

Authentication uses an OAuth2 **client-credentials** flow, not a static token — see [Authentication](#authentication). Authenticated suites **auto-skip** unless all four `AUTH_*` variables are set.

## Running tests

```bash
# Run all specs against BASE_URL from .env
npm test

# Force BASE_URL=http://localhost:5000 (overrides .env)
npm run test:dev

# Open the last HTML report
npm run report

# Run a single spec, or a single case by title
npx playwright test tests/api/uap/config-management/providers/delete-provider.spec.ts
npx playwright test tests/api/uap/config-management/providers/delete-provider.spec.ts -g "TC-3.1"
```

Target environment is selected purely by `BASE_URL` (and the other `*_BASE_URL` vars) in `.env` or the shell — there is no per-env config file.

### Typecheck & format

No npm scripts are wired for these; run the tools directly:

```bash
npx tsc --noEmit          # typecheck
npx prettier --write .    # format (4-space indent, no semicolons, single quotes, es5 commas)
```

### CI

There is no committed CI workflow. When the `CI` env var is set, `playwright.config.ts` enables `retries=1` and `workers=2` (otherwise serial). Provide `BASE_URL` and the `AUTH_*` variables as CI secrets; authenticated suites skip silently when credentials are absent, so a green run does **not** prove the authed suites ran.

## Project structure

```
playwright/
├── fixtures/                     # Playwright fixtures — import via "@fixtures"
│   ├── index.ts                  # Barrel: export { test, expect }
│   └── api-request.fixture.ts
├── utils/                        # Helpers — aliased as "@helpers/*"
│   ├── config.ts                 # Env-driven config object + hasToken()
│   ├── auth.helper.ts            # OAuth Authorization header helpers
│   ├── token-manager.ts          # client_credentials token fetch + per-worker cache
│   ├── assertions.helper.ts      # assertOk / assertStatus / assertJsonBody
│   ├── resource-tracker.ts       # NDJSON tracker feeding DB cleanup
│   └── api-requests/             # Typed API clients — "@helpers/api-requests"
│       ├── index.ts              # Barrel re-export
│       ├── ApiErrorBody.ts       # Error response shape
│       ├── uap/                  # providers, integrators, api-configs,
│       │                         #   api-versions, provider-endpoints, mappers
│       └── transformer/          # transformer CRUD + evaluate + xml/parse
├── tests/
│   ├── api/                      # API specs (uap/config-management, uap/proxy, transformer)
│   └── ui/                       # placeholder — no UI tests
├── specs/                        # Human-readable test plans (TC-x.y), one per spec file
├── db-cleanup-scripts/           # Generated mongosh cleanup scripts
├── global-teardown.ts            # Emits cleanup scripts from the resource tracker
├── playwright.config.ts
├── tsconfig.json                 # path aliases (see below)
├── .env.example
└── .gitignore
```

### Path aliases

Defined in `tsconfig.json` — **always import via these aliases, not relative paths.** Note there is no `helpers/` directory; `@helpers/*` resolves to `utils/*`:

| Alias                   | Resolves to                   |
| ----------------------- | ----------------------------- |
| `@fixtures`             | `fixtures/index.ts`           |
| `@helpers/config`       | `utils/config.ts`             |
| `@helpers/auth.helper`  | `utils/auth.helper.ts`        |
| `@helpers/api-requests` | `utils/api-requests/index.ts` |
| `@helpers/*`            | `utils/*`                     |

## Authentication

`utils/token-manager.ts` obtains a bearer token via an OAuth2 `client_credentials` (machine-to-machine) POST to `AUTH_URL` and caches it per Playwright worker (refreshing ~30s before expiry).

- `hasToken()` (`utils/config.ts`) is `true` only when `AUTH_URL`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, and `AUTH_AUDIENCE` are all set.
- Authenticated tests must guard so they skip cleanly without credentials:

```ts
import { test } from '@fixtures'
import { hasToken } from '@helpers/config'

test.beforeEach(() => {
    test.skip(!hasToken(), 'OAuth credentials required')
})
```

## Fixtures

Import `test` and `expect` from `@fixtures`. Authenticated fixtures inject a fresh/cached OAuth `Authorization` header.

| Fixture                          | Scope    | Target service | Auth         |
| -------------------------------- | -------- | -------------- | ------------ |
| `apiRequest`                     | function | config API     | none         |
| `authedRequest`                  | function | config API     | OAuth bearer |
| `transformerApiRequest`          | function | transformer    | none         |
| `authedTransformerRequest`       | function | transformer    | OAuth bearer |
| `workerAuthedRequest`            | worker   | config API     | OAuth bearer |
| `workerAuthedTransformerRequest` | worker   | transformer    | OAuth bearer |

Use the **worker-scoped** fixtures inside `test.describe.serial` + `beforeAll` when seeding resources shared across cases in a file.

## Adding tests

Prefer the typed clients in `@helpers/api-requests` (`createProvider`, `createApiConfig`, `createApiVersion`, `createProviderEndpoint`, `createIntegrator`, transformer CRUD, …) over raw `ctx.get/post`. Build config-API URLs with the route prefix; transformer routes use `/transformers/v1/...`.

```ts
import { test, expect } from '@fixtures'
import { assertOk, assertStatus } from '@helpers/assertions.helper'
import { config, hasToken } from '@helpers/config'
import { createProvider } from '@helpers/api-requests'

const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 5)
const PROVIDERS = `/${config.configApiBasePath}/providers`

test.describe('DELETE /providers/{id}', () => {
    test('TC-1.1 — 401 without an Authorization header', async ({
        apiRequest,
    }) => {
        const res = await apiRequest.delete(
            `${PROVIDERS}/68f064df1ba266b972ee56a0`
        )
        assertStatus(res, 401)
    })

    test.describe.serial('2. Authenticated', () => {
        test.beforeAll(() => {
            test.skip(!hasToken(), 'OAuth credentials required')
        })

        test('TC-2.1 — create then list', async ({ workerAuthedRequest }) => {
            // Pass a spec tag (last arg) to auto-register the resource for cleanup
            const { id } = await createProvider(
                workerAuthedRequest,
                {
                    name: `provider-${uid()}`,
                    description: 'demo',
                    proxyCode: `prov-${uid()}`,
                },
                'delete-provider'
            )
            const res = await workerAuthedRequest.get(PROVIDERS)
            const body = await assertOk(res)
            expect(body).toBeDefined()
            expect(id).toBeTruthy()
        })
    })
})
```

Conventions:

- Generate unique `name`/`proxyCode` per run (the `uid()` pattern) — the backend is shared, so collisions are real.
- Assert with `assertStatus` / `assertOk` / `assertJsonBody` from `@helpers/assertions.helper`.
- Error bodies follow `ApiErrorBody`: `{ type, title, status, detail, errors }`.
- Keep each `specs/{name}.md` plan (TC-x.y cases) in sync with its matching `*.spec.ts`.

## Resource tracking & DB cleanup

Tests create persistent MongoDB documents. Cleanup is semi-automated by `global-teardown.ts`:

1. Pass a **spec tag** as the last argument to a `create*` helper to register the created resource, e.g. `createProvider(ctx, payload, 'delete-provider')` → calls `trackResource()`.
2. Tracked resources are appended to an NDJSON file (`.test-run-resources.ndjson`) — safe for concurrent workers.
3. After the run, teardown writes/merges a runnable mongosh script per spec at `db-cleanup-scripts/mm-dd-yyyy-{spec}.js`. Set `COLLECTION_PREFIX` at the top of the script before running (`''` local / `'dev-'` / `'uat-'`), then run it with `mongosh` or paste it into Compass.

Resource type → MongoDB collection:

| Type            | Collection      | Notes                                                      |
| --------------- | --------------- | ---------------------------------------------------------- |
| `provider`      | `providers`     |                                                            |
| `integrator`    | `integrators`   |                                                            |
| `api-config`    | `apis`          | `api-versions` & `provider-endpoints` are embedded subdocs |
| `mapper-config` | `mapperConfigs` |                                                            |
| `transformer`   | `transformers`  | `fis-common-transformer` database                          |

Resources you delete yourself in an `afterAll` should **not** be given a spec tag — only tag resources you want teardown to emit a cleanup script for.
