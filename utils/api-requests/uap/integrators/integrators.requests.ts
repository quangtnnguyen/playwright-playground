import { APIRequestContext } from '@playwright/test'
import { config } from '@helpers/config'
import { trackResource } from '@helpers/resource-tracker'
import {
    IntegratorItem,
    CreateIntegratorPayload,
    UpdateIntegratorPayload,
} from './integrators.types'

const BASE = `/${config.configApiBasePath}/integrators`

/** GET /proxy-configs/v1/integrators — handles both flat-array and { items } response shapes */
export const getIntegrators = async (
    ctx: APIRequestContext
): Promise<IntegratorItem[]> => {
    const res = await ctx.get(BASE)
    if (!res.ok()) {
        throw new Error(
            `getIntegrators failed (${res.status()}): ${await res.text()}`
        )
    }
    const body = await res.json()
    return (
        Array.isArray(body) ? body : (body as { items: IntegratorItem[] }).items
    ) as IntegratorItem[]
}

/** POST /proxy-configs/v1/integrators */
export const createIntegrator = async (
    ctx: APIRequestContext,
    payload: CreateIntegratorPayload,
    autoTrack?: string
): Promise<{ id: string }> => {
    const res = await ctx.post(BASE, { data: payload })
    if (!res.ok()) {
        throw new Error(
            `createIntegrator failed (${res.status()}): ${await res.text()}`
        )
    }
    const result = (await res.json()) as { id: string }
    if (autoTrack) {
        trackResource({
            id: result.id,
            type: 'integrator',
            description: payload.name,
            spec: autoTrack,
        })
    }
    return result
}

/** PUT /proxy-configs/v1/integrators/{id} */
export const updateIntegrator = async (
    ctx: APIRequestContext,
    id: string,
    payload: UpdateIntegratorPayload
): Promise<IntegratorItem> => {
    const res = await ctx.put(`${BASE}/${id}`, { data: payload })
    if (!res.ok()) {
        throw new Error(
            `updateIntegrator failed (${res.status()}): ${await res.text()}`
        )
    }
    return res.json() as Promise<IntegratorItem>
}

/** DELETE /proxy-configs/v1/integrators/{id} */
export const deleteIntegrator = async (
    ctx: APIRequestContext,
    id: string
): Promise<void> => {
    await ctx.delete(`${BASE}/${id}`)
}
