# Test Plan: DELETE /mappers/{mapperConfigId}

**Endpoint:** `DELETE /mappers/{mapperConfigId}`
**Method:** DELETE
**Scope required:** `write:configs`
**Spec file:** `tests/api/config-management/mapper-configs/delete-mapper-config.spec.ts`

---

## Overview

As an FIS admin I want to soft-delete a mapper config so I can remove stale or incorrect mapper
configurations without database access. The operation is a **soft delete** — the record is flagged
as deleted and retained in the database, but every read/write path treats it as non-existent.
Deleting a MapperConfig **cascade soft-deletes** all associated MapperConfigSnapshot records.

**Out of scope:** Audit log writes are verified by backend unit tests, not by this Playwright suite.

## Setup fixtures (per serial suite that needs real resources)

1. **Provider** — `createProvider(...)` with a unique `proxyCode`.
2. **ApiConfig** — `createApiConfig(...)`. Captures `apiConfigId`.
3. **ApiVersion** — `createApiVersion(apiConfigId, ...)`. Captures `apiVersionId`.
4. **ProviderApiEndpoint** — `createProviderEndpoint(...)` referencing provider's `proxyCode`.
   Captures `providerApiEndpointId`.
5. **Integrator** — `createIntegrator(...)` with `allowedProviderProxyCodes` matching provider's
   `proxyCode`. Captures `integratorId`.
6. **MapperConfig** — `createMapperConfig(...)` with `integratorId`, `apiVersionId`,
   `providerApiEndpointId`. Captures `mapperConfigId`.
7. **MapperSnapshots** — `createMapperSnapshot(mapperConfigId, ...)` as needed per suite.

All resources are created via the typed `@helpers/api-requests` builders with
`autoTrack = 'delete-mapper-config'` so global teardown writes a mongosh cleanup script.

## Teardown notes

- `Provider`, `ApiConfig`, and `Integrator` are auto-tracked via the resource-tracker NDJSON;
  `global-teardown.ts` emits `db-cleanup-scripts/mm-dd-yyyy-delete-mapper-config.{js,json}`.
- `MapperConfig` is auto-tracked when `createMapperConfig` is called with `SPEC_TAG`. Cascade-deleted
  snapshots do not need separate tracking.
- No explicit `afterAll` is required in suites where all resources are auto-tracked.

## Constants

| Constant         | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| `SPEC_TAG`       | `'delete-mapper-config'`                                  |
| `NONEXISTENT_ID` | `'68f064df1ba266b972ee56a0'` (well-formed ObjectId, no matching document) |
| `mappersPath`    | `` `/${config.configApiBasePath}/mappers` ``              |

---

## 1. Unauthenticated — always runs (no token required)

### TC-1.1 — Returns 401 when no Authorization header is provided

**Steps:**

1. Send `DELETE /mappers/{NONEXISTENT_ID}` with no Authorization header.

**Expected:** HTTP 401.

---

### TC-1.2 — Returns 401 or 403 when Authorization header carries an invalid token

**Steps:**

1. Send `DELETE /mappers/{NONEXISTENT_ID}` with `Authorization: Bearer invalid-token-xyz`.

**Expected:** HTTP 401 or 403.

---

### TC-1.3 — Returns 403 when token lacks `write:configs` scope (skip if untestable)

**Steps:**

1. If the suite has a way to mint a token without `write:configs` (separate M2M client), call the
   endpoint with that token against `NONEXISTENT_ID`.
2. Otherwise `test.skip(...)` — the default M2M client used by `workerAuthedRequest` has all scopes.

**Expected:** HTTP 403.

---

## 2. Authenticated — ID resolution errors

`test.describe.serial`. `test.skip(!hasToken(), 'OAuth credentials required')` guard inside `beforeAll`.
No real resources are created in this suite — `NONEXISTENT_ID` is sufficient for both cases.

### TC-2.1 — Returns 404 for a non-existent mapperConfigId

**Steps:**

1. Send `DELETE /mappers/{NONEXISTENT_ID}`.

**Expected:** HTTP 404.

---

### TC-2.2 — Returns 400 with `General.Validation` error for a malformed mapperConfigId

**Steps:**

1. Send `DELETE /mappers/not-a-valid-id`.

**Expected:**

- HTTP 400.
- Parsed body conforms to `ApiErrorBody`:
  - `body.title === 'General.Validation'`
  - `body.status === 400`
  - `body.type` contains `'rfc9110'`
  - `body.detail` is truthy
  - `body.errors` is not `null`

---

## 3. Successful soft delete — 200 + cascade + side effects

