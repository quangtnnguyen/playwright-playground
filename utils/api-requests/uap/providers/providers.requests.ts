import { APIRequestContext } from '@playwright/test'
import { config } from '@helpers/config'
import { trackResource } from '@helpers/resource-tracker'
import {
    ProviderItem,
    CreateProviderPayload,
    UpdateProviderPayload,
    OnboardProviderPayload,
    OnboardProviderResult,
} from './providers.types'

const BASE = `/${config.configApiBasePath}/providers`

/** GET /proxy-configs/v1/providers — handles both flat-array and { items } response shapes */
export const getProviders = async (
    ctx: APIRequestContext
): Promise<ProviderItem[]> => {
    const res = await ctx.get(BASE)
    if (!res.ok()) {
        throw new Error(
            `getProviders failed (${res.status()}): ${await res.text()}`
        )
    }
    const body = await res.json()
    return (
        Array.isArray(body) ? body : (body as { items: ProviderItem[] }).items
    ) as ProviderItem[]
}

/** POST /proxy-configs/v1/providers */
export const createProvider = async (
    ctx: APIRequestContext,
    payload: CreateProviderPayload,
    autoTrack?: string
): Promise<{ id: string }> => {
    const res = await ctx.post(BASE, { data: payload })
    if (!res.ok()) {
        throw new Error(
            `createProvider failed (${res.status()}): ${await res.text()}`
        )
    }
    const result = (await res.json()) as { id: string }
    if (autoTrack) {
        trackResource({
            id: result.id,
            type: 'provider',
            description: payload.name,
            spec: autoTrack,
        })
    }
    return result
}

/** PUT /proxy-configs/v1/providers/{id} */
export const updateProvider = async (
    ctx: APIRequestContext,
    id: string,
    payload: UpdateProviderPayload
): Promise<ProviderItem> => {
    const res = await ctx.put(`${BASE}/${id}`, { data: payload })
    if (!res.ok()) {
        throw new Error(
            `updateProvider failed (${res.status()}): ${await res.text()}`
        )
    }
    return res.json() as Promise<ProviderItem>
}

/** DELETE /proxy-configs/v1/providers/{id} */
export const deleteProvider = async (
    ctx: APIRequestContext,
    id: string
): Promise<void> => {
    await ctx.delete(`${BASE}/${id}`)
}

/** POST /proxy-configs/v1/providers/onboard */
export const onboardProvider = async (
    ctx: APIRequestContext,
    payload: OnboardProviderPayload
): Promise<OnboardProviderResult> => {
    const res = await ctx.post(`${BASE}/onboard`, { data: payload })
    if (!res.ok()) {
        throw new Error(
            `onboardProvider failed (${res.status()}): ${await res.text()}`
        )
    }
    return res.json() as Promise<OnboardProviderResult>
}
