# Test Plan: DELETE /providers/{providerId}

**Endpoint:** `DELETE /providers/{providerId}`  
**Method:** DELETE  
**Scope required:** `write:configs`  
**Spec file:** `tests/api/config-management/providers/delete-provider.spec.ts`

---

## 1. Unauthenticated — always runs (no token required)

### TC-1.1 — Returns 401 when no Authorization header is provided

**Steps:**

1. Send `DELETE /providers/68f064df1ba266b972ee56a0` with no Authorization header.

**Expected:** HTTP 401

---

### TC-1.2 — Returns 401 or 403 when Authorization header carries an invalid token

**Steps:**

1. Send `DELETE /providers/68f064df1ba266b972ee56a0` with `Authorization: Bearer invalid-token-xyz`.

**Expected:** HTTP 401 or 403

---

## 2. Authenticated — ID resolution errors

### TC-2.1 — Returns 404 for a non-existent provider ID

**Precondition:** OAuth credentials present.

**Steps:**

1. Send `DELETE /providers/68f064df1ba266b972ee56a0` (valid ObjectId format, no matching document).

**Expected:** HTTP 404, no response body.

---

### TC-2.2 — Returns 400 for a malformed ID format

**Precondition:** OAuth credentials present.

**Steps:**

1. Send `DELETE /providers/not-a-valid-id`.

**Expected:** HTTP 400.

---

## 3. Successful soft delete — 200 + side effects

Serial suite: create one fresh provider, delete it, then verify each side effect.

### TC-3.1 — Returns 200 with empty body

**Precondition:** Provider created with unique `proxyCode` and `name`.

**Steps:**

1. `POST /providers` → capture `id`.
2. `DELETE /providers/{id}`.

**Expected:** HTTP 200, response body is empty string.

---

### TC-3.2 — Soft-deleted provider is excluded from GET /providers

**Precondition:** Provider from TC-3.1 is soft-deleted.

**Steps:**

1. `GET /providers`.

**Expected:** HTTP 200, returned array does not contain an item with the deleted provider's `id`.

---

### TC-3.3 — PUT /providers/{id} returns 404 for a soft-deleted provider

**Precondition:** Provider from TC-3.1 is soft-deleted.

**Steps:**

1. `PUT /providers/{id}` with a valid update payload (same `name`, `description`, `proxyCode`).

**Expected:** HTTP 404.

---

## 4. Block delete — provider referenced by ProviderApiEndpoints

Serial suite: create provider → api config → api version → provider endpoint referencing the provider's `proxyCode` → attempt delete.

### TC-4.1 — Returns 400 `provider_has_active_endpoints` with correct error shape

**Precondition:**

- Provider created.
- ProviderApiEndpoint created with `proxyCodeValues: [provider.proxyCode]`.

**Steps:**

1. `DELETE /providers/{id}`.

**Expected:**

- HTTP 400.
- `body.title` = `"provider_has_active_endpoints"`.
- `body.status` = `400`.
- `body.type` contains `"rfc9110"`.
- `body.errors` array contains an object with `errorCode: "provider_has_active_endpoints"`.

**Cleanup:** Delete provider endpoint, then delete provider.

---

## 5. Block delete — provider referenced by Integrators

Serial suite: create provider → integrator referencing `proxyCode` → attempt delete.

### TC-5.1 — Returns 400 `provider_referenced_by_integrator` with correct error shape

**Precondition:**

- Provider created.
- Integrator created with `allowedProviderProxyCodes: [provider.proxyCode]`.

**Steps:**

1. `DELETE /providers/{id}`.

**Expected:**

- HTTP 400.
- `body.title` = `"provider_referenced_by_integrator"`.
- `body.status` = `400`.
- `body.type` contains `"rfc9110"`.
- `body.errors` array contains an object with `errorCode: "provider_referenced_by_integrator"`.

**Cleanup:** Delete integrator, then delete provider.

---

## 6. Soft-delete validation side effects — CREATE operations

Serial suite: create a provider, soft-delete it, then verify downstream create operations reject the deleted `proxyCode`.

### TC-6.1 — ProviderApiEndpoint CREATE returns validation error referencing soft-deleted `proxyCode` in `ProxyCodeValues`

**Precondition:** Provider created then soft-deleted.

**Steps:**

1. `POST /api-configs` → `apiConfigId`.
2. `POST /api-configs/{apiConfigId}/versions` → `apiVersionId`.
3. `POST /api-configs/{apiConfigId}/versions/{apiVersionId}/provider-endpoints` with `providerProxyConfig.proxyCodeValues: [deletedProxyCode]`.

**Expected:** HTTP 400.

---

### TC-6.2 — Integrator CREATE returns validation error referencing soft-deleted `proxyCode` in `allowedProviderProxyCodes`

**Precondition:** Provider created then soft-deleted.

**Steps:**

1. `POST /integrators` with `allowedProviderProxyCodes: [deletedProxyCode]`.

**Expected:** HTTP 400.

---

## 7. Soft-delete validation side effects — UPDATE operations

### TC-7.1 — ProviderApiEndpoint UPDATE returns validation error referencing soft-deleted `proxyCode` in `ProxyCodeValues`

**Precondition:**

- `provider1` created (will be soft-deleted).
- `provider2` created (stays active).
- Api config + version created.
- ProviderApiEndpoint created referencing `provider2.proxyCode`.
- `provider1` soft-deleted.

**Steps:**

1. `PUT /api-configs/{apiConfigId}/versions/{versionId}/provider-endpoints/{endpointId}` with `providerProxyConfig.proxyCodeValues: [provider1.proxyCode]` (the deleted one).

**Expected:** HTTP 400.

**Cleanup:** Delete provider endpoint, delete `provider2`. (`provider1` already soft-deleted.)

---

### TC-7.2 — Integrator UPDATE returns validation error referencing soft-deleted `proxyCode` in `allowedProviderProxyCodes`

**Precondition:**

- `provider1` created (will be soft-deleted).
- `provider2` created (stays active).
- Integrator created referencing `provider2.proxyCode`.
- `provider1` soft-deleted.

**Steps:**

1. `PUT /integrators/{integratorId}` with `allowedProviderProxyCodes: [provider1.proxyCode]` (the deleted one).

**Expected:** HTTP 400.

**Cleanup:** Delete integrator, delete `provider2`. (`provider1` already soft-deleted.)

---

## 8. Proxy routing rejection (pending environment)

### TC-8.1 — Proxy routing rejects `X-Api-Provider` header matching soft-deleted provider `proxyCode`

**Note:** Requires a live proxy routing environment. Marked `test.fixme` until the routing layer is available in the test environment.

**Steps (when runnable):**

1. Create a provider, note its `proxyCode`.
2. Soft-delete the provider.
3. Send a proxied request with header `X-Api-Provider: {proxyCode}`.

**Expected:** Request rejected; not forwarded to any endpoint.
