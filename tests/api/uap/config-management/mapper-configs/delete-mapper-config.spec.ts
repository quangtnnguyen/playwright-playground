import { test, expect } from '@fixtures'
import { assertStatus } from '@helpers/assertions.helper'
import { config, hasToken } from '@helpers/config'
import {
    createProvider,
    createIntegrator,
    createApiConfig,
    createApiVersion,
    createProviderEndpoint,
    createMapperConfig,
    createMapperSnapshot,
    getMapperConfigs,
} from '@helpers/api-requests'
import { ApiErrorBody } from '@helpers/api-requests/ApiErrorBody'

const SPEC_TAG = 'delete-mapper-config'

/** Well-formed ObjectId with no matching document in any environment */
const NONEXISTENT_ID = '68f064df1ba266b972ee56a0'

const mappersPath = `/${config.configApiBasePath}/mappers`

/** Short random suffix — makes test data names unique per run */
const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

// =============================================================================

test.describe('DELETE /mappers/{mapperConfigId}', () => {
    // ─── 1. Unauthenticated — always runs ────────────────────────────────────
    test.describe('1. Unauthenticated', () => {
        test('TC-1.1 — Returns 401 when no Authorization header is provided', async ({
            apiRequest,
        }) => {
            const response = await apiRequest.delete(
                `${mappersPath}/${NONEXISTENT_ID}`
            )

            assertStatus(response, 401)
        })

        test('TC-1.2 — Returns 401 or 403 when Authorization header carries an invalid token', async ({
            apiRequest,
        }) => {
            const response = await apiRequest.delete(
                `${mappersPath}/${NONEXISTENT_ID}`,
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
        test.beforeAll(() => {
            test.skip(!hasToken(), 'OAuth credentials required')
        })

        test('TC-2.1 — Returns 404 for a non-existent mapperConfigId', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${mappersPath}/${NONEXISTENT_ID}`
            )

            assertStatus(response, 404)
        })

        test('TC-2.2 — Returns 400 with General.Validation error for a malformed mapperConfigId', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${mappersPath}/not-a-valid-id`
            )

            assertStatus(response, 400)
            const body = (await response.json()) as ApiErrorBody
            expect(body.title).toBe('General.Validation')
            expect(body.status).toBe(400)
            expect(body.type).toContain('rfc9110')
            expect(body.detail).toBeTruthy()
            expect(body.errors).not.toBeNull()
        })
    })

    // ─── 3. Successful soft delete — 200 + cascade + side effects ────────────
    test.describe
        .serial('3. Successful soft delete — 200 + cascade + side effects', () => {
        let mapperConfigId!: string
        let providerApiEndpointId!: string
        let integratorId!: string

        test.beforeAll(async ({ workerAuthedRequest }) => {
            test.skip(!hasToken(), 'OAuth credentials required')
            const suffix = uid()
            const proxyCode = `prov-${suffix}`

            await createProvider(
                workerAuthedRequest,
                {
                    name: `test-provider-${suffix}`,
                    description: 'TC-3 test provider',
                    proxyCode,
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

            const apiVersion = await createApiVersion(
                workerAuthedRequest,
                apiConfig.id,
                {
                    prefixPath: `/tc3-${suffix}`,
                    httpMethod: 'GET',
                    isActive: true,
                    allowedScopes: ['test-scope'],
                    schemaValidators: [],
                }
            )

            const endpoint = await createProviderEndpoint(
                workerAuthedRequest,
                apiConfig.id,
                apiVersion.id,
                {
                    apiId: apiConfig.id,
                    apiVersionId: apiVersion.id,
                    name: `endpoint-${suffix}`,
                    description: 'TC-3 provider endpoint',
                    endpoint: 'https://example.com/test',
                    providerProxyConfig: {
                        proxyField: 'X-Api-Provider',
                        container: 'Header',
                        proxyCodeValues: [proxyCode],
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
            providerApiEndpointId = endpoint.id

            const integrator = await createIntegrator(
                workerAuthedRequest,
                {
                    name: `integrator-${suffix}`,
                    description: 'TC-3 integrator',
                    auth0Id: `auth0|tc3-${suffix}`,
                    allowedProviderProxyCodes: [proxyCode],
                    isActive: true,
                    hasUnlimitedProviderAccess: false,
                    isInternal: true,
                },
                SPEC_TAG
            )
            integratorId = integrator.id

            const mc = await createMapperConfig(
                workerAuthedRequest,
                {
                    integratorId: integrator.id,
                    apiVersionId: apiVersion.id,
                    providerApiEndpointId: endpoint.id,
                    requestFields: [],
                    responseFields: [],
                },
                SPEC_TAG
            )
            mapperConfigId = mc.id

            // Create 2 snapshots — the second auto-becomes active, exercising
            // cascade-delete of the active snapshot along with the non-active one.
            await createMapperSnapshot(workerAuthedRequest, mapperConfigId, {
                requestFields: [],
                responseFields: [],
            })
            await createMapperSnapshot(workerAuthedRequest, mapperConfigId, {
                requestFields: [],
                responseFields: [],
            })
        })

        test('TC-3.1 — Returns 200 with empty body', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${mappersPath}/${mapperConfigId}`
            )

            assertStatus(response, 200)
            expect(await response.text()).toBe('')
        })

        test('TC-3.2 — Soft-deleted MapperConfig is excluded from GET /mappers', async ({
            workerAuthedRequest,
        }) => {
            const configs = await getMapperConfigs(workerAuthedRequest)

            expect(configs.find((c) => c.id === mapperConfigId)).toBeUndefined()
        })

        test('TC-3.3 — PUT /mappers/{id} returns 404 for a soft-deleted MapperConfig', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.put(
                `${mappersPath}/${mapperConfigId}`,
                { data: { isActive: false } }
            )

            assertStatus(response, 404)
        })

        test('TC-3.4 — Re-deleting a soft-deleted MapperConfig returns 404', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${mappersPath}/${mapperConfigId}`
            )

            assertStatus(response, 404)
        })

        test('TC-3.5 — Cascade: child snapshots are soft-deleted', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.get(
                `${mappersPath}/${mapperConfigId}/snapshots`
            )

            expect([200, 404]).toContain(response.status())

            if (response.status() === 200) {
                const body = await response.json()
                const items: unknown[] = Array.isArray(body)
                    ? body
                    : ((body as { items: unknown[] }).items ?? [])
                expect(items).toHaveLength(0)
            }
        })

        test('TC-3.6 — Runtime enum lookup returns 404 for a soft-deleted MapperConfig', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.get(
                `${mappersPath}/${providerApiEndpointId}/${integratorId}`
            )

            assertStatus(response, 404)
        })
    })

    // ─── 4. Uniqueness bypass — re-create with same combination ──────────────
    test.describe
        .serial('4. Uniqueness bypass — re-create with same endpoint combination after soft-delete', () => {
        let deletedMapperConfigId!: string
        let reuseIntegratorId!: string
        let reuseApiVersionId!: string
        let reuseEndpointId!: string

        test.beforeAll(async ({ workerAuthedRequest }) => {
            test.skip(!hasToken(), 'OAuth credentials required')
            const suffix = uid()
            const proxyCode = `prov-${suffix}`

            await createProvider(
                workerAuthedRequest,
                {
                    name: `test-provider-${suffix}`,
                    description: 'TC-4 test provider',
                    proxyCode,
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

            const apiVersion = await createApiVersion(
                workerAuthedRequest,
                apiConfig.id,
                {
                    prefixPath: `/tc4-${suffix}`,
                    httpMethod: 'GET',
                    isActive: true,
                    allowedScopes: ['test-scope'],
                    schemaValidators: [],
                }
            )
            reuseApiVersionId = apiVersion.id

            const endpoint = await createProviderEndpoint(
                workerAuthedRequest,
                apiConfig.id,
                apiVersion.id,
                {
                    apiId: apiConfig.id,
                    apiVersionId: apiVersion.id,
                    name: `endpoint-${suffix}`,
                    description: 'TC-4 provider endpoint',
                    endpoint: 'https://example.com/test',
                    providerProxyConfig: {
                        proxyField: 'X-Api-Provider',
                        container: 'Header',
                        proxyCodeValues: [proxyCode],
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
            reuseEndpointId = endpoint.id

            const integrator = await createIntegrator(
                workerAuthedRequest,
                {
                    name: `integrator-${suffix}`,
                    description: 'TC-4 integrator',
                    auth0Id: `auth0|tc4-${suffix}`,
                    allowedProviderProxyCodes: [proxyCode],
                    isActive: true,
                    hasUnlimitedProviderAccess: false,
                    isInternal: true,
                },
                SPEC_TAG
            )
            reuseIntegratorId = integrator.id

            const mc = await createMapperConfig(
                workerAuthedRequest,
                {
                    integratorId: integrator.id,
                    apiVersionId: apiVersion.id,
                    providerApiEndpointId: endpoint.id,
                    requestFields: [],
                    responseFields: [],
                },
                SPEC_TAG
            )
            deletedMapperConfigId = mc.id

            // Soft-delete the mapper config so the same combination is reusable
            const deleteRes = await workerAuthedRequest.delete(
                `${mappersPath}/${deletedMapperConfigId}`
            )
            if (!deleteRes.ok()) {
                throw new Error(
                    `TC-4 beforeAll: soft-delete failed (${deleteRes.status()}): ${await deleteRes.text()}`
                )
            }
        })

        test('TC-4.1 — POST /mappers with the same combination succeeds after soft-delete', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.post(mappersPath, {
                data: {
                    integratorId: reuseIntegratorId,
                    apiVersionId: reuseApiVersionId,
                    providerApiEndpointId: reuseEndpointId,
                    requestFields: [],
                    responseFields: [],
                },
            })

            expect([200, 201]).toContain(response.status())
            const body = (await response.json()) as { id: string }
            expect(body.id).toBeTruthy()
            expect(body.id).not.toBe(deletedMapperConfigId)
        })
    })
})
