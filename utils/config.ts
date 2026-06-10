import * as dotenv from 'dotenv'

dotenv.config()

/**
 * Central config object driven by environment variables.
 * Set values in .env (copy from .env.example).
 */
export const config = {
    /** Base URL of the fis-common-standard-proxy API (config management) */
    baseUrl: process.env['BASE_URL'] ?? 'http://localhost:5000',

    /** Base URL of the proxy server (runtime request routing) */
    proxyBaseUrl: process.env['PROXY_BASE_URL'] ?? 'http://localhost:5001',

    /** Route prefix for the config management API (e.g. proxy-configs/v1) */
    configApiBasePath:
        process.env['CONFIG_API_BASE_PATH'] ?? 'proxy-configs/v1',

    /** OAuth authorization URL */
    authUrl: process.env['AUTH_URL'] ?? '',

    /** OAuth client ID for M2M token fetch */
    authClientId: process.env['AUTH_CLIENT_ID'] ?? '',

    /** OAuth client secret for M2M token fetch */
    authClientSecret: process.env['AUTH_CLIENT_SECRET'] ?? '',

    /** OAuth audience */
    authAudience: process.env['AUTH_AUDIENCE'] ?? '',

    /** Base URL of the fis-common-transformer API */
    transformerBaseUrl: process.env['TRANSFORMER_BASE_URL'] ?? '',

    /** True when running in CI environment */
    isCI: Boolean(process.env['CI']),
} as const

/** Returns true when OAuth credentials are available to obtain a token */
export const hasToken = (): boolean =>
    config.authUrl.length > 0 &&
    config.authClientId.length > 0 &&
    config.authClientSecret.length > 0 &&
    config.authAudience.length > 0
