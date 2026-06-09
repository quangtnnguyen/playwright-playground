# Test Plan: DELETE /mappers/{mapperConfigId}/snapshots/{snapshotId}

**Endpoint:** `DELETE /mappers/{mapperConfigId}/snapshots/{snapshotId}`
**Method:** DELETE
**Scope required:** `write:configs`
**Spec file:** `tests/api/config-management/mapper-configs/delete-mapper-config-snapshot.spec.ts`

---

## Overview

As an FIS admin I want to soft-delete a mapper config snapshot so I can remove stale or incorrect snapshot
configurations without database access. The operation is a **soft delete** — the record is flagged as deleted
with a timestamp and retained in the database, but every read / write path must treat it as non-existent.
Deleting the **active** snapshot is blocked; it must be deactivated first.

## Setup fixtures (per serial suite that needs real resources)

1. **Provider** — `createProvider(...)` with a unique `proxyCode`. Required so the provider endpoint can
   reference it via `providerProxyConfig.proxyCodeValues`.
2. **ApiConfig** — `createApiConfig(...)`. Captures `apiConfigId`.
3. **ApiVersion** — `createApiVersion(apiConfigId, ...)` with `prefixPath`, `httpMethod`, `isActive`,
   `allowedScopes`, `schemaValidators: []`. Captures `apiVersionId`.
4. **ProviderApiEndpoint** — `createProviderEndpoint(apiConfigId, apiVersionId, ...)` with `providerProxyConfig`
   pointing at the provider's `proxyCode`, and a minimal `authRequest` (`authType: 'Anonymous'`). Captures
   `providerApiEndpointId`.
5. **Integrator** — `createIntegrator(...)` with `allowedProviderProxyCodes` matching the provider's `proxyCode`.
   Captures `integratorId`. TC-2 requires **two** integrators because the
   `(integratorId, apiVersionId, providerApiEndpointId)` combination must be unique per mapper config.
6. **MapperConfig** — `createMapperConfig(...)` with `integratorId`, `apiVersionId`, `providerApiEndpointId`.
   Captures `mapperConfigId`.
7. **MapperSnapshot** — `createMapperSnapshot(mapperConfigId, ...)` with empty `requestFields` and
   `responseFields`. Captures `snapshotId`.

All resources are created via the typed `@helpers/api-requests` builders with
`autoTrack = 'delete-mapper-config-snapshot'` so global teardown writes a mongosh cleanup script.

## Teardown notes

- `Provider`, `ApiConfig`, and `Integrator` are auto-tracked via the resource-tracker NDJSON;
  `global-teardown.ts` emits `db-cleanup-scripts/mm-dd-yyyy-delete-mapper-config-snapshot.{js,json}`.
- `MapperConfig` is auto-tracked when `createMapperConfig` is called with `SPEC_TAG`. Snapshots are embedded
  or referenced within the mapper config and do not need separate tracking.
- No explicit `afterAll` is required in suites where all resources are auto-tracked.
- TC-3 creates two snapshots; the non-active one is soft-deleted during the test. The active one remains until
  the mapper config is cleaned up via the auto-tracker.

## Constants

| Constant         | Value                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------ |
| `SPEC_TAG`       | `'delete-mapper-config-snapshot'`                                                                |
| `NONEXISTENT_ID` | `'68f064df1ba266b972ee56a0'` (well-formed ObjectId, no matching document)                        |
| `snapshotsPath`  | `` (mapperConfigId: string) => `/${config.configApiBasePath}/mappers/${mapperConfigId}/snapshots` `` |

---

## 1. Unauthenticated — always runs (no token required)

### TC-1.1 — Returns 401 when no Authorization header is provided

**Steps:**

1. Send `DELETE /mappers/{NONEXISTENT_ID}/snapshots/{NONEXISTENT_ID}` with no Authorization header.

**Expected:** HTTP 401.

---

### TC-1.2 — Returns 401 or 403 when Authorization header carries an invalid token

**Steps:**

1. Send `DELETE /mappers/{NONEXISTENT_ID}/snapshots/{NONEXISTENT_ID}` with
   `Authorization: Bearer invalid-token-xyz`.

**Expected:** HTTP 401 or 403.

---

### TC-1.3 — Returns 403 when token lacks `write:configs` scope (skip if untestable)

**Steps:**

1. If the suite has a way to mint a token without `write:configs` (separate M2M client), call the endpoint with
   that token against a `NONEXISTENT_ID` path.
2. Otherwise `test.skip(...)` — the default M2M client used by `workerAuthedRequest` has all scopes.

**Expected:** HTTP 403.

---

## 2. Authenticated — ID resolution errors

`test.describe.serial`. Create a shared hierarchy in `beforeAll`: one provider, one api-config, one api-version,
one endpoint, **two** integrators, two mapper configs, one snapshot per mapper config.

`test.skip(!hasToken(), 'OAuth credentials required')` guard inside `beforeAll`.

### TC-2.1 — Returns 404 for a non-existent `mapperConfigId`

**Steps:**

1. Send `DELETE /mappers/{NONEXISTENT_ID}/snapshots/{NONEXISTENT_ID}`.

**Expected:** HTTP 404.

---

### TC-2.2 — Returns 404 for a non-existent `snapshotId` within a real mapperConfig

**Precondition:** A real `mapperConfig1` exists.

**Steps:**

