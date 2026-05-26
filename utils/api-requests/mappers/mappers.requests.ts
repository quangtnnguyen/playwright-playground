import { APIRequestContext } from '@playwright/test'
import { config } from '@helpers/config'
import { trackResource } from '@helpers/resource-tracker'
import {
    MapperConfigItem,
    CreateMapperConfigPayload,
    UpdateMapperConfigPayload,
    MapperSnapshotItem,
    CreateMapperSnapshotPayload,
    ProxyMapperConfig,
} from './mappers.types'

const BASE = `/${config.configApiBasePath}/mappers`

/** GET /proxy-configs/v1/mappers — handles both flat-array and { items } response shapes */
export const getMapperConfigs = async (
    ctx: APIRequestContext
): Promise<MapperConfigItem[]> => {
    const res = await ctx.get(BASE)
    if (!res.ok()) {
        throw new Error(
            `getMapperConfigs failed (${res.status()}): ${await res.text()}`
        )
    }
    const body = await res.json()
    return (
        Array.isArray(body)
            ? body
            : (body as { items: MapperConfigItem[] }).items
    ) as MapperConfigItem[]
}

/** POST /proxy-configs/v1/mappers */
export const createMapperConfig = async (
    ctx: APIRequestContext,
    payload: CreateMapperConfigPayload,
    autoTrack?: string,
): Promise<{ id: string }> => {
    const res = await ctx.post(BASE, { data: payload })
    if (!res.ok()) {
        throw new Error(
            `createMapperConfig failed (${res.status()}): ${await res.text()}`
        )
    }
    const result = (await res.json()) as { id: string }
    if (autoTrack) {
        trackResource({
            id: result.id,
            type: 'mapper-config',
            description: `integrator=${payload.integratorId} endpoint=${payload.providerApiEndpointId}`,
            spec: autoTrack,
        })
    }
    return result
}

/** PUT /proxy-configs/v1/mappers/{mapperConfigId} */
export const updateMapperConfig = async (
    ctx: APIRequestContext,
    mapperConfigId: string,
    payload: UpdateMapperConfigPayload
): Promise<MapperConfigItem> => {
    const res = await ctx.put(`${BASE}/${mapperConfigId}`, { data: payload })
    if (!res.ok()) {
        throw new Error(
            `updateMapperConfig failed (${res.status()}): ${await res.text()}`
        )
    }
    return res.json() as Promise<MapperConfigItem>
}

/** DELETE /proxy-configs/v1/mappers/{mapperConfigId} */
export const deleteMapperConfig = async (
    ctx: APIRequestContext,
    mapperConfigId: string
): Promise<void> => {
    await ctx.delete(`${BASE}/${mapperConfigId}`)
}

/** GET /proxy-configs/v1/mappers/{mapperConfigId}/snapshots — handles both flat-array and { items } shapes */
export const getMapperSnapshots = async (
    ctx: APIRequestContext,
    mapperConfigId: string
): Promise<MapperSnapshotItem[]> => {
    const res = await ctx.get(`${BASE}/${mapperConfigId}/snapshots`)
    if (!res.ok()) {
        throw new Error(
            `getMapperSnapshots failed (${res.status()}): ${await res.text()}`
        )
    }
    const body = await res.json()
    return (
        Array.isArray(body)
            ? body
            : (body as { items: MapperSnapshotItem[] }).items
    ) as MapperSnapshotItem[]
}

/** POST /proxy-configs/v1/mappers/{mapperConfigId}/snapshots */
export const createMapperSnapshot = async (
    ctx: APIRequestContext,
    mapperConfigId: string,
    payload: CreateMapperSnapshotPayload
): Promise<{ id: string; version: number }> => {
    const res = await ctx.post(`${BASE}/${mapperConfigId}/snapshots`, {
        data: payload,
    })
    if (!res.ok()) {
        throw new Error(
            `createMapperSnapshot failed (${res.status()}): ${await res.text()}`
        )
    }
    return res.json() as Promise<{ id: string; version: number }>
}

/** GET /proxy-configs/v1/mappers/{endpointId}/{integratorId} — response shape unknown until tested */
export const getProxyMapperConfig = async (
    ctx: APIRequestContext,
    endpointId: string,
    integratorId: string
): Promise<ProxyMapperConfig> => {
    const res = await ctx.get(`${BASE}/${endpointId}/${integratorId}`)
    if (!res.ok()) {
        throw new Error(
            `getProxyMapperConfig failed (${res.status()}): ${await res.text()}`
        )
    }
    return res.json() as Promise<ProxyMapperConfig>
}
