export interface ApiConfigItem {
    id: string
    name: string
    description: string
    isActive: boolean
}

export interface CreateApiConfigPayload {
    name: string
    description: string
    isActive?: boolean
}

export interface UpdateApiConfigPayload {
    name: string
    description: string
    isActive?: boolean
}
