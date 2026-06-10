import { APIRequestContext } from '@playwright/test'
import { config } from '@helpers/config'
import {
    CreateProviderEndpointPayload,
    UpdateProviderEndpointPayload,
    ProviderEndpointQueryParams,
} from './provider-endpoints.types'

/** Build path prefix for nested provider-endpoint routes */
const versionBase = (apiId: string, apiVersionId: string) =>
    `/${config.configApiBasePath}/api-configs/${apiId}/versions/${apiVersionId}/provider-endpoints`

/** GET /proxy-configs/v1/api-configs/provider-endpoints (query string filter) */
export const getProviderEndpoints = async (
    ctx: APIRequestContext,
    params: ProviderEndpointQueryParams
): Promise<unknown[]> => {
    const defined = Object.fromEntries(
        Object.entries(params).filter(([, v]) => v !== undefined)
    ) as Record<string, string>
    const qs = new URLSearchParams(defined).toString()
    const url = `/${config.configApiBasePath}/api-configs/provider-endpoints${qs ? `?${qs}` : ''}`
    const res = await ctx.get(url)
    if (!res.ok()) {
        throw new Error(
            `getProviderEndpoints failed (${res.status()}): ${await res.text()}`
        )
    }
    const body = await res.json()
    return (
        Array.isArray(body) ? body : (body as { items: unknown[] }).items
    ) as unknown[]
}

/** POST /proxy-configs/v1/api-configs/{apiId}/versions/{apiVersionId}/provider-endpoints */
export const createProviderEndpoint = async (
    ctx: APIRequestContext,
    apiId: string,
    apiVersionId: string,
    payload: CreateProviderEndpointPayload
): Promise<{ id: string }> => {
    const res = await ctx.post(versionBase(apiId, apiVersionId), {
        data: payload,
    })
    if (!res.ok()) {
        throw new Error(
            `createProviderEndpoint failed (${res.status()}): ${await res.text()}`
        )
    }
    return res.json() as Promise<{ id: string }>
}

/** PUT /proxy-configs/v1/api-configs/{apiId}/versions/{apiVersionId}/provider-endpoints/{endpointId} */
export const updateProviderEndpoint = async (
    ctx: APIRequestContext,
    apiId: string,
    apiVersionId: string,
    endpointId: string,
    payload: UpdateProviderEndpointPayload
): Promise<unknown> => {
    const res = await ctx.put(
        `${versionBase(apiId, apiVersionId)}/${endpointId}`,
        {
            data: payload,
        }
    )
    if (!res.ok()) {
        throw new Error(
            `updateProviderEndpoint failed (${res.status()}): ${await res.text()}`
        )
    }
    return res.json()
}

/** DELETE /proxy-configs/v1/api-configs/{apiId}/versions/{apiVersionId}/provider-endpoints/{endpointId} */
export const deleteProviderEndpoint = async (
    ctx: APIRequestContext,
    apiId: string,
    apiVersionId: string,
    endpointId: string
): Promise<void> => {
    await ctx.delete(`${versionBase(apiId, apiVersionId)}/${endpointId}`)
}
