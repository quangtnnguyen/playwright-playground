# Test Plan: DELETE /providers/{providerId}

**Endpoint:** `DELETE /providers/{providerId}`  
**Method:** DELETE  
**Scope required:** `write:configs`  

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

### TC-4.1 — Returns 400 `Provider.HasActiveEndpoints` with correct error shape

**Precondition:**

- Provider created.
- ProviderApiEndpoint created with `proxyCodeValues: [provider.proxyCode]`.

**Steps:**

1. `DELETE /providers/{id}`.

**Expected:**

- HTTP 400.
- `body.title` = `"Provider.HasActiveEndpoints"`.
- `body.status` = `400`.
- `body.type` contains `"rfc9110"`.
- `body.detail` = `"Provider '{providerName}' is referenced by one or more ProviderApiEndpoints and cannot be deleted. Remove all associated endpoints first"`.
- `body.errors` is `null` (domain-level error, not a validation errors array).

**Cleanup:** Delete provider endpoint, then delete provider.

---

## 5. Block delete — provider referenced by Integrators

Serial suite: create provider → integrator referencing `proxyCode` → attempt delete.

### TC-5.1 — Returns 400 `Provider.ReferencedByIntegrator` with correct error shape

**Precondition:**

- Provider created.
- Integrator created with `allowedProviderProxyCodes: [provider.proxyCode]`.

**Steps:**

1. `DELETE /providers/{id}`.

**Expected:**

- HTTP 400.
- `body.title` = `"Provider.ReferencedByIntegrator"`.
- `body.status` = `400`.
- `body.type` contains `"rfc9110"`.
- `body.detail` = `"Provider '{providerName}' is referenced by one or more Integrators and cannot be deleted. Remove the provider from all integrator access lists first"`.
- `body.errors` is `null` (domain-level error, not a validation errors array).

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

## 8. Proxy routing rejection

Serial suite: build a routable endpoint chain for an active provider, then send a proxied request with the `X-Api-Provider` header set to a soft-deleted provider's `proxyCode`. Proxy server URL comes from `PROXY_BASE_URL` (`config.proxyBaseUrl`).

### TC-8.1 — Proxy routing rejects `X-Api-Provider` header matching soft-deleted provider `proxyCode`

**Precondition:**

- Active provider A created (route target).
- ApiConfig + ApiVersion (`prefixPath`, `httpMethod: GET`) + ProviderApiEndpoint created with `providerProxyConfig.proxyCodeValues: [A.proxyCode]`.
- Provider B created then soft-deleted; `B.proxyCode` is the header value under test.

**Steps:**

1. Send `GET {PROXY_BASE_URL}{prefixPath}` with header `X-Api-Provider: {B.proxyCode}`.

**Expected:**

- HTTP 404.
- `body.status` = `404`.
- `body.type` contains `"rfc9110"`.
- `body.title` = `"Resource Not Found"`.
- `body.detail` = `"Resource Not Found"`.
- `body.errors` is not `null` and has length 1.
- `body.errors[0].errorCode` = `"404"`.
- `body.errors[0].errorDescription` = `"The requested resource could not be found"`.

**Cleanup:** Delete provider endpoint, delete provider A. (Provider B already soft-deleted.)
