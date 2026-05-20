# fis-proxy-api-tests

Playwright TypeScript API tests for `fis-common-standard-proxy`.

## Prerequisites

- Node.js 18+
- npm 9+
- The `fis-common-standard-proxy` API running locally or accessible at your target env URL

## Setup

```bash
# Install dependencies
npm install

# Copy env template and fill in values
cp .env.example .env
```

### `.env` configuration

| Variable        | Required | Description                                                     |
| --------------- | -------- | --------------------------------------------------------------- |
| `BASE_URL`      | Yes      | API base URL (default: `http://localhost:5000`)                 |
| `TEST_TOKEN`    | Optional | Pre-generated JWT bearer token. Leave empty to skip auth tests. |
| `AUTH_ISSUER`   | Optional | Auth0 issuer URL (future dynamic token fetch)                   |
| `AUTH_AUDIENCE` | Optional | Auth0 audience (future dynamic token fetch)                     |

## Running Tests

```bash
# Run all tests against BASE_URL from .env
npm test

# Run against local dev API (overrides BASE_URL)
npm run test:dev

# Show HTML report after run
npm run report
```

### CI usage

Set `BASE_URL` and (optionally) `TEST_TOKEN` as environment variables.
Authenticated test suites auto-skip when `TEST_TOKEN` is not set.

```bash
BASE_URL=https://your-api.example.com TEST_TOKEN=eyJhbGci... npm test
```

## Project Structure

```
playwright/
├── tests/
│   ├── fixtures/
│   │   ├── index.ts                  # Barrel re-export
│   │   └── api-request.fixture.ts    # apiRequest + authedRequest contexts
│   ├── helpers/
│   │   ├── config.ts                 # Env-driven config object
│   │   ├── auth.helper.ts            # Auth header helpers
│   │   └── assertions.helper.ts     # Typed response assertion wrappers
│   ├── health.spec.ts                # GET /health smoke tests
│   ├── auth.spec.ts                  # 401/403 rejection tests
│   └── proxy-config.spec.ts          # Authenticated proxy config tests
├── playwright.config.ts
├── tsconfig.json
├── package.json
├── .env.example
└── .gitignore
```

## Adding Tests

Import fixtures from the barrel:

```ts
import { test, expect } from './fixtures'
import { assertOk, assertStatus } from './helpers/assertions.helper'
import { hasToken } from './helpers/config'

test.describe('My Feature', () => {
    test('GET /my-endpoint returns 200', async ({ apiRequest }) => {
        const response = await apiRequest.get('/my-endpoint')
        assertStatus(response, 200)
    })

    test('authenticated request', async ({ authedRequest }) => {
        test.skip(!hasToken(), 'TEST_TOKEN required')
        const response = await authedRequest.post('/my-endpoint', {
            data: { key: 'value' },
        })
        const body = await assertOk(response)
        expect(body).toBeDefined()
    })
})
```

## Fixtures

| Fixture         | Auth                | Use for                         |
| --------------- | ------------------- | ------------------------------- |
| `apiRequest`    | None                | Public endpoints, 401/403 tests |
| `authedRequest` | `Bearer TEST_TOKEN` | Protected endpoints             |
