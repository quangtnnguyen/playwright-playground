import { test as base, APIRequestContext } from '@playwright/test'
import { getAuthHeaders } from '@helpers/auth.helper'
import { hasToken } from '@helpers/config'
import { config } from '@helpers/config'

/**
 * Custom fixture types extending the base Playwright fixtures.
 */
type ApiFixtures = {
    /** Unauthenticated APIRequestContext with JSON accept header */
    apiRequest: APIRequestContext
    /** Authenticated APIRequestContext — includes Authorization header */
    authedRequest: APIRequestContext
    /** Unauthenticated context targeting the Transformer service */
    transformerApiRequest: APIRequestContext
    /** Authenticated context targeting the Transformer service */
    authedTransformerRequest: APIRequestContext
}

type WorkerFixtures = {
    /** Single authenticated context shared across the whole worker (spec file). */
    workerAuthedRequest: APIRequestContext
    /** Worker-scoped authenticated context for the Transformer service */
    workerAuthedTransformerRequest: APIRequestContext
}

/**
 * Extended test object with api-specific fixtures.
 * Import `test` and `expect` from this file in spec files.
 */
export const test = base.extend<ApiFixtures, WorkerFixtures>({
    // Unauthenticated context — base URL set in playwright.config.ts
    apiRequest: async ({ playwright }, use) => {
        const context = await playwright.request.newContext({
            baseURL: config.baseUrl,
            extraHTTPHeaders: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        })
        await use(context)
        await context.dispose()
    },

    // Authenticated context — fetches or reuses cached OAuth token
    authedRequest: async ({ playwright }, use) => {
        const context = await playwright.request.newContext({
            baseURL: config.baseUrl,
            extraHTTPHeaders: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...(await getAuthHeaders()),
            },
        })
        await use(context)
        await context.dispose()
    },

    // Worker-scoped authenticated context — created once per worker (spec file).
    // Available in beforeAll, afterAll, and test hooks without manual ctx management.
    workerAuthedRequest: [
        async ({ playwright }, use) => {
            if (!hasToken()) {
                // Credentials absent — provide a bare context.
                // Tests using this fixture must guard with test.skip(!hasToken(), …).
                const ctx = await playwright.request.newContext({
                    baseURL: config.baseUrl,
                })
                await use(ctx)
                await ctx.dispose()
                return
            }
            const ctx = await playwright.request.newContext({
                baseURL: config.baseUrl,
                extraHTTPHeaders: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    ...(await getAuthHeaders()),
                },
            })
            await use(ctx)
            await ctx.dispose()
        },
        { scope: 'worker' },
    ],

    // Transformer service contexts — baseURL points to TRANSFORMER_BASE_URL

    transformerApiRequest: async ({ playwright }, use) => {
        const context = await playwright.request.newContext({
            baseURL: config.transformerBaseUrl,
            extraHTTPHeaders: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        })
        await use(context)
        await context.dispose()
    },

    authedTransformerRequest: async ({ playwright }, use) => {
        const context = await playwright.request.newContext({
            baseURL: config.transformerBaseUrl,
            extraHTTPHeaders: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
                ...(await getAuthHeaders()),
            },
        })
        await use(context)
        await context.dispose()
    },

    workerAuthedTransformerRequest: [
        async ({ playwright }, use) => {
            if (!hasToken()) {
                // Credentials absent — provide a bare context.
                // Tests using this fixture must guard with test.skip(!hasToken(), …).
                const ctx = await playwright.request.newContext({
                    baseURL: config.transformerBaseUrl,
                })
                await use(ctx)
                await ctx.dispose()
                return
            }
            const ctx = await playwright.request.newContext({
                baseURL: config.transformerBaseUrl,
                extraHTTPHeaders: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    ...(await getAuthHeaders()),
                },
            })
            await use(ctx)
            await ctx.dispose()
        },
        { scope: 'worker' },
    ],
})

export { expect } from '@playwright/test'
