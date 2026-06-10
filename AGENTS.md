# AGENTS.md

## What this repo is

- Playwright **API tests** (TypeScript) for the `fis-common-standard-proxy` config-management API, its proxy runtime, and the `fis-common-transformer` service. Tests hit a live .NET/MongoDB backend and create real resources.
- **No browser/UI tests.** `tests/ui/` is an empty placeholder and Playwright browser tooling is intentionally disabled for the main agent (`opencode.json` → `tools: { "playwright*": false }`). The `playwright-test-*` subagents exist for UI authoring but are not used in normal API work.

## Commands

- `npm test` — run all specs against `BASE_URL` from `.env`.
- `npm run test:dev` — force `BASE_URL=http://localhost:5000`.
- `npm run report` — open the last HTML report.
- Single file / case: `npx playwright test <path>.spec.ts -g "TC-3.1"`.
- Typecheck (no npm script): `npx tsc --noEmit`.
- Format (no npm script): `npx prettier --write .` — 4-space indent, no semicolons, single quotes, es5 trailing commas (`.prettierrc`).
- No lint step. There is no committed CI workflow; CI behavior is driven by the `CI` env var (`playwright.config.ts`: retries=1, workers=2, otherwise serial).

## Path aliases (easy to get wrong)

From `tsconfig.json` `paths` — there is **no `helpers/` directory**; `@helpers/*` maps to `utils/*`. Use aliases in specs, not relative paths:

- `@fixtures` → `fixtures/index.ts`
- `@helpers/config`, `@helpers/auth.helper`, `@helpers/assertions.helper`, `@helpers/resource-tracker` → `utils/*`
- `@helpers/api-requests` → `utils/api-requests/index.ts` (typed API-client barrel)

## README.md is stale — do not trust it

`README.md` describes a layout and auth model that no longer exist (`tests/fixtures/`, `tests/helpers/`, `health.spec.ts`, relative imports, a static `TEST_TOKEN`). Trust the code. Real layout: specs under `tests/api/uap/...`, helpers in `utils/`, fixtures in `fixtures/`, API clients in `utils/api-requests/`, test plans in `specs/`.

## Auth (OAuth2 client-credentials, not a static token)

- `utils/token-manager.ts` POSTs to `AUTH_URL` (M2M `client_credentials`) and caches the token per worker.
- `hasToken()` (`utils/config.ts`) is true only when `AUTH_URL`, `AUTH_CLIENT_ID`, `AUTH_CLIENT_SECRET`, `AUTH_AUDIENCE` are all set.
- Authenticated tests guard with `test.skip(!hasToken(), 'OAuth credentials required')` and **auto-skip** when creds are absent — a green run does not mean the authed suites actually ran.

## Fixtures (`fixtures/api-request.fixture.ts`, import via `@fixtures`)

- `apiRequest` / `authedRequest` — function-scoped contexts for the config API.
- `transformerApiRequest` / `authedTransformerRequest` — same, against `TRANSFORMER_BASE_URL`.
- `workerAuthedRequest` / `workerAuthedTransformerRequest` — **worker-scoped**; use these inside `test.describe.serial` + `beforeAll` when seeding resources shared across cases.

## Resource tracking & DB cleanup (non-obvious workflow)

Tests create persistent Mongo documents; cleanup is semi-automated via `global-teardown.ts`:

- Pass a **spec tag** as the last arg to `create*` helpers to auto-register the resource, e.g. `createProvider(ctx, payload, 'delete-provider')` → calls `trackResource()`.
- Teardown reads the NDJSON tracker (`.test-run-resources.ndjson`) and writes/merges a runnable mongosh script per spec at `db-cleanup-scripts/mm-dd-yyyy-{spec}.js` (set `COLLECTION_PREFIX` before running: `''` / `'dev-'` / `'uat-'`).
- Type → collection: `provider`→providers, `integrator`→integrators, `api-config`→apis (api-versions & provider-endpoints are embedded subdocs), `mapper-config`→mapperConfigs, `transformer`→transformers.
- In-suite resources cleaned up in an `afterAll` are deliberately **not** given a spec tag (no auto-track). Only pass the tag when you want teardown to emit a cleanup script.

## Writing tests — conventions

- Import `{ test, expect }` from `@fixtures`; assert with `assertStatus` / `assertOk` / `assertJsonBody` from `@helpers/assertions.helper`.
- Prefer typed clients from `@helpers/api-requests` (`createProvider`, `createApiConfig`, `createApiVersion`, `createProviderEndpoint`, `createIntegrator`, transformer CRUD, …) over raw `ctx.get/post`.
- Build config-API URLs with the route prefix: `` `/${config.configApiBasePath}/...` `` (default `proxy-configs/v1`); transformer routes use `/transformers/v1/...`.
- Generate unique `name`/`proxyCode` per run (existing `uid()` pattern) to avoid collisions against a shared backend.
- Error bodies follow `ApiErrorBody` (`utils/api-requests/ApiErrorBody.ts`): `{ type, title, status, detail, errors }`.
- Keep each `specs/{name}.md` plan (TC-x.y cases) in sync with its matching `*.spec.ts`.

## Services & env (`.env`, copy from `.env.example`; `.env` is gitignored)

- `BASE_URL` (config API, default `:5000`), `PROXY_BASE_URL` (proxy runtime, `:5001`), `TRANSFORMER_BASE_URL` (`:5002`), `CONFIG_API_BASE_PATH` (`proxy-configs/v1`).
