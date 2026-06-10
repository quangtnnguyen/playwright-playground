import { APIRequestContext } from '@playwright/test'
import { config } from '@helpers/config'
import {
    ApiVersionItem,
    CreateApiVersionPayload,
    UpdateApiVersionPayload,
} from './api-versions.types'

const versionsBase = (apiId: string) =>
    `/${config.configApiBasePath}/api-configs/${apiId}/versions`

/** GET /proxy-configs/v1/api-configs/{apiId}/versions — handles both flat-array and { items } shapes */
export const getApiVersions = async (
    ctx: APIRequestContext,
    apiId: string
): Promise<ApiVersionItem[]> => {
    const res = await ctx.get(versionsBase(apiId))
    if (!res.ok()) {
        throw new Error(
            `getApiVersions failed (${res.status()}): ${await res.text()}`
        )
    }
    const body = await res.json()
    return (
        Array.isArray(body) ? body : (body as { items: ApiVersionItem[] }).items
    ) as ApiVersionItem[]
}

/** POST /proxy-configs/v1/api-configs/{apiId}/versions */
export const createApiVersion = async (
    ctx: APIRequestContext,
    apiId: string,
    payload: CreateApiVersionPayload
): Promise<{ id: string }> => {
    const res = await ctx.post(versionsBase(apiId), {
        data: payload,
    })
    if (!res.ok()) {
        throw new Error(
            `createApiVersion failed (${res.status()}): ${await res.text()}`
        )
    }
    return res.json() as Promise<{ id: string }>
}

/** PUT /proxy-configs/v1/api-configs/{apiId}/versions/{apiVersionId} */
export const updateApiVersion = async (
    ctx: APIRequestContext,
    apiId: string,
    apiVersionId: string,
    payload: UpdateApiVersionPayload
): Promise<ApiVersionItem> => {
    const res = await ctx.put(`${versionsBase(apiId)}/${apiVersionId}`, {
        data: payload,
    })
    if (!res.ok()) {
        throw new Error(
            `updateApiVersion failed (${res.status()}): ${await res.text()}`
        )
    }
    return res.json() as Promise<ApiVersionItem>
}