`test.describe.serial`. Create a full hierarchy in `beforeAll`: provider → api-config → api-version →
endpoint → integrator → mapper-config → **2 snapshots**. The API auto-sets the latest snapshot as
active, so by the time `DELETE` is called the mapper config has an active snapshot — this implicitly
exercises the "cascade includes the active snapshot" path. Run TC-3.1 → TC-3.6 in order.

### TC-3.1 — Returns 200 with empty body

**Precondition:** Fresh mapper config with 2 snapshots (second is active).

**Steps:**

1. `DELETE /mappers/{mapperConfigId}`.

**Expected:**

- HTTP 200.
- Response body is empty string (`await response.text()` returns `''`).

---

### TC-3.2 — Soft-deleted MapperConfig is excluded from GET /mappers

**Precondition:** `mapperConfigId` was soft-deleted in TC-3.1.

**Steps:**

1. `getMapperConfigs(workerAuthedRequest)`.

**Expected:** HTTP 200, the returned array does not contain an item with `id === mapperConfigId`.

---

### TC-3.3 — PUT /mappers/{id} returns 404 for a soft-deleted MapperConfig

**Precondition:** `mapperConfigId` was soft-deleted in TC-3.1.

**Steps:**

1. `PUT /{configApiBasePath}/mappers/{mapperConfigId}` with body `{ isActive: false }`.

**Expected:** HTTP 404.

---

### TC-3.4 — Re-deleting a soft-deleted MapperConfig returns 404

**Precondition:** `mapperConfigId` was soft-deleted in TC-3.1.

**Steps:**

1. `DELETE /mappers/{mapperConfigId}` again.

**Expected:** HTTP 404.

---

### TC-3.5 — Cascade: child snapshots are soft-deleted

**Precondition:** `mapperConfigId` was soft-deleted in TC-3.1. Two snapshots were created in `beforeAll`.

**Steps:**

1. `GET /{configApiBasePath}/mappers/{mapperConfigId}/snapshots` (raw request, parent is soft-deleted).

**Expected:** `expect([200, 404]).toContain(response.status())`.

- If `404`: the router correctly treats the soft-deleted parent as non-existent — cascade is implied.
- If `200`: the returned array must be empty (`items` has length 0 or the array is empty).

**Rationale:** The exact routing behavior is implementation-dependent. Either result correctly
satisfies the cascade requirement; the test documents which path the API takes without being
over-specified.

---

### TC-3.6 — Runtime enum lookup returns 404 for a soft-deleted MapperConfig

**Precondition:** `mapperConfigId` was soft-deleted in TC-3.1. `providerApiEndpointId` and
`integratorId` are available from `beforeAll`.

**Steps:**

1. `GET /{configApiBasePath}/mappers/{providerApiEndpointId}/{integratorId}`.

**Expected:** HTTP 404. The runtime enum mapping must exclude soft-deleted records.

---

## 4. Uniqueness bypass — re-create with same endpoint combination after soft-delete

`test.describe.serial`. Create a fresh full hierarchy in `beforeAll`. Create a mapper config for a
specific `(integratorId, apiVersionId, providerApiEndpointId)` combination, then soft-delete it.

> **Note:** The negative case (duplicate rejected while the mapper config is active) is not asserted
> here — it belongs to the `create-mapper-config` spec. If no such spec exists yet, consider adding
> `TC-4.0` as a precondition verification step.

### TC-4.1 — POST /mappers with the same combination succeeds after soft-delete

**Precondition:**

- `deletedMapperConfigId` soft-deleted (DELETE returned 200) in `beforeAll`.
- Same `integratorId`, `apiVersionId`, `providerApiEndpointId` available.

**Steps:**

1. `POST /{configApiBasePath}/mappers` with
   `{ integratorId, apiVersionId, providerApiEndpointId, requestFields: [], responseFields: [] }`.

**Expected:**

- HTTP 200 or 201.
- Response body contains a new `id` distinct from `deletedMapperConfigId`.

---

## Suites covered

| Suite | Description                                                                              | Auth required | Notes                                                          |
| ----- | ---------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------------------- |
| 1     | Unauthenticated — 401 / invalid token / missing scope                                    | No            | TC-1.3 skipped (scope non-testable with default client)        |
| 2     | Authenticated — ID resolution errors (non-existent, malformed)                           | Yes           | `test.describe.serial`; no real resources needed               |
| 3     | Successful soft delete + GET exclusion + PUT 404 + re-delete 404 + cascade + runtime enum | Yes          | `test.describe.serial`; TC-3.5 accepts 200 (empty) or 404     |
| 4     | Uniqueness bypass — same combination create succeeds after soft-delete                   | Yes           | `test.describe.serial`; negative case deferred to create spec  |
