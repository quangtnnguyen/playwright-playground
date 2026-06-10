# Test Plan: DELETE /api-configs/{apiId}/versions/{apiVersionId}/provider-endpoints/{providerApiEndpointId}

**Endpoint:** `DELETE /api-configs/{apiId}/versions/{apiVersionId}/provider-endpoints/{providerApiEndpointId}`
**Method:** DELETE
**Scope required:** `write:configs`

---

## 1. Unauthenticated — always runs (no token required)

### TC-1.1 — Returns 401 when no Authorization header is provided

**Steps:**

1. Send `DELETE /api-configs/{NONEXISTENT_ID}/versions/{NONEXISTENT_ID}/provider-endpoints/{NONEXISTENT_ID}` with no
   Authorization header.

**Expected:** HTTP 401.

---

### TC-1.2 — Returns 401 or 403 when Authorization header carries an invalid token

**Steps:**

1. Send `DELETE /api-configs/{NONEXISTENT_ID}/versions/{NONEXISTENT_ID}/provider-endpoints/{NONEXISTENT_ID}` with
   `Authorization: Bearer invalid-token-xyz`.

**Expected:** HTTP 401 or 403.

---

### TC-1.3 — Returns 403 when token lacks `write:configs` scope (skip if untestable)

**Steps:**

1. If the suite has a way to mint a token without `write:configs` (separate M2M client), call the endpoint with that
   token against a `NONEXISTENT_ID` path.
2. Otherwise `test.skip(...)` with a message — the default M2M client used by `workerAuthedRequest` has all scopes.

**Expected:** HTTP 403.

---

## 2. Authenticated — ID resolution errors

`test.beforeEach` guard: `test.skip(!hasToken(), 'OAuth credentials required')`.

### TC-2.1 — Returns 404 for a non-existent `apiId`

**Steps:**

1. Send `DELETE /api-configs/{NONEXISTENT_ID}/versions/{NONEXISTENT_ID}/provider-endpoints/{NONEXISTENT_ID}`.

**Expected:** HTTP 404, no response body.

---

### TC-2.2 — Returns 404 for a non-existent `apiVersionId` within a real api-config

**Precondition:** An api-config exists (created in a `beforeAll` and torn down in `afterAll`, or use the shared fixture
suite from TC-3).

**Steps:**

1. Send `DELETE /api-configs/{realApiId}/versions/{NONEXISTENT_ID}/provider-endpoints/{NONEXISTENT_ID}`.

**Expected:** HTTP 404.

---

### TC-2.3 — Returns 404 for a non-existent `providerApiEndpointId` within a real version

**Precondition:** A real `apiConfig` + `apiVersion` exist.

**Steps:**

1. Send `DELETE /api-configs/{realApiId}/versions/{realApiVersionId}/provider-endpoints/{NONEXISTENT_ID}`.

**Expected:** HTTP 404, no response body.

---

### TC-2.4 — Returns 400 for a malformed `apiId`

**Steps:**

1. Send `DELETE /api-configs/not-a-valid-id/versions/{NONEXISTENT_ID}/provider-endpoints/{NONEXISTENT_ID}`.

**Expected:**

- HTTP 400.
- Parsed body conforms to `ApiErrorBody`:
    - `body.status === 400`
    - `body.type` contains `'rfc9110'`
    - `body.title === 'General.Validation'`
    - `body.detail === 'One or more validation errors occurred'`
    - `body.errors` is not null

---

### TC-2.5 — Returns 400 for a malformed `apiVersionId`

**Steps:**

1. Send `DELETE /api-configs/{NONEXISTENT_ID}/versions/not-a-valid-id/provider-endpoints/{NONEXISTENT_ID}`.

**Expected:** HTTP 400 with `General.Validation` body (same shape as TC-2.4).

---

### TC-2.6 — Returns 400 for a malformed `providerApiEndpointId`

**Steps:**

1. Send `DELETE /api-configs/{NONEXISTENT_ID}/versions/{NONEXISTENT_ID}/provider-endpoints/not-a-valid-id`.

**Expected:** HTTP 400 with `General.Validation` body (same shape as TC-2.4).

---

### TC-2.7 — Returns 404 when `providerApiEndpointId` exists but under a different `apiVersionId`

