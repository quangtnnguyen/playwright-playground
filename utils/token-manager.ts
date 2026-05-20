import { config } from './config'

interface TokenCache {
    accessToken: string
    /** Unix timestamp (ms) after which the token should be refreshed */
    expiresAt: number
}

interface OAuthTokenResponse {
    access_token: string
    expires_in: number
    token_type: string
}

// Per-worker in-memory cache — each Playwright worker has its own module scope
let cache: TokenCache | null = null

/** Refresh buffer: re-fetch 30 seconds before actual expiry */
const EXPIRY_BUFFER_MS = 30_000

/**
 * Returns a valid access token, fetching a new one from the OAuth server when
 * the cache is empty or within 30 seconds of expiring.
 */
export async function getAccessToken(): Promise<string> {
    const now = Date.now()
    if (cache && cache.expiresAt > now + EXPIRY_BUFFER_MS) {
        return cache.accessToken
    }

    const response = await fetch(config.authUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: config.authClientId,
            client_secret: config.authClientSecret,
            audience: config.authAudience,
            grant_type: 'client_credentials',
        }),
    })

    if (!response.ok) {
        const body = await response.text()
        throw new Error(
            `OAuth token fetch failed (${response.status}): ${body}`
        )
    }

    const data = (await response.json()) as OAuthTokenResponse
    cache = {
        accessToken: data.access_token,
        expiresAt: now + data.expires_in * 1000,
    }

    return cache.accessToken
}

/** Evicts the cached token, forcing a fresh fetch on the next call */
export function invalidateToken(): void {
    cache = null
}
