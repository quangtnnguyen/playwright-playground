import { APIRequestContext } from '@playwright/test'
import { config } from '@helpers/config'
import { trackResource } from '@helpers/resource-tracker'
import {
    ApiConfigItem,
    CreateApiConfigPayload,
    UpdateApiConfigPayload,
} from './api-configs.types'

const BASE = `/${config.configApiBasePath}/api-configs`

/** GET /proxy-configs/v1/api-configs — handles both flat-array and { items } response shapes */
export const getApiConfigs = async (
    ctx: APIRequestContext
): Promise<ApiConfigItem[]> => {
    const res = await ctx.get(BASE)
    if (!res.ok()) {
        throw new Error(
            `getApiConfigs failed (${res.status()}): ${await res.text()}`
        )
    }
    const body = await res.json()
    return (
        Array.isArray(body) ? body : (body as { items: ApiConfigItem[] }).items
    ) as ApiConfigItem[]
}

/** POST /proxy-configs/v1/api-configs */
export const createApiConfig = async (
    ctx: APIRequestContext,
    payload: CreateApiConfigPayload,
    autoTrack?: string,
): Promise<{ id: string }> => {
    const res = await ctx.post(BASE, { data: payload })
    if (!res.ok()) {
        throw new Error(
            `createApiConfig failed (${res.status()}): ${await res.text()}`
        )
    }
    const result = (await res.json()) as { id: string }
    if (autoTrack) {
        trackResource({ id: result.id, type: 'api-config', description: payload.name, spec: autoTrack })
    }
    return result
}

/** PUT /proxy-configs/v1/api-configs/{id} */
export const updateApiConfig = async (
    ctx: APIRequestContext,
    id: string,
    payload: UpdateApiConfigPayload
): Promise<ApiConfigItem> => {
    const res = await ctx.put(`${BASE}/${id}`, { data: payload })
    if (!res.ok()) {
        throw new Error(
            `updateApiConfig failed (${res.status()}): ${await res.text()}`
        )
    }
    return res.json() as Promise<ApiConfigItem>
}
