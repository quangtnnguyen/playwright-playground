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
    deleteMapperSnapshot,
    getMapperSnapshots,
    updateMapperConfig,
} from '@helpers/api-requests'
import { ApiErrorBody } from '@helpers/api-requests/ApiErrorBody'

const SPEC_TAG = 'delete-mapper-config-snapshot'

/** Well-formed ObjectId with no matching document in any environment */
const NONEXISTENT_ID = '68f064df1ba266b972ee56a0'

/** Build the snapshots route for a given mapperConfigId */
const snapshotsPath = (mapperConfigId: string) =>
    `/${config.configApiBasePath}/mappers/${mapperConfigId}/snapshots`

/** Short random suffix — makes test data names unique per run */
const uid = () =>
    Date.now().toString(36) + Math.random().toString(36).slice(2, 5)

// =============================================================================

test.describe('DELETE /mappers/{mapperConfigId}/snapshots/{snapshotId}', () => {
    // ─── 1. Unauthenticated — always runs ────────────────────────────────────
    test.describe('1. Unauthenticated', () => {
        test('TC-1.1 — Returns 401 when no Authorization header is provided', async ({
            apiRequest,
        }) => {
            const response = await apiRequest.delete(
                `${snapshotsPath(NONEXISTENT_ID)}/${NONEXISTENT_ID}`
            )

            assertStatus(response, 401)
        })

        test('TC-1.2 — Returns 401 or 403 when Authorization header carries an invalid token', async ({
            apiRequest,
        }) => {
            const response = await apiRequest.delete(
                `${snapshotsPath(NONEXISTENT_ID)}/${NONEXISTENT_ID}`,
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
        let mapperConfig1Id!: string
        let snapshot2Id!: string

        test.beforeAll(async ({ workerAuthedRequest }) => {
            test.skip(!hasToken(), 'OAuth credentials required')
            const suffix = uid()
            const proxyCode = `prov-${suffix}`

            await createProvider(
                workerAuthedRequest,
                {
                    name: `test-provider-${suffix}`,
                    description: 'TC-2 test provider',
                    proxyCode,
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

            const apiVersion = await createApiVersion(
                workerAuthedRequest,
                apiConfig.id,
                {
                    prefixPath: `/tc2-${suffix}`,
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
                    description: 'TC-2 provider endpoint',
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

            // Two integrators required — mapper configs enforce unique (integratorId, apiVersionId, providerApiEndpointId)
            const integrator1 = await createIntegrator(
                workerAuthedRequest,
                {
                    name: `integrator1-${suffix}`,
                    description: 'TC-2 integrator 1',
                    auth0Id: `auth0|tc2-1-${suffix}`,
                    allowedProviderProxyCodes: [proxyCode],
                    isActive: true,
                    hasUnlimitedProviderAccess: false,
                    isInternal: true,
                },
                SPEC_TAG
            )

            const integrator2 = await createIntegrator(
                workerAuthedRequest,
                {
                    name: `integrator2-${suffix}`,
                    description: 'TC-2 integrator 2',
                    auth0Id: `auth0|tc2-2-${suffix}`,
                    allowedProviderProxyCodes: [proxyCode],
                    isActive: true,
                    hasUnlimitedProviderAccess: false,
                    isInternal: true,
                },
                SPEC_TAG
            )

            const mc1 = await createMapperConfig(
                workerAuthedRequest,
                {
                    integratorId: integrator1.id,
                    apiVersionId: apiVersion.id,
                    providerApiEndpointId: endpoint.id,
                    requestFields: [],
                    responseFields: [],
                },
                SPEC_TAG
            )
            mapperConfig1Id = mc1.id

            const mc2 = await createMapperConfig(
                workerAuthedRequest,
                {
                    integratorId: integrator2.id,
                    apiVersionId: apiVersion.id,
                    providerApiEndpointId: endpoint.id,
                    requestFields: [],
                    responseFields: [],
                },
                SPEC_TAG
            )

            await createMapperSnapshot(workerAuthedRequest, mapperConfig1Id, {
                requestFields: [],
                responseFields: [],
            })

            const snap2 = await createMapperSnapshot(workerAuthedRequest, mc2.id, {
                requestFields: [],
                responseFields: [],
            })
            snapshot2Id = snap2.id
        })

        test('TC-2.1 — Returns 404 for a non-existent mapperConfigId', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${snapshotsPath(NONEXISTENT_ID)}/${NONEXISTENT_ID}`
            )

            assertStatus(response, 404)
        })

        test('TC-2.2 — Returns 404 for a non-existent snapshotId under a real mapperConfig', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${snapshotsPath(mapperConfig1Id)}/${NONEXISTENT_ID}`
            )

            assertStatus(response, 404)
        })

        test('TC-2.3 — Returns 400 with General.Validation error for a malformed mapperConfigId', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${snapshotsPath('not-a-valid-id')}/${NONEXISTENT_ID}`
            )

            assertStatus(response, 400)
            const body = (await response.json()) as ApiErrorBody
            expect(body.title).toBe('General.Validation')
            expect(body.status).toBe(400)
            expect(body.type).toContain('rfc9110')
            expect(body.detail).toBeTruthy()
            expect(body.errors).not.toBeNull()
        })

        test('TC-2.4 — Returns 400 with General.Validation error for a malformed snapshotId', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${snapshotsPath(mapperConfig1Id)}/not-a-valid-id`
            )

            assertStatus(response, 400)
            const body = (await response.json()) as ApiErrorBody
            expect(body.title).toBe('General.Validation')
            expect(body.status).toBe(400)
            expect(body.type).toContain('rfc9110')
            expect(body.detail).toBeTruthy()
            expect(body.errors).not.toBeNull()
        })

        test('TC-2.5 — Returns 404 when snapshotId belongs to a different mapperConfig', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${snapshotsPath(mapperConfig1Id)}/${snapshot2Id}`
            )

            assertStatus(response, 404)
        })
    })

    // ─── 3. Successful soft delete — 200 + side effects ──────────────────────
    test.describe.serial('3. Successful soft delete — 200 + side effects', () => {
        let mapperConfigId!: string
        let deletedSnapshotId!: string

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

            // Create two snapshots — API auto-sets the newest as active.
            // The first snapshot becomes non-active once the second is created.
            const first = await createMapperSnapshot(workerAuthedRequest, mapperConfigId, {
                requestFields: [],
                responseFields: [],
            })
            deletedSnapshotId = first.id

            // Creating a second snapshot makes the first one non-active
            await createMapperSnapshot(workerAuthedRequest, mapperConfigId, {
                requestFields: [],
                responseFields: [],
            })
        })

        test('TC-3.1 — Returns 200 with empty body', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${snapshotsPath(mapperConfigId)}/${deletedSnapshotId}`
            )

            assertStatus(response, 200)
            expect(await response.text()).toBe('')
        })

        test('TC-3.2 — Soft-deleted snapshot is excluded from GET /mappers/{id}/snapshots', async ({
            workerAuthedRequest,
        }) => {
            const snapshots = await getMapperSnapshots(workerAuthedRequest, mapperConfigId)

            expect(snapshots.find((s) => s.id === deletedSnapshotId)).toBeUndefined()
        })

        test('TC-3.3 — Re-deleting a soft-deleted snapshot returns 404', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${snapshotsPath(mapperConfigId)}/${deletedSnapshotId}`
            )

            assertStatus(response, 404)
        })

        test('TC-3.4 — PUT /mappers/{id} with soft-deleted snapshotId as activeMapperConfigSnapshotId returns 400 or 404', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.put(
                `/${config.configApiBasePath}/mappers/${mapperConfigId}`,
                {
                    data: {
                        activeMapperConfigSnapshotId: deletedSnapshotId,
                    },
                }
            )

            expect([400, 404]).toContain(response.status())
        })
    })

    // ─── 4. Block delete — snapshot is the active snapshot ───────────────────
    test.describe.serial('4. Block delete — snapshot is the active snapshot', () => {
        let mapperConfigId!: string
        let activeSnapshotId!: string

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

            const snap = await createMapperSnapshot(workerAuthedRequest, mapperConfigId, {
                requestFields: [],
                responseFields: [],
            })
            activeSnapshotId = snap.id

            // Set the snapshot as active so deleting it should be blocked
            await updateMapperConfig(workerAuthedRequest, mapperConfigId, {
                activeMapperConfigSnapshotId: activeSnapshotId,
            })
        })

        test('TC-4.1 — Returns 400 when attempting to delete the active snapshot', async ({
            workerAuthedRequest,
        }) => {
            const response = await workerAuthedRequest.delete(
                `${snapshotsPath(mapperConfigId)}/${activeSnapshotId}`
            )

            assertStatus(response, 400)
            const body = (await response.json()) as ApiErrorBody
            expect(body.title).toMatch(/MapperConfigSnapshot/)
            expect(body.status).toBe(400)
            expect(body.type).toContain('rfc9110')
            expect(body.detail).toBeTruthy()
            expect(body.errors).toBeNull()
        })
    })
})