**Precondition:** Two api-versions exist under the same api-config (`v1`, `v2`). A provider endpoint exists under `v1`.

**Steps:**

1. Send `DELETE /api-configs/{realApiId}/versions/{v2Id}/provider-endpoints/{endpointIdUnderV1}`.

**Expected:** HTTP 404. The endpoint must not be deleted; a subsequent `DELETE` against `v1` should still succeed.

---

## 3. Successful soft delete — 200 + side effects

Serial suite. Create one fresh provider + api-config + api-version + provider-endpoint in `beforeAll`, then run TC-3.1 →
TC-3.5 in order against the same `endpointId`.

### TC-3.1 — Returns 200 with empty body

**Precondition:** Provider, api-config, api-version, provider-endpoint freshly created.

**Steps:**

1. `DELETE /api-configs/{apiId}/versions/{apiVersionId}/provider-endpoints/{endpointId}`.

**Expected:**

- HTTP 200.
- Response body is empty string (`await response.text()` returns `''`).

---

### TC-3.2 — Soft-deleted endpoint is excluded from `GET /api-configs/.../provider-endpoints`

**Precondition:** Endpoint from TC-3.1 is soft-deleted.

**Steps:**

1. `GET /api-configs/{apiId}/versions/{apiVersionId}/provider-endpoints` (or whichever list route the API exposes — use
   the existing `getProviderEndpoints` helper if available, otherwise raw GET).

**Expected:** HTTP 200, the returned array does not contain an item with `id === endpointId`.

---

### TC-3.3 — `PUT /api-configs/.../provider-endpoints/{endpointId}` returns 404 for a soft-deleted endpoint

**Precondition:** Endpoint from TC-3.1 is soft-deleted.

**Steps:**

1. `PUT /api-configs/{apiId}/versions/{apiVersionId}/provider-endpoints/{endpointId}` with a valid update payload
   (any field, e.g. `description: 'updated'`).

**Expected:** HTTP 404.

---

### TC-3.4 — Re-delete of a soft-deleted endpoint returns 404

**Precondition:** Endpoint from TC-3.1 is soft-deleted.

**Steps:**

1. `DELETE /api-configs/{apiId}/versions/{apiVersionId}/provider-endpoints/{endpointId}` again.

**Expected:** HTTP 404, no response body.

---

### TC-3.5 — MapperConfig CREATE referencing a soft-deleted endpoint is rejected

**Status:** `test.fixme` — **API bug.** Currently returns HTTP 200 when creating a mapper-config that references a
soft-deleted provider endpoint; the API does not validate soft-deletion state during mapper-config creation.

**Precondition:** Endpoint from TC-3.1 is soft-deleted.

**Steps (when API is fixed):**

1. Create a short-lived integrator (required by mapper-config payload).
2. `POST /{configApiBasePath}/mappers` with
   `{ integratorId, apiVersionId, providerApiEndpointId: soft-deleted endpointId, requestFields: [], responseFields: [] }`.

**Expected (when fixed):** `expect([400, 404]).toContain(response.status())` — API should treat the soft-deleted
endpoint as non-existent.

---

## 4. Runtime forwarding excludes soft-deleted endpoints

Serial suite. `beforeAll` creates provider + api-config + version + provider-endpoint, then soft-deletes the endpoint
via the DELETE route under test. The test then drives a request through `config.proxyBaseUrl` (separate Playwright
request context) and asserts the proxy refuses to forward.

### TC-4.1 — Proxy routing rejects requests resolving to a soft-deleted endpoint

**Precondition:** Endpoint freshly created with a known `prefixPath` and `proxyCode`, then soft-deleted in `beforeAll`
(DELETE returned 200).

**Steps:**

1. Create a Playwright request context with `baseURL = config.proxyBaseUrl` and the standard auth headers.
2. `GET {prefixPath}` with header `X-Api-Provider: {proxyCode}`.
3. Dispose the proxy request context in `finally`.

**Expected:**

- HTTP 404 (request not forwarded upstream).
- Parsed body conforms to `ApiErrorBody`:
    - `body.status === 404`
    - `body.type` contains `'rfc9110'`
    - `body.title === 'Resource Not Found'`
    - `body.detail === 'Resource Not Found'`
    - `body.errors` is not null and has length 1
    - `body.errors[0].errorCode === '404'`
    - `body.errors[0].errorDescription === 'The requested resource could not be found'`

