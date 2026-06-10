import { APIRequestContext } from '@playwright/test'
import { trackResource } from '@helpers/resource-tracker'
import {
    TransformerHealthResponse,
    GetTransformersResponse,
    CreateTransformerPayload,
    CreateTransformerResponse,
    UpdateTransformerPayload,
    UpdateTransformerResponse,
    EvaluateParams,
    ParseXmlResponse,
} from './transformer.types'

const BASE = '/transformers/v1'

// ─── Health ──────────────────────────────────────────────────────────────────

/** GET /transformers/v1/health — no auth required */
export const getTransformerHealth = async (
    ctx: APIRequestContext,
): Promise<TransformerHealthResponse> => {
    const res = await ctx.get(`${BASE}/health`)
    if (!res.ok())
        throw new Error(`getTransformerHealth failed (${res.status()}): ${await res.text()}`)
    return res.json()
}

// ─── Configs (CRUD) ──────────────────────────────────────────────────────────

/**
 * GET /transformers/v1/configs
 * @param id Optional ObjectId — returns a single-item list when provided
 */
export const getTransformers = async (
    ctx: APIRequestContext,
    id?: string,
): Promise<GetTransformersResponse> => {
    const params = id ? `?id=${encodeURIComponent(id)}` : ''
    const res = await ctx.get(`${BASE}/configs${params}`)
    if (!res.ok())
        throw new Error(`getTransformers failed (${res.status()}): ${await res.text()}`)
    return res.json()
}

/**
 * POST /transformers/v1/configs
 * @param autoTrack Base spec filename (without .spec.ts) — when provided,
 *                  the created resource is registered with trackResource()
 *                  so global-teardown generates a mongosh cleanup script.
 */
export const createTransformer = async (
    ctx: APIRequestContext,
    payload: CreateTransformerPayload,
    autoTrack?: string,
): Promise<CreateTransformerResponse> => {
    const res = await ctx.post(`${BASE}/configs`, { data: payload })
    if (!res.ok())
        throw new Error(`createTransformer failed (${res.status()}): ${await res.text()}`)
    const result = (await res.json()) as CreateTransformerResponse
    if (autoTrack) {
        trackResource({ id: result.id, type: 'transformer', description: payload.name, spec: autoTrack })
    }
    return result
}

/** PUT /transformers/v1/configs/{transformerId} */
export const updateTransformer = async (
    ctx: APIRequestContext,
    transformerId: string,
    payload: UpdateTransformerPayload,
): Promise<UpdateTransformerResponse> => {
    const res = await ctx.put(`${BASE}/configs/${transformerId}`, { data: payload })
    if (!res.ok())
        throw new Error(`updateTransformer failed (${res.status()}): ${await res.text()}`)
    return res.json()
}

/**
 * DELETE /transformers/v1/configs/{transformerId}
 * Returns 200 with empty body on success (soft delete).
 * Returns 400 for invalid ObjectId format.
 * Returns 404 for non-existent transformer.
 */
export const deleteTransformer = async (
    ctx: APIRequestContext,
    transformerId: string,
): Promise<void> => {
    await ctx.delete(`${BASE}/configs/${transformerId}`)
}

// ─── Evaluate ────────────────────────────────────────────────────────────────

/**
 * POST /transformers/v1/evaluate/{transformerId}
 *
 * Sends a multipart/form-data request with two parts:
 *   - `body`       — the input data to transform (required)
 *   - `parameters` — URL-encoded key=value pairs; `skipValidator` is extracted
 *                    by the API; remaining keys are passed to the expression
 *
 * @returns The raw output string (JSON or XML depending on transformer config).
 *          Callers should check Content-Type header to determine output format.
 */
export const evaluateTransformer = async (
    ctx: APIRequestContext,
    transformerId: string,
    body: string,
    params: EvaluateParams = {},
): Promise<string> => {
    // Build URL-encoded parameters string
    const paramParts: string[] = []
    for (const [key, val] of Object.entries(params)) {
        if (val !== undefined) {
            paramParts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(val))}`)
        }
    }
    const parametersValue = paramParts.join('&')

    const res = await ctx.post(`${BASE}/evaluate/${transformerId}`, {
        multipart: {
            body,
            ...(parametersValue ? { parameters: parametersValue } : {}),
        },
    })
    if (!res.ok())
        throw new Error(`evaluateTransformer failed (${res.status()}): ${await res.text()}`)
    return res.text()
}

// ─── XML parse ───────────────────────────────────────────────────────────────

/**
 * POST /transformers/v1/xml/parse
 *
 * Sends raw XML as the request body. The API requires a non-empty body.
 * Returns the parsed JSON representation of the XML.
 */
export const parseXml = async (
    ctx: APIRequestContext,
    xmlContent: string,
): Promise<ParseXmlResponse> => {
    const res = await ctx.post(`${BASE}/xml/parse`, {
        data: xmlContent,
        headers: { 'Content-Type': 'text/xml' },
    })
    if (!res.ok())
        throw new Error(`parseXml failed (${res.status()}): ${await res.text()}`)
    return res.json()
}
