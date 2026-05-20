import { APIResponse, expect } from '@playwright/test'

/**
 * Assert response is 2xx and return parsed JSON body.
 * Throws on non-2xx status.
 */
export async function assertOk<T = unknown>(response: APIResponse): Promise<T> {
    expect(
        response.ok(),
        `Expected 2xx but got ${response.status()}: ${response.url()}`
    ).toBe(true)
    return response.json() as Promise<T>
}

/**
 * Assert an exact HTTP status code.
 */
export function assertStatus(
    response: APIResponse,
    expectedStatus: number
): void {
    expect(
        response.status(),
        `Expected ${expectedStatus} but got ${response.status()}: ${response.url()}`
    ).toBe(expectedStatus)
}

/**
 * Assert response is JSON-parseable and return the body.
 * Validates Content-Type contains application/json.
 */
export async function assertJsonBody<T = unknown>(
    response: APIResponse
): Promise<T> {
    const contentType = response.headers()['content-type'] ?? ''
    expect(
        contentType,
        `Expected JSON content-type but got "${contentType}"`
    ).toContain('application/json')
    return response.json() as Promise<T>
}