---

## 5. Block delete — endpoint referenced by MapperConfig

Serial suite. Create provider → api-config → api-version → provider-endpoint → mapper-config referencing that
endpoint → attempt delete.

### TC-5.1 — Returns 400 `ProviderApiEndpoint.ReferencedByMapperConfig` with correct error shape

**Precondition:**

- Provider, api-config, api-version, provider-endpoint created.
- MapperConfig created with `endpointId = providerApiEndpointId` (and otherwise minimal valid payload).

**Steps:**

1. `DELETE /api-configs/{apiId}/versions/{apiVersionId}/provider-endpoints/{providerApiEndpointId}`.

**Expected:**

- HTTP 400.
- Parsed body conforms to `ApiErrorBody`:
    - `body.title === 'ProviderApiEndpoint.ReferencedByMapperConfig'`
    - `body.status === 400`
    - `body.type` contains `'rfc9110'`
    - `body.detail` is truthy (server-supplied human-readable message)
    - `body.errors` is `null` (this is a domain-level error, not a validation errors array)

**Cleanup:** Delete the mapper-config first, then the endpoint, then the api-config and provider. If mapper-config
DELETE is unavailable, fall back to a manual mongosh cleanup entry.

---

### TC-5.2 — After mapper-config is removed, the same endpoint can be deleted (200)

**Status:** `test.fixme` — **Flow bug.** `deleteMapperConfig` currently returns a non-OK status (mapper delete appears
to fail, or the endpoint retains a reference even after deletion), so the subsequent endpoint DELETE returns 400
instead of 200. Re-enable once mapper-config DELETE clears the reference end-to-end.

**Precondition:** State from TC-5.1 (delete returned 400). Same serial suite, run immediately after TC-5.1.

**Steps (when fixed):**

1. `deleteMapperConfig(mapperConfigId)` — clears the reference.
2. `DELETE /api-configs/{apiId}/versions/{apiVersionId}/provider-endpoints/{providerApiEndpointId}`.

**Expected (when fixed):** HTTP 200 with empty body. Confirms the 400 was driven solely by the mapper-config reference
and that clearing it unblocks the soft delete.

---

## 6. Edge cases

### TC-6.1 — Endpoint deleted in a different api-version path remains intact

Documented under TC-2.7 above; restated here for clarity in the edge-case index.

### TC-6.2 — Concurrent delete safety (informational, not asserted)

Two concurrent `DELETE` calls against the same live endpoint should result in exactly one 200 and one 404, never two
200s. **Not implemented** in this plan because Playwright API tests don't easily race; document as future work.

### TC-6.3 — Whitespace and case sensitivity in route params

`DELETE /api-configs/ {realApiId} /...` (leading/trailing spaces, mixed case in the hex) should return 404 (or 400 for
malformed URL). Single representative case is sufficient — same expectation as TC-2.4 to TC-2.6.

---

## Suites covered

| Suite | Description                                                                                       | Auth required | Notes                                                             |
| ----- | ------------------------------------------------------------------------------------------------- | ------------- | ----------------------------------------------------------------- |
| 1     | Unauthenticated — 401 / invalid token / missing scope                                             | No            | TC-1.3 may be skipped if scope is non-testable                    |
| 2     | Authenticated — ID resolution errors (all three params, malformed forms)                          | Yes           | 404 preferred for malformed IDs                                   |
| 3     | Successful soft delete + GET exclusion + PUT 404 + re-delete 404 + mapper-config CREATE rejection | Yes           | `test.describe.serial`; TC-3.5 `test.fixme` (API bug — see case)  |
| 4     | Runtime forwarding rejection via `config.proxyBaseUrl`                                            | Yes           | `test.describe.serial`                                            |
| 5     | Block delete — MapperConfig reference (400 + recovery)                                            | Yes           | `test.describe.serial`; TC-5.2 `test.fixme` (flow bug — see case) |
| 6     | Edge cases (cross-version path, concurrency note, whitespace)                                     | Yes           | TC-6.2 documented only                                            |
