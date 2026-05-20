import { APIRequest, APIRequestContext } from '@playwright/test'
import { getAccessToken } from './token-manager'
import { config } from './config'

/**
 * Builds a fresh authenticated APIRequestContext for use in beforeAll hooks.
 * Accepts any object with a `request.newContext` method — satisfies Playwright's
 * `playwright` fixture without importing its exact type.
 */
export const makeAuthedContext = async ({
    request,
}: {
    request: Pick<APIRequest, 'newContext'>
}): Promise<APIRequestContext> => {
    return request.newContext({
        baseURL: config.baseUrl,
        extraHTTPHeaders: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            ...(await getAuthHeaders()),
        },
    })
}

/** Returns Authorization header with a fresh or cached OAuth token */
export const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const token = await getAccessToken()
    return { Authorization: `Bearer ${token}` }
}

/**
 * Returns auth headers only when credentials are configured.
 * Returns empty object otherwise (allows unauthenticated requests).
 */
export const getOptionalAuthHeaders = async (): Promise<
    Record<string, string>
> => {
    try {
        return await getAuthHeaders()
    } catch {
        return {}
    }
}
