export interface IntegratorItem {
    id: string
    name: string
    description: string
    auth0Id: string
    isActive: boolean
    isInternal: boolean
    hasUnlimitedProviderAccess: boolean
    allowedProviderProxyCodes: string[]
}

export interface CreateIntegratorPayload {
    name: string
    description: string
    auth0Id: string
    isActive?: boolean
    isInternal?: boolean
    hasUnlimitedProviderAccess?: boolean
    allowedProviderProxyCodes?: string[]
}

export interface UpdateIntegratorPayload {
    name: string
    description: string
    auth0Id: string
    isActive?: boolean
    isInternal?: boolean
    hasUnlimitedProviderAccess?: boolean
    allowedProviderProxyCodes?: string[]
}
