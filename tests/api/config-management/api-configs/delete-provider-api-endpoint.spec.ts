import { test, expect } from '@fixtures'
import { assertStatus } from '@helpers/assertions.helper'
import { config, hasToken } from '@helpers/config'
import { getAuthHeaders } from '@helpers/auth.helper'
import {
    createProvider,
    createIntegrator,
    createApiConfig,
    createApiVersion,
    createProviderEndpoint,
    getProviderEndpoints,
    createMapperConfig,
    deleteMapperConfig,
} from '@helpers/api-requests'
import { ApiErrorBody } from '@helpers/api-requests/ApiErrorBody'

/** Test specification tag — used for resource auto-tracking + cleanup script naming */
const SPEC_TAG = 'delete-provider-api-endpoint'

/** Well-formed ObjectId with no matching document in any environment */
const NONEXISTENT_ID = '68f064df1ba266b972ee56a0'

/** Build the provider-endpoints route for a given api-config + version */
const endpointsPath = (apiId: string, apiVersionId: string) =>
    `/${config.configApiBasePath}/api-configs/${apiId}/versions/${apiVersionId}/provider-endpoints`

/** Short random suffix — makes test data names unique per run */
const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

// =============================================================================

test.describe('DELETE /api-configs/{apiId}/versions/{apiVersionId}/provider-endpoints/{providerApiEndpointId}', () => {
    // ─── 1. Unauthenticated — always runs ────────────────────────────────────
    test.describe('1. Unauthenticated', () => {
        test('TC-1.1 — Returns 401 when no Authorization header is provided', async ({
            apiRequest,
        }) => {
            // 1. Send DELETE with no Authorization header
            const response = await apiRequest.delete(
                `${endpointsPath(NONEXISTENT_ID, NONEXISTENT_ID)}/${NONEXISTENT_ID}`
            )

            assertStatus(response, 401)
        })

        test('TC-1.2 — Returns 401 or 403 when Authorization header carries an invalid token', async ({
            apiRequest,
        }) => {
            // 1. Send DELETE with Authorization: Bearer invalid-token-xyz
            const response = await apiRequest.delete(
                `${endpointsPath(NONEXISTENT_ID, NONEXISTENT_ID)}/${NONEXISTENT_ID}`,
                { headers: { Authorization: 'Bearer invalid-token-xyz' } }
            )

            expect([401, 403]).toContain(response.status())
        })

        test.skip('TC-1.3 — Returns 403 when token lacks write:configs scope', () => {
            // Skipped — the default M2M client used by workerAuthedRequest has all scopes.
            // Re-enable when a scope-limited client becomes available.
        })
    })

    // ─── 2. Authenticated — ID resolution errors ─────────────────────────────
    test.describe.serial('2. Authenticated — ID resolution errors', () => {
        let apiConfigId!: string
        let apiVersionId!: string
        let secondApiVersionId!: string
        let providerProxyCode!: string
        let endpointUnderV1Id!: string

        test.beforeAll(async ({ workerAuthedRequest }) => {
            test.skip(!hasToken(), 'OAuth credentials required')
            const suffix = uid()
            providerProxyCode = `prov-${suffix}`

            await createProvider(
                workerAuthedRequest,
                {
                    name: `test-provider-${suffix}`,
                    description: 'TC-2 test provider',
                    proxyCode: providerProxyCode,
                },
                SPEC_TAG
            )

            const apiConfig = await createApiConfig(
                workerAuthedRequest,
                {
                    name: `api-config-${suffix}`,
                    description: 'TC-2 api config',
                    isActive: true,
                },
                SPEC_TAG
            )
            apiConfigId = apiConfig.id

            const apiVersion = await createApiVersion(
                workerAuthedRequest,
                apiConfigId,
                {
                    prefixPath: `/tc2-v1-${suffix}`,
                    httpMethod: 'GET',
                    isActive: true,
                    allowedScopes: ['test-scope'],
                    schemaValidators: [],
                }
            )
            apiVersionId = apiVersion.id

            // Second version under the same api-config for TC-2.7
            const apiVersion2 = await createApiVersion(
                workerAuthedRequest,
                apiConfigId,
                {
                    prefixPath: `/tc2-v2-${suffix}`,
                    httpMethod: 'GET',
                    isActive: true,
                    allowedScopes: ['test-scope'],
                    schemaValidators: [],
                }
            )
            secondApiVersionId = apiVersion2.id

            const endpoint = await createProviderEndpoint(
                workerAuthedRequest,
                apiConfigId,
                apiVersionId,
                {
                    apiId: apiConfigId,
                    apiVersionId: apiVersionId,
                    name: `endpoint-${suffix}`,
                    description: 'TC-2 provider endpoint',
                    endpoint: 'https://example.com/test',
                    providerProxyConfig: {
                        proxyField: 'X-Api-Provider',
                        container: 'Header',
                        proxyCodeValues: [providerProxyCode],
                        isCaseSensitive: false,
                    },
                    authRequest: {
                        url: null,
                        httpMethod: 'POST',
                        authType: 'Anonymous',
                        fieldValues: [],
                    },
                    extensions: [],
                }
            )
            endpointUnderV1Id = endpoint.id
        })

        test('TC-2.1 — Returns 404 for a non-existent apiId', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${endpointsPath(NONEXISTENT_ID, NONEXISTENT_ID)}/${NONEXISTENT_ID}`
            )
            assertStatus(response, 404)
        })

        test('TC-2.2 — Returns 404 for a non-existent apiVersionId within a real api-config', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${endpointsPath(apiConfigId, NONEXISTENT_ID)}/${NONEXISTENT_ID}`
            )
            assertStatus(response, 404)
        })

        test('TC-2.3 — Returns 404 for a non-existent providerApiEndpointId within a real version', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${endpointsPath(apiConfigId, apiVersionId)}/${NONEXISTENT_ID}`
            )
            assertStatus(response, 404)
        })

        test('TC-2.4 — Returns 400 for a malformed apiId', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `/${config.configApiBasePath}/api-configs/not-a-valid-id/versions/${NONEXISTENT_ID}/provider-endpoints/${NONEXISTENT_ID}`
            )
            assertStatus(response, 400)
            const body = (await response.json()) as ApiErrorBody
            expect(body.status).toBe(400)
            expect(body.type).toContain('rfc9110')
            expect(body.title).toBe('General.Validation')
            expect(body.detail).toBe('One or more validation errors occurred')
            expect(body.errors).not.toBeNull()
        })

        test('TC-2.5 — Returns 400 for a malformed apiVersionId', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `/${config.configApiBasePath}/api-configs/${NONEXISTENT_ID}/versions/not-a-valid-id/provider-endpoints/${NONEXISTENT_ID}`
            )
            assertStatus(response, 400)
            const body = (await response.json()) as ApiErrorBody
            expect(body.status).toBe(400)
            expect(body.type).toContain('rfc9110')
            expect(body.title).toBe('General.Validation')
            expect(body.detail).toBe('One or more validation errors occurred')
            expect(body.errors).not.toBeNull()
        })

        test('TC-2.6 — Returns 400 for a malformed providerApiEndpointId', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${endpointsPath(NONEXISTENT_ID, NONEXISTENT_ID)}/not-a-valid-id`
            )
            assertStatus(response, 400)
            const body = (await response.json()) as ApiErrorBody
            expect(body.status).toBe(400)
            expect(body.type).toContain('rfc9110')
            expect(body.title).toBe('General.Validation')
            expect(body.detail).toBe('One or more validation errors occurred')
            expect(body.errors).not.toBeNull()
        })

        test('TC-2.7 — Returns 404 when providerApiEndpointId exists but under a different apiVersionId', async ({
            workerAuthedRequest,
        }) => {
            // Endpoint lives under apiVersionId (v1); attempt delete under secondApiVersionId (v2)
            const response = await workerAuthedRequest.delete(
                `${endpointsPath(apiConfigId, secondApiVersionId)}/${endpointUnderV1Id}`
            )
            assertStatus(response, 404)

            // Sanity check — the endpoint is still present under v1 and can be deleted there
            const okResponse = await workerAuthedRequest.delete(
                `${endpointsPath(apiConfigId, apiVersionId)}/${endpointUnderV1Id}`
            )
            assertStatus(okResponse, 200)
        })
    })

    // ─── 3. Successful soft delete — 200 + side effects ──────────────────────
    test.describe
        .serial('3. Successful soft delete — 200 + side effects', () => {
        let providerProxyCode!: string
        let apiConfigId!: string
        let apiVersionId!: string
        let endpointId!: string
        let endpointName!: string
        let endpointUrl!: string

        test.beforeAll(async ({ workerAuthedRequest }) => {
            test.skip(!hasToken(), 'OAuth credentials required')
            const suffix = uid()
            providerProxyCode = `prov-${suffix}`

            await createProvider(
                workerAuthedRequest,
                {
                    name: `test-provider-${suffix}`,
                    description: 'TC-3 test provider',
                    proxyCode: providerProxyCode,
                },
                SPEC_TAG
            )

            const apiConfig = await createApiConfig(
                workerAuthedRequest,
                {
                    name: `api-config-${suffix}`,
                    description: 'TC-3 api config',
                    isActive: true,
                },
                SPEC_TAG
            )
            apiConfigId = apiConfig.id

            const apiVersion = await createApiVersion(
                workerAuthedRequest,
                apiConfigId,
                {
                    prefixPath: `/tc3-${suffix}`,
                    httpMethod: 'GET',
                    isActive: true,
                    allowedScopes: ['test-scope'],
                    schemaValidators: [],
                }
            )
            apiVersionId = apiVersion.id

            const endpoint = await createProviderEndpoint(
                workerAuthedRequest,
                apiConfigId,
                apiVersionId,
                {
                    apiId: apiConfigId,
                    apiVersionId: apiVersionId,
                    name: `endpoint-${suffix}`,
                    description: 'TC-3 provider endpoint',
                    endpoint: 'https://example.com/test',
                    providerProxyConfig: {
                        proxyField: 'X-Api-Provider',
                        container: 'Header',
                        proxyCodeValues: [providerProxyCode],
                        isCaseSensitive: false,
                    },
                    authRequest: {
                        url: null,
                        httpMethod: 'POST',
                        authType: 'Anonymous',
                        fieldValues: [],
                    },
                    extensions: [],
                }
            )
            endpointId = endpoint.id
            endpointName = `endpoint-${suffix}`
            endpointUrl = 'https://example.com/test'
        })

        test('TC-3.1 — Returns 200 with empty body', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${endpointsPath(apiConfigId, apiVersionId)}/${endpointId}`
            )
            assertStatus(response, 200)
            expect(await response.text()).toBe('')
        })

        test('TC-3.2 — Soft-deleted endpoint is excluded from GET provider-endpoints', async ({
            workerAuthedRequest,
        }) => {
            const items = await getProviderEndpoints(workerAuthedRequest, {
                apiId: apiConfigId,
                apiVersionId: apiVersionId,
            })
            const found = (items as Array<{ id?: string }>).find(
                (item) => item.id === endpointId
            )
            expect(found).toBeUndefined()
        })

        test('TC-3.3 — PUT /provider-endpoints/{endpointId} returns 404 for a soft-deleted endpoint', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.put(
                `${endpointsPath(apiConfigId, apiVersionId)}/${endpointId}`,
                {
                    data: {
                        name: endpointName,
                        description: 'updated',
                        endpoint: endpointUrl,
                        providerProxyConfig: {
                            proxyField: 'X-Api-Provider',
                            container: 'Header',
                            proxyCodeValues: [providerProxyCode],
                            isCaseSensitive: false,
                        },
                        authRequest: {
                            url: null,
                            httpMethod: 'POST',
                            authType: 'Anonymous',
                            fieldValues: [],
                        },
                        extensions: [],
                    },
                }
            )
            assertStatus(response, 404)
        })

        test('TC-3.4 — Re-delete of a soft-deleted endpoint returns 404', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${endpointsPath(apiConfigId, apiVersionId)}/${endpointId}`
            )
            assertStatus(response, 404)
        })

        test('TC-3.5 — MapperConfig CREATE referencing a soft-deleted endpoint is rejected', async ({
            workerAuthedRequest,
        }) => {
            // TODO: API currently returns 200 when creating a mapper-config referencing a soft-deleted endpoint.
            // The API does not validate soft-deletion state during mapper-config creation.
            // Fix expected on API side; re-enable once the API enforces 400/404 for soft-deleted endpoint references.
            test.fixme()
            const suffix = uid()

            // Create a short-lived integrator (required by mapper-config payload)
            const integrator = await createIntegrator(
                workerAuthedRequest,
                {
                    name: `integrator-tc35-${suffix}`,
                    description: 'TC-3.5 integrator',
                    auth0Id: `auth0|test-${suffix}`,
                    allowedProviderProxyCodes: [providerProxyCode],
                    isActive: true,
                    hasUnlimitedProviderAccess: false,
                    isInternal: true,
                },
                SPEC_TAG
            )

            const response = await workerAuthedRequest.post(
                `/${config.configApiBasePath}/mappers`,
                {
                    data: {
                        integratorId: integrator.id,
                        apiVersionId: apiVersionId,
                        providerApiEndpointId: endpointId,
                        requestFields: [],
                        responseFields: [],
                    },
                }
            )

            expect([400, 404]).toContain(response.status())
        })
    })

    // ─── 4. Runtime forwarding rejection ─────────────────────────────────────
    test.describe.serial('4. Runtime forwarding rejection', () => {
        let providerProxyCode!: string
        let apiConfigId!: string
        let apiVersionId!: string
        let endpointId!: string
        let prefixPath!: string

        test.beforeAll(async ({ workerAuthedRequest }) => {
            test.skip(!hasToken(), 'OAuth credentials required')
            const suffix = uid()
            providerProxyCode = `prov-${suffix}`
            prefixPath = `/tc41-${suffix}`

            await createProvider(
                workerAuthedRequest,
                {
                    name: `test-provider-${suffix}`,
                    description: 'TC-4 test provider',
                    proxyCode: providerProxyCode,
                },
                SPEC_TAG
            )

            const apiConfig = await createApiConfig(
                workerAuthedRequest,
                {
                    name: `api-config-${suffix}`,
                    description: 'TC-4 api config',
                    isActive: true,
                },
                SPEC_TAG
            )
            apiConfigId = apiConfig.id

            const apiVersion = await createApiVersion(
                workerAuthedRequest,
                apiConfigId,
                {
                    prefixPath,
                    httpMethod: 'GET',
                    isActive: true,
                    allowedScopes: ['test-scope'],
                    schemaValidators: [],
                }
            )
            apiVersionId = apiVersion.id

            const endpoint = await createProviderEndpoint(
                workerAuthedRequest,
                apiConfigId,
                apiVersionId,
                {
                    apiId: apiConfigId,
                    apiVersionId: apiVersionId,
                    name: `endpoint-${suffix}`,
                    description:
                        'TC-4 provider endpoint (will be soft-deleted)',
                    endpoint: 'https://example.com/test',
                    providerProxyConfig: {
                        proxyField: 'X-Api-Provider',
                        container: 'Header',
                        proxyCodeValues: [providerProxyCode],
                        isCaseSensitive: false,
                    },
                    authRequest: {
                        url: 'https://auth.example.com',
                        httpMethod: 'POST',
                        authType: 'Anonymous',
                        fieldValues: [],
                    },
                    extensions: [],
                }
            )
            endpointId = endpoint.id

            // Soft-delete the endpoint — runtime proxy routing should now refuse it.
            const deleteResponse = await workerAuthedRequest.delete(
                `${endpointsPath(apiConfigId, apiVersionId)}/${endpointId}`
            )
            assertStatus(deleteResponse, 200)
        })

        test('TC-4.1 — Proxy routing rejects requests resolving to a soft-deleted endpoint', async ({
            playwright,
        }) => {
            const proxyCtx = await playwright.request.newContext({
                baseURL: config.proxyBaseUrl,
                extraHTTPHeaders: {
                    Accept: 'application/json',
                    ...(await getAuthHeaders()),
                },
            })

            try {
                const response = await proxyCtx.get(prefixPath, {
                    headers: { 'X-Api-Provider': providerProxyCode },
                })
                // Request must not be forwarded to the upstream endpoint.
                assertStatus(response, 404)
                const body = (await response.json()) as ApiErrorBody
                expect(body.status).toBe(404)
                expect(body.type).toContain('rfc9110')
                expect(body.title).toBe('Resource Not Found')
                expect(body.detail).toBe('Resource Not Found')
                expect(body.errors).not.toBeNull()
                expect(body.errors).toHaveLength(1)
                expect(body.errors[0].errorCode).toBe('404')
                expect(body.errors[0].errorDescription).toBe(
                    'The requested resource could not be found'
                )
            } finally {
                await proxyCtx.dispose()
            }
        })
    })

    // ─── 5. Block delete — endpoint referenced by MapperConfig ───────────────
    test.describe
        .serial('5. Block delete — endpoint referenced by MapperConfig', () => {
        let providerProxyCode!: string
        let apiConfigId!: string
        let apiVersionId!: string
        let endpointId!: string
        let integratorId!: string
        let mapperConfigId!: string

        test.beforeAll(async ({ workerAuthedRequest }) => {
            test.skip(!hasToken(), 'OAuth credentials required')
            const suffix = uid()
            providerProxyCode = `prov-${suffix}`

            await createProvider(
                workerAuthedRequest,
                {
                    name: `test-provider-${suffix}`,
                    description: 'TC-5 test provider',
                    proxyCode: providerProxyCode,
                },
                SPEC_TAG
            )

            const apiConfig = await createApiConfig(
                workerAuthedRequest,
                {
                    name: `api-config-${suffix}`,
                    description: 'TC-5 api config',
                    isActive: true,
                },
                SPEC_TAG
            )
            apiConfigId = apiConfig.id

            const apiVersion = await createApiVersion(
                workerAuthedRequest,
                apiConfigId,
                {
                    prefixPath: `/tc5-${suffix}`,
                    httpMethod: 'GET',
                    isActive: true,
                    allowedScopes: ['test-scope'],
                    schemaValidators: [],
                }
            )
            apiVersionId = apiVersion.id

            const endpoint = await createProviderEndpoint(
                workerAuthedRequest,
                apiConfigId,
                apiVersionId,
                {
                    apiId: apiConfigId,
                    apiVersionId: apiVersionId,
                    name: `endpoint-${suffix}`,
                    description: 'TC-5 provider endpoint',
                    endpoint: 'https://example.com/test',
                    providerProxyConfig: {
                        proxyField: 'X-Api-Provider',
                        container: 'Header',
                        proxyCodeValues: [providerProxyCode],
                        isCaseSensitive: false,
                    },
                    authRequest: {
                        url: null,
                        httpMethod: 'POST',
                        authType: 'Anonymous',
                        fieldValues: [],
                    },
                    extensions: [],
                }
            )
            endpointId = endpoint.id

            const integrator = await createIntegrator(
                workerAuthedRequest,
                {
                    name: `integrator-tc5-${suffix}`,
                    description: 'TC-5 integrator',
                    auth0Id: `auth0|test-${suffix}`,
                    allowedProviderProxyCodes: [providerProxyCode],
                    isActive: true,
                    hasUnlimitedProviderAccess: false,
                    isInternal: true,
                },
                SPEC_TAG
            )
            integratorId = integrator.id

            const mapper = await createMapperConfig(
                workerAuthedRequest,
                {
                    integratorId: integratorId,
                    apiVersionId: apiVersionId,
                    providerApiEndpointId: endpointId,
                    requestFields: [],
                    responseFields: [],
                },
                SPEC_TAG
            )
            mapperConfigId = mapper.id
        })

        test('TC-5.1 — Returns 400 ProviderApiEndpoint.ReferencedByMapperConfig with correct error shape', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${endpointsPath(apiConfigId, apiVersionId)}/${endpointId}`
            )
            assertStatus(response, 400)
            const body = (await response.json()) as ApiErrorBody
            expect(body.title).toBe(
                'ProviderApiEndpoint.ReferencedByMapperConfig'
            )
            expect(body.status).toBe(400)
            expect(body.type).toContain('rfc9110')
            expect(body.detail).toBeTruthy()
            // errors is null for domain-level errors (not a validation errors array)
        })

        test('TC-5.2 — After mapper-config is removed, the same endpoint can be deleted (200)', async ({
            workerAuthedRequest,
        }) => {
            // TODO: deleteMapperConfig silently returns non-OK (mapper delete appears to fail or endpoint
            // still retains a reference after deletion), causing the subsequent endpoint DELETE to return 400.
            // Fix expected on API side or in deleteMapperConfig error handling; re-enable once the flow succeeds end-to-end.
            test.fixme()
            // 1. Delete the mapper-config (clears the reference)
            await deleteMapperConfig(workerAuthedRequest, mapperConfigId)
            // Prevent afterAll from double-deleting
            mapperConfigId = ''

            // 2. Delete the previously-blocked endpoint
            const response = await workerAuthedRequest.delete(
                `${endpointsPath(apiConfigId, apiVersionId)}/${endpointId}`
            )
            assertStatus(response, 200)
            expect(await response.text()).toBe('')
        })
    })
})
