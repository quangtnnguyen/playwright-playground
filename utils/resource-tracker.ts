/**
 * Lightweight resource tracker for Playwright test runs.
 *
 * Uses NDJSON (newline-delimited JSON) so multiple Playwright workers can
 * safely append entries concurrently without corrupting each other's writes —
 * appendFileSync is atomic for small payloads on both POSIX and Windows.
 *
 * Lifecycle (managed by global-teardown.ts):
 *   trackResource()       → called from beforeAll/test hooks when a resource is created
 *   getTrackedResources() → called once in global teardown after all tests finish
 *   clearTracker()        → called at the end of global teardown
 *
 * MongoDB collection map (Standard.Proxy.Core entities):
 *   'provider'   → db collection: providers
 *   'integrator' → db collection: integrators
 *   'api-config' → db collection: apis
 *                  (ApiVersions + ProviderApiEndpoints are embedded subdocuments —
 *                   deleting the api-config document removes them automatically)
 */

import * as fs from 'fs'
import * as path from 'path'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Logical resource category — maps to a MongoDB collection. */
export type ResourceType = 'provider' | 'integrator' | 'api-config'

export interface TrackedResource {
    /** MongoDB _id as a 24-char hex string. */
    id: string
    /** Logical category that determines which MongoDB collection to clean. */
    type: ResourceType
    /** Human-readable label shown in the console summary and cleanup script. */
    description: string
    /**
     * Base name of the spec file without the `.spec.ts` suffix.
     * Used to build the cleanup script filename: `mm-dd-yyyy-{spec}.js`
     */
    spec: string
    /** ISO 8601 timestamp — recorded at the moment of tracking. */
    createdAt: string
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

/**
 * NDJSON file that accumulates resource entries during the test run.
 * Placed at the playwright project root (one level above `utils/`).
 */
const TRACKER_FILE = path.resolve(__dirname, '..', '.test-run-resources.ndjson')

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Appends one resource entry to the NDJSON tracker file.
 * Safe to call from multiple workers simultaneously.
 */
export function trackResource(
    resource: Omit<TrackedResource, 'createdAt'>
): void {
    const entry: TrackedResource = {
        ...resource,
        createdAt: new Date().toISOString(),
    }
    fs.appendFileSync(TRACKER_FILE, JSON.stringify(entry) + '\n', 'utf-8')
}

/**
 * Reads and parses all entries written by `trackResource` in the current run.
 * Returns an empty array if the tracker file does not exist.
 */
export function getTrackedResources(): TrackedResource[] {
    if (!fs.existsSync(TRACKER_FILE)) return []
    const content = fs.readFileSync(TRACKER_FILE, 'utf-8').trim()
    if (!content) return []
    return content
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as TrackedResource)
}

/**
 * Deletes the NDJSON tracker file.
 * Called by global-teardown once the cleanup scripts have been written.
 */
export function clearTracker(): void {
    if (fs.existsSync(TRACKER_FILE)) {
        fs.unlinkSync(TRACKER_FILE)
    }
}
