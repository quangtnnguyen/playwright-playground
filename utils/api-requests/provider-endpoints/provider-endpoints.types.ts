export interface ProviderProxyConfigPayload {
    proxyField: string
    container: 'Header' | 'Body' | 'QueryString'
    proxyCodeValues: string[]
    isCaseSensitive: boolean
}

export interface FieldValuePayload {
    field: string
    value: string
    shouldEncrypt: boolean
    container: 'Header' | 'Body' | 'QueryString'
}

export interface AuthRequestPayload {
    url: string | null
    /** API accepts 'Bearer' | 'ApiKey' | 'Anonymous'; allow string for legacy values */
    authType: 'Bearer' | 'ApiKey' | 'Anonymous'
    httpMethod?: 'GET' | 'POST' | 'PUT' | null
    tokenJsonPath?: string | null
    transformHeader?: string | null
    tokenPrefix?: string | null
    fieldValues: FieldValuePayload[]
}

export interface EndpointExtensionPayload {
    name: 'CircuitBreaker' | 'RateLimit' | 'Timeout' | 'Retry'
    parameters: Record<string, string>
}

export interface TransformerConfigPayload {
    transformerId?: string
    parameters?: Record<string, string>
}

export interface CreateProviderEndpointPayload {
    apiId: string,
    apiVersionId: string,
    name: string
    description: string
    endpoint: string
    providerProxyConfig: ProviderProxyConfigPayload
    authRequest: AuthRequestPayload
    extensions?: EndpointExtensionPayload[]
    requestTransformer?: TransformerConfigPayload
    responseTransformer?: TransformerConfigPayload
}

export interface UpdateProviderEndpointPayload {
    name?: string
    description?: string
    endpoint?: string
    providerProxyConfig?: ProviderProxyConfigPayload
    authRequest?: AuthRequestPayload
    extensions?: EndpointExtensionPayload[]
    requestTransformer?: TransformerConfigPayload
    responseTransformer?: TransformerConfigPayload
}

export interface ProviderEndpointQueryParams {
    apiId?: string
    apiVersionId?: string
    providerApiEndpointId?: string
    proxyCode?: string
}