1. Send `DELETE /mappers/{mapperConfig1Id}/snapshots/{NONEXISTENT_ID}`.

**Expected:** HTTP 404.

---

### TC-2.3 — Returns 400 with `General.Validation` error for a malformed `mapperConfigId`

**Steps:**

1. Send `DELETE /mappers/not-a-valid-id/snapshots/{NONEXISTENT_ID}`.

**Expected:**

- HTTP 400.
- Parsed body conforms to `ApiErrorBody`:
  - `body.title === 'General.Validation'`
  - `body.status === 400`
  - `body.type` contains `'rfc9110'`
  - `body.detail` is truthy
  - `body.errors` is not `null`

---

### TC-2.4 — Returns 400 with `General.Validation` error for a malformed `snapshotId`

**Steps:**

1. Send `DELETE /mappers/{mapperConfig1Id}/snapshots/not-a-valid-id`.

**Expected:**

- HTTP 400.
- Parsed body conforms to `ApiErrorBody`:
  - `body.title === 'General.Validation'`
  - `body.status === 400`
  - `body.type` contains `'rfc9110'`
  - `body.detail` is truthy
  - `body.errors` is not `null`

---

### TC-2.5 — Returns 404 when `snapshotId` belongs to a different `mapperConfig`

**Precondition:** `snapshot2` was created under `mapperConfig2`.

**Steps:**

1. Send `DELETE /mappers/{mapperConfig1Id}/snapshots/{snapshot2Id}`.

**Expected:** HTTP 404. The snapshot must not be deleted; it belongs to a different mapper config.

---

## 3. Successful soft delete — 200 + side effects

`test.describe.serial`. Create a fresh full hierarchy in `beforeAll`: two snapshots under one mapper config.
Set `snapshot1` as the active snapshot, leave `snapshot2` non-active. Run TC-3.1 → TC-3.4 in order against
`snapshot2Id`.

### TC-3.1 — Returns 200 with empty body

**Precondition:** Fresh mapper config with a non-active snapshot.

**Steps:**

1. `DELETE /mappers/{mapperConfigId}/snapshots/{deletedSnapshotId}`.

**Expected:**

- HTTP 200.
- Response body is empty string (`await response.text()` returns `''`).

---

### TC-3.2 — Soft-deleted snapshot is excluded from `GET /mappers/{id}/snapshots`

**Precondition:** `deletedSnapshotId` was soft-deleted in TC-3.1.

**Steps:**

1. `getMapperSnapshots(workerAuthedRequest, mapperConfigId)`.

**Expected:** HTTP 200, the returned array does not contain an item with `id === deletedSnapshotId`.

---

### TC-3.3 — Re-deleting a soft-deleted snapshot returns 404

**Precondition:** `deletedSnapshotId` was soft-deleted in TC-3.1.

**Steps:**

1. `DELETE /mappers/{mapperConfigId}/snapshots/{deletedSnapshotId}` again.

**Expected:** HTTP 404.

---

### TC-3.4 — `PUT /mappers/{id}` with soft-deleted `activeMapperConfigSnapshotId` returns 400 or 404

**Precondition:** `deletedSnapshotId` was soft-deleted in TC-3.1.

**Steps:**

1. `PUT /{configApiBasePath}/mappers/{mapperConfigId}` with body
   `{ activeMapperConfigSnapshotId: deletedSnapshotId }`.

**Expected:** `expect([400, 404]).toContain(response.status())` — the API should reject a soft-deleted
snapshot as the active reference. Exact status depends on whether the API validates on write or resolves on
read; both signal the snapshot is non-existent.

---

## 4. Block delete — snapshot is the active snapshot

`test.describe.serial`. Create a fresh full hierarchy in `beforeAll`. Create one snapshot and set it as active
via `updateMapperConfig`.

### TC-4.1 — Returns 400 when attempting to delete the active snapshot

**Precondition:**

- Mapper config with one snapshot set as `activeMapperConfigSnapshotId`.

**Steps:**

1. `DELETE /mappers/{mapperConfigId}/snapshots/{activeSnapshotId}`.

**Expected:**

- HTTP 400.
- Parsed body conforms to `ApiErrorBody`:
  - `body.title` matches `/MapperConfigSnapshot/` (e.g. `'MapperConfigSnapshot.IsActiveSnapshot'`)
  - `body.status === 400`
  - `body.type` contains `'rfc9110'`
  - `body.detail` is truthy (server-supplied human-readable message)
  - `body.errors` is `null` (domain-level error, not a validation errors array)

---

## Suites covered

| Suite | Description                                                                   | Auth required | Notes                                                    |
| ----- | ----------------------------------------------------------------------------- | ------------- | -------------------------------------------------------- |
| 1     | Unauthenticated — 401 / invalid token / missing scope                         | No            | TC-1.3 skipped (scope non-testable with default client)  |
| 2     | Authenticated — ID resolution errors (missing IDs, malformed IDs, wrong owner) | Yes          | `test.describe.serial`; two integrators needed for TC-2.5 |
| 3     | Successful soft delete + GET exclusion + re-delete 404 + PUT rejection        | Yes           | `test.describe.serial`; TC-3.4 allows 400 or 404         |
| 4     | Block delete — active snapshot cannot be deleted                              | Yes           | `test.describe.serial`; TC-4.1 uses regex on `body.title` |
