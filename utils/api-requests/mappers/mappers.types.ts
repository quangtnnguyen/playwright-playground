export interface MapperField {
    container: 'Header' | 'Body' | 'QueryString'
    field: string
    from: string
    to: string[]
    isActive?: boolean
    order: number
}

export interface MapperConfigItem {
    id: string
    integratorId: string
    apiVersionId: string
    providerApiEndpointId: string
    active: boolean
    activeMapperConfigSnapshotId?: string
}

export interface CreateMapperConfigPayload {
    integratorId: string
    apiVersionId: string
    providerApiEndpointId: string
    requestFields?: MapperField[]
    responseFields?: MapperField[]
}

export interface UpdateMapperConfigPayload {
    isActive?: boolean
    activeMapperConfigSnapshotId?: string
}

export interface CreateMapperSnapshotPayload {
    requestFields: MapperField[]
    responseFields: MapperField[]
}

export interface MapperSnapshotItem {
    id: string
    mapperConfigId: string
    version: number
    requestFields: MapperField[]
    responseFields: MapperField[]
}

/** Response shape for GET /proxy-configs/v1/mappers/{endpointId}/{integratorId} */
export interface ProxyMapperConfig {
    mapperConfigId?: string
    integratorId?: string
    apiVersionId?: string
    providerApiEndpointId?: string
    requestFields?: MapperField[]
    responseFields?: MapperField[]
}
