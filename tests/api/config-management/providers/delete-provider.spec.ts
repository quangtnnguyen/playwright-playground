import { test, expect } from '@fixtures'
import { assertStatus } from '@helpers/assertions.helper'
import { config, hasToken } from '@helpers/config'
import { getAuthHeaders } from '@helpers/auth.helper'
import {
    createProvider,
    deleteProvider,
    getProviders,
    createIntegrator,
    deleteIntegrator,
    createApiConfig,
    createApiVersion,
    createProviderEndpoint,
    deleteProviderEndpoint,
} from '@helpers/api-requests'
import { ApiErrorBody } from '@helpers/api-requests/ApiErrorBody'

/** Test specification tag */
const SPEC_TAG = 'delete-provider'

/** Well-formed ObjectId with no matching document in any environment */
const NONEXISTENT_ID = '68f064df1ba266b972ee56a0'

/** Base path for provider routes */
const PROVIDERS_PATH = `/${config.configApiBasePath}/providers`

/** Short random suffix — makes test data names unique per run */
const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

// =============================================================================

test.describe('DELETE /providers/{providerId}', () => {
    // ─── 1. Unauthenticated — always runs ────────────────────────────────────
    test.describe('1. Unauthenticated', () => {
        test('TC-1.1 — Returns 401 when no Authorization header is provided', async ({
            apiRequest,
        }) => {
            const response = await apiRequest.delete(
                `${PROVIDERS_PATH}/${NONEXISTENT_ID}`
            )

            assertStatus(response, 401)
        })

        test('TC-1.2 — Returns 401 or 403 when Authorization header carries an invalid token', async ({
            apiRequest,
        }) => {
            const response = await apiRequest.delete(
                `${PROVIDERS_PATH}/${NONEXISTENT_ID}`,
                { headers: { Authorization: 'Bearer invalid-token-xyz' } }
            )

            expect([401, 403]).toContain(response.status())
        })
    })

    // ─── 2. Authenticated — ID resolution errors ─────────────────────────────
    test.describe('2. Authenticated — ID resolution errors', () => {
        test.beforeEach(() => {
            test.skip(!hasToken(), 'OAuth credentials required')
        })

        test('TC-2.1 — Returns 404 for a non-existent provider ID', async ({
            authedRequest,
        }) => {
            const response = await authedRequest.delete(
                `${PROVIDERS_PATH}/${NONEXISTENT_ID}`
            )

            assertStatus(response, 404)
        })

        test('TC-2.2 — Returns 400 for a malformed ID format', async ({
            authedRequest,
        }) => {
            const response = await authedRequest.delete(
                `${PROVIDERS_PATH}/not-a-valid-id`
            )

            assertStatus(response, 400)
        })
    })

    // ─── 3. Successful soft delete — 200 + side effects ──────────────────────
    test.describe
        .serial('3. Successful soft delete — 200 + side effects', () => {
        let providerId!: string
        let providerName!: string
        let providerProxyCode!: string

        test.beforeAll(async ({ workerAuthedRequest }) => {
            test.skip(!hasToken(), 'OAuth credentials required')
            const suffix = uid()
            providerName = `test-provider-${suffix}`
            providerProxyCode = `prov-${suffix}`
            const { id } = await createProvider(
                workerAuthedRequest,
                {
                    name: providerName,
                    description: 'TC-3 test provider',
                    proxyCode: providerProxyCode,
                },
                'delete-provider'
            )
            providerId = id
        })

        test('TC-3.1 — Returns 200 with empty body', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${PROVIDERS_PATH}/${providerId}`
            )
            assertStatus(response, 200)
            expect(await response.text()).toBe('')
        })

        test('TC-3.2 — Soft-deleted provider is excluded from GET /providers', async ({
            workerAuthedRequest,
        }) => {
            const providers = await getProviders(workerAuthedRequest)
            expect(providers.find((p) => p.id === providerId)).toBeUndefined()
        })

        test('TC-3.3 — PUT /providers/{id} returns 404 for a soft-deleted provider', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.put(
                `${PROVIDERS_PATH}/${providerId}`,
                {
                    data: {
                        name: providerName,
                        description: 'updated',
                        proxyCode: providerProxyCode,
                    },
                }
            )

            assertStatus(response, 404)
        })
    })

    // ─── 4. Block delete — provider has active endpoints ─────────────────────
    test.describe
        .serial('4. Block delete — provider has active endpoints', () => {
        let providerId!: string
        let providerName!: string
        let providerProxyCode!: string
        let apiConfigId!: string
        let apiVersionId!: string
        let endpointId!: string

        test.beforeAll(async ({ workerAuthedRequest }) => {
            test.skip(!hasToken(), 'OAuth credentials required')
            const suffix = uid()
            providerName = `test-provider-${suffix}`
            providerProxyCode = `prov-${suffix}`

            const provider = await createProvider(
                workerAuthedRequest,
                {
                    name: providerName,
                    description: 'TC-4 test provider',
                    proxyCode: providerProxyCode,
                },
                'delete-provider'
            )
            providerId = provider.id

            const apiConfig = await createApiConfig(
                workerAuthedRequest,
                {
                    name: `api-config-${suffix}`,
                    description: 'TC-4 api config',
                    isActive: true,
                },
                'delete-provider'
            )
            apiConfigId = apiConfig.id

            const apiVersion = await createApiVersion(
                workerAuthedRequest,
                apiConfigId,
                {
                    prefixPath: `/tc4-${suffix}`,
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
                    description: 'TC-4 provider endpoint',
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
        })

        test.afterAll(async ({ workerAuthedRequest }) => {
            if (endpointId) {
                await deleteProviderEndpoint(
                    workerAuthedRequest,
                    apiConfigId,
                    apiVersionId,
                    endpointId
                )
            }
            if (providerId) {
                await deleteProvider(workerAuthedRequest, providerId)
            }
        })

        test('TC-4.1 — Returns 400 provider_has_active_endpoints with correct error shape', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${PROVIDERS_PATH}/${providerId}`
            )
            assertStatus(response, 400)
            const body = (await response.json()) as ApiErrorBody
            expect(body.title).toBe('Provider.HasActiveEndpoints')
            expect(body.status).toBe(400)
            expect(body.detail).toBe(
                `Provider '${providerName}' is referenced by one or more ProviderApiEndpoints and cannot be deleted. Remove all associated endpoints first`
            )
            expect(body.type).toContain('rfc9110')
            expect(body.errors).toBeNull()
        })
    })

    // ─── 5. Block delete — provider referenced by integrator ─────────────────
    test.describe
        .serial('5. Block delete — provider referenced by integrator', () => {
        let providerId!: string
        let providerName!: string
        let providerProxyCode!: string
        let integratorId!: string
        let integratorName!: string
        let integratorAuth0Id!: string

        test.beforeAll(async ({ workerAuthedRequest }) => {
            test.skip(!hasToken(), 'OAuth credentials required')
            const suffix = uid()
            providerName = `test-provider-${suffix}`
            providerProxyCode = `prov-${suffix}`
            integratorName = `integrator-${suffix}`
            integratorAuth0Id = `auth0|test-${suffix}`

            const provider = await createProvider(
                workerAuthedRequest,
                {
                    name: providerName,
                    description: 'TC-5 test provider',
                    proxyCode: providerProxyCode,
                },
                'delete-provider'
            )
            providerId = provider.id

            const integrator = await createIntegrator(
                workerAuthedRequest,
                {
                    name: integratorName,
                    description: 'TC-5 integrator',
                    auth0Id: integratorAuth0Id,
                    allowedProviderProxyCodes: [providerProxyCode],
                    isActive: true,
                    hasUnlimitedProviderAccess: false,
                    isInternal: true,
                },
                'delete-provider'
            )
            integratorId = integrator.id
        })

        test.afterAll(async ({ workerAuthedRequest }) => {
            if (integratorId) {
                await deleteIntegrator(workerAuthedRequest, integratorId)
            }
            if (providerId) {
                await deleteProvider(workerAuthedRequest, providerId)
            }
        })

        test('TC-5.1 — Returns 400 provider_referenced_by_integrator with correct error shape', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${PROVIDERS_PATH}/${providerId}`
            )
            assertStatus(response, 400)
            const body = (await response.json()) as ApiErrorBody
            expect(body.title).toBe('Provider.ReferencedByIntegrator')
            expect(body.status).toBe(400)
            expect(body.detail).toBe(
                `Provider '${providerName}' is referenced by one or more Integrators and cannot be deleted. Remove the provider from all integrator access lists first`
            )
            expect(body.type).toContain('rfc9110')
            expect(body.errors).toBeNull()
        })
    })

    // ─── 6. Soft-delete validation — CREATE operations ────────────────────────
    test.describe
        .serial('6. Soft-delete validation — CREATE operations', () => {
        let deletedProxyCode!: string

        test.beforeAll(async ({ workerAuthedRequest }) => {
            test.skip(!hasToken(), 'OAuth credentials required')
            const suffix = uid()
            deletedProxyCode = `prov-${suffix}`

            const provider = await createProvider(
                workerAuthedRequest,
                {
                    name: `test-provider-${suffix}`,
                    description: 'TC-6 test provider — will be soft-deleted',
                    proxyCode: deletedProxyCode,
                },
                'delete-provider'
            )

            // Soft-delete the provider so downstream creates are blocked
            await deleteProvider(workerAuthedRequest, provider.id)
        })

        test('TC-6.1 — ProviderApiEndpoint CREATE returns 400 when proxyCodeValues references a soft-deleted proxyCode', async ({
            workerAuthedRequest,
        }) => {
            const suffix = uid()

            const apiConfig = await createApiConfig(
                workerAuthedRequest,
                {
                    name: `api-config-${suffix}`,
                    description: 'TC-6.1 api config',
                    isActive: true,
                },
                'delete-provider'
            )

            const apiVersion = await createApiVersion(
                workerAuthedRequest,
                apiConfig.id,
                {
                    prefixPath: `/tc61-${suffix}`,
                    httpMethod: 'GET',
                    isActive: true,
                    allowedScopes: ['test-scope'],
                    schemaValidators: [],
                }
            )

            const response = await workerAuthedRequest.post(
                `/${config.configApiBasePath}/api-configs/${apiConfig.id}/versions/${apiVersion.id}/provider-endpoints`,
                {
                    data: {
                        name: `endpoint-${suffix}`,
                        description: 'TC-6.1 endpoint',
                        endpoint: 'https://example.com/test',
                        providerProxyConfig: {
                            proxyField: 'X-Api-Provider',
                            container: 'Header',
                            proxyCodeValues: [deletedProxyCode],
                            isCaseSensitive: false,
                        },
                        authRequest: {
                            url: null,
                            authType: 'Anonymous',
                            fieldValues: [],
                        },
                    },
                }
            )

            assertStatus(response, 400)
        })

        test('TC-6.2 — Integrator CREATE returns 400 when allowedProviderProxyCodes references a soft-deleted proxyCode', async ({
            workerAuthedRequest,
        }) => {
            const suffix = uid()

            const response = await workerAuthedRequest.post(
                `/${config.configApiBasePath}/integrators`,
                {
                    data: {
                        name: `integrator-${suffix}`,
                        description: 'TC-6.2 integrator',
                        auth0Id: `auth0|test-${suffix}`,
                        allowedProviderProxyCodes: [deletedProxyCode],
                    },
                }
            )

            assertStatus(response, 400)
        })
    })

    // ─── 7. Soft-delete validation — UPDATE operations ────────────────────────
    test.describe('7. Soft-delete validation — UPDATE operations', () => {
        test.describe
            .serial('7.1 — UPDATE provider endpoint rejects soft-deleted proxyCode', () => {
            let deletedProxyCode!: string
            let provider2Id!: string
            let apiConfigId!: string
            let apiVersionId!: string
            let endpointId!: string

            test.beforeAll(async ({ workerAuthedRequest }) => {
                test.skip(!hasToken(), 'OAuth credentials required')
                const suffix = uid()
                deletedProxyCode = `prov1-${suffix}`
                const activeProxyCode = `prov2-${suffix}`

                // provider1 — will be soft-deleted
                const provider1 = await createProvider(
                    workerAuthedRequest,
                    {
                        name: `test-provider1-${suffix}`,
                        description: 'TC-7.1 provider1 (will be soft-deleted)',
                        proxyCode: deletedProxyCode,
                    },
                    'delete-provider'
                )

                // provider2 — stays active; cleaned up in afterAll
                const provider2 = await createProvider(
                    workerAuthedRequest,
                    {
                        name: `test-provider2-${suffix}`,
                        description: 'TC-7.1 provider2 (stays active)',
                        proxyCode: activeProxyCode,
                    },
                    'delete-provider'
                )
                provider2Id = provider2.id

                const apiConfig = await createApiConfig(
                    workerAuthedRequest,
                    {
                        name: `api-config-${suffix}`,
                        description: 'TC-7.1 api config',
                        isActive: true,
                    },
                    'delete-provider'
                )
                apiConfigId = apiConfig.id

                const apiVersion = await createApiVersion(
                    workerAuthedRequest,
                    apiConfigId,
                    {
                        prefixPath: `/tc71-${suffix}`,
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
                        description: 'TC-7.1 provider endpoint',
                        endpoint: 'https://example.com/test',
                        providerProxyConfig: {
                            proxyField: 'X-Api-Provider',
                            container: 'Header',
                            proxyCodeValues: [activeProxyCode],
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

                // Soft-delete provider1 so the update is blocked
                await deleteProvider(workerAuthedRequest, provider1.id)
            })

            test.afterAll(async ({ workerAuthedRequest }) => {
                if (endpointId) {
                    await deleteProviderEndpoint(
                        workerAuthedRequest,
                        apiConfigId,
                        apiVersionId,
                        endpointId
                    )
                }
                if (provider2Id) {
                    await deleteProvider(workerAuthedRequest, provider2Id)
                }
            })

            test('TC-7.1 — ProviderApiEndpoint UPDATE returns 400 when proxyCodeValues references a soft-deleted proxyCode', async ({
                workerAuthedRequest,
            }) => {
                const response = await workerAuthedRequest.put(
                    `/${config.configApiBasePath}/api-configs/${apiConfigId}/versions/${apiVersionId}/provider-endpoints/${endpointId}`,
                    {
                        data: {
                            providerProxyConfig: {
                                proxyField: 'X-Api-Provider',
                                container: 'Header',
                                proxyCodeValues: [deletedProxyCode],
                                isCaseSensitive: false,
                            },
                        },
                    }
                )

                assertStatus(response, 400)
            })
        })

        test.describe
            .serial('7.2 — UPDATE integrator rejects soft-deleted proxyCode', () => {
            let deletedProxyCode!: string
            let provider2Id!: string
            let provider2ProxyCode!: string
            let integratorId!: string
            let integratorName!: string
            let integratorAuth0Id!: string

            test.beforeAll(async ({ workerAuthedRequest }) => {
                test.skip(!hasToken(), 'OAuth credentials required')
                const suffix = uid()
                deletedProxyCode = `prov1-${suffix}`
                provider2ProxyCode = `prov2-${suffix}`
                integratorName = `integrator-${suffix}`
                integratorAuth0Id = `auth0|test-${suffix}`

                // provider1 — will be soft-deleted
                const provider1 = await createProvider(
                    workerAuthedRequest,
                    {
                        name: `test-provider1-${suffix}`,
                        description: 'TC-7.2 provider1 (will be soft-deleted)',
                        proxyCode: deletedProxyCode,
                    },
                    'delete-provider'
                )

                // provider2 — stays active; cleaned up in afterAll
                const provider2 = await createProvider(
                    workerAuthedRequest,
                    {
                        name: `test-provider2-${suffix}`,
                        description: 'TC-7.2 provider2 (stays active)',
                        proxyCode: provider2ProxyCode,
                    },
                    'delete-provider'
                )
                provider2Id = provider2.id

                const integrator = await createIntegrator(
                    workerAuthedRequest,
                    {
                        name: integratorName,
                        description: 'TC-7.2 integrator',
                        auth0Id: integratorAuth0Id,
                        allowedProviderProxyCodes: [provider2ProxyCode],
                        isActive: true,
                        hasUnlimitedProviderAccess: false,
                        isInternal: true,
                    },
                    'delete-provider'
                )
                integratorId = integrator.id

                // Soft-delete provider1 so the update is blocked
                await deleteProvider(workerAuthedRequest, provider1.id)
            })

            test.afterAll(async ({ workerAuthedRequest }) => {
                if (integratorId) {
                    await deleteIntegrator(workerAuthedRequest, integratorId)
                }
                if (provider2Id) {
                    await deleteProvider(workerAuthedRequest, provider2Id)
                }
            })

            test('TC-7.2 — Integrator UPDATE returns 400 when allowedProviderProxyCodes references a soft-deleted proxyCode', async ({
                workerAuthedRequest,
            }) => {
                const response = await workerAuthedRequest.put(
                    `/${config.configApiBasePath}/integrators/${integratorId}`,
                    {
                        data: {
                            name: integratorName,
                            description:
                                'TC-7.2 integrator — updated to reference deleted proxyCode',
                            auth0Id: integratorAuth0Id,
                            allowedProviderProxyCodes: [deletedProxyCode],
                        },
                    }
                )

                assertStatus(response, 400)
            })
        })
    })

    // ─── 8. Proxy routing rejection ──────────────────────────────────────────
    test.describe.serial('8. Proxy routing rejection', () => {
        let deletedProxyCode!: string
        let activeProviderId!: string
        let apiConfigId!: string
        let apiVersionId!: string
        let endpointId!: string
        let prefixPath!: string

        test.beforeAll(async ({ workerAuthedRequest }) => {
            test.skip(!hasToken(), 'OAuth credentials required')
            const suffix = uid()
            const activeProxyCode = `prov-act-${suffix}`
            deletedProxyCode = `prov-del-${suffix}`
            prefixPath = `/tc81-${suffix}`

            // Active provider - referenced by the routable endpoint so the proxy has a real route.
            const activeProvider = await createProvider(
                workerAuthedRequest,
                {
                    name: `active-provider-${suffix}`,
                    description: 'TC-8.1 active provider (route target)',
                    proxyCode: activeProxyCode,
                },
                'delete-provider'
            )
            activeProviderId = activeProvider.id

            // Secondary provider — soft-deleted; its proxyCode is what we send in the X-Api-Provider header.
            const deletedProvider = await createProvider(
                workerAuthedRequest,
                {
                    name: `deleted-provider-${suffix}`,
                    description: 'TC-8.1 provider to soft-delete',
                    proxyCode: deletedProxyCode,
                },
                'delete-provider'
            )

            const apiConfig = await createApiConfig(
                workerAuthedRequest,
                {
                    name: `api-config-${suffix}`,
                    description: 'TC-8.1 api config',
                    isActive: true,
                },
                'delete-provider'
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
                    description: 'TC-8.1 endpoint (active provider target)',
                    endpoint: 'https://example.com/test',
                    providerProxyConfig: {
                        proxyField: 'X-Api-Provider',
                        container: 'Header',
                        proxyCodeValues: [activeProxyCode],
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

            // Soft-delete the secondary provider; routable endpoint references the active one only.
            await deleteProvider(workerAuthedRequest, deletedProvider.id)
        })

        test.afterAll(async ({ workerAuthedRequest }) => {
            if (endpointId) {
                await deleteProviderEndpoint(
                    workerAuthedRequest,
                    apiConfigId,
                    apiVersionId,
                    endpointId
                )
            }
            if (activeProviderId) {
                await deleteProvider(workerAuthedRequest, activeProviderId)
            }
        })

        test('TC-8.1 — Proxy routing rejects X-Api-Provider header matching a soft-deleted provider proxyCode', async ({
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
                    headers: { 'X-Api-Provider': deletedProxyCode },
                })
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
})
