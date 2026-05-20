export interface ProviderItem {
    id: string
    name: string
    description: string
    proxyCode: string
}

export interface CreateProviderPayload {
    name: string
    description: string
    proxyCode: string
}

export interface UpdateProviderPayload {
    name: string
    description: string
    proxyCode: string
}

/** Simplified payload for POST /proxy-configs/v1/providers/onboard */
export interface OnboardProviderPayload {
    provider?: {
        name: string
        description: string
        proxyCode: string
    }
    /** Full endpoint + optional mapper config per endpoint; uses unknown for nested provider-endpoint shape */
    onboardingApiEndpoints: Array<{
        providerApiEndpoint: Record<string, unknown>
        mapperConfig?: {
            integratorId: string
            requestFields?: unknown[]
            responseFields?: unknown[]
        }
    }>
}

export interface OnboardProviderResult {
    providerProxyCode: string
    providerApiEndpointCreationResults: Array<{
        success: boolean
        providerApiEndpointId?: string
        error?: string
    }>
}
