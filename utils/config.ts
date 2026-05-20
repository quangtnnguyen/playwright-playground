import * as dotenv from 'dotenv'

dotenv.config()

/**
 * Central config object driven by environment variables.
 * Set values in .env (copy from .env.example).
 */
export const config = {
    /** Base URL of the fis-common-standard-proxy API */
    baseUrl: process.env['BASE_URL'] ?? 'http://localhost:5000',

    /** Route prefix for the config management API (e.g. proxy-configs/v1) */
    configApiBasePath:
        process.env['CONFIG_API_BASE_PATH'] ?? 'proxy-configs/v1',

    /** Path segment for the proxy search route (e.g. v1/search) */
    proxySearchPath: process.env['PROXY_SEARCH_PATH'] ?? 'v1/search',

    /** Path segment for the proxy cancel-quotes route (e.g. v1/cancel/quotes) */
    proxyCancelQuotesPath:
        process.env['PROXY_CANCEL_QUOTES_PATH'] ?? 'v1/cancel/quotes',

    /** OAuth authorization URL */
    authUrl: process.env['AUTH_URL'] ?? '',

    /** OAuth client ID for M2M token fetch */
    authClientId: process.env['AUTH_CLIENT_ID'] ?? '',

    /** OAuth client secret for M2M token fetch */
    authClientSecret: process.env['AUTH_CLIENT_SECRET'] ?? '',

    /** OAuth audience */
    authAudience: process.env['AUTH_AUDIENCE'] ?? '',

    /** True when running in CI environment */
    isCI: Boolean(process.env['CI']),
} as const

/** Returns true when OAuth credentials are available to obtain a token */
export const hasToken = (): boolean =>
    config.authUrl.length > 0 &&
    config.authClientId.length > 0 &&
    config.authClientSecret.length > 0 &&
    config.authAudience.length > 0
