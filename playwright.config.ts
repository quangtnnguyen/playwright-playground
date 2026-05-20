import { defineConfig } from '@playwright/test'
import * as dotenv from 'dotenv'

// Load .env file if present
dotenv.config()

const BASE_URL = process.env['BASE_URL'] ?? 'http://localhost:5000'

export default defineConfig({
    // No browser projects — API testing only
    projects: [
        {
            name: 'api',
            use: {
                baseURL: BASE_URL,
                extraHTTPHeaders: {
                    Accept: 'application/json',
                },
            },
        },
    ],

    testDir: './tests',
    testMatch: '**/*.spec.ts',

    // Retry once on CI
    retries: process.env['CI'] ? 1 : 0,

    // Fail fast: stop after 5 failures
    maxFailures: 5,

    // Parallel workers
    workers: process.env['CI'] ? 2 : undefined,

    reporter: [
        ['list'],
        ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ],

    use: {
        baseURL: BASE_URL,
        // No browser needed — set headless explicitly
        ignoreHTTPSErrors: false,
        // Default timeout per API call
        actionTimeout: 15_000,
    },

    outputDir: 'test-results',
    timeout: 30_000,

    globalTeardown: './global-teardown',
})
