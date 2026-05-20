export interface SchemaValidatorPayload {
    name: string
    isActive: boolean
    container: 'Header' | 'Body' | 'QueryString'
    direction: 'Request' | 'Response'
    jsonValidatorSchema: string
}

export interface SchemaValidatorItem {
    id: string
    name: string
    isActive: boolean
    container: 'Header' | 'Body' | 'QueryString'
    direction: 'Request' | 'Response'
    jsonValidatorSchema: string
}

export interface ApiVersionItem {
    id: string
    prefixPath: string
    httpMethod: string
    isActive: boolean
    allowedScopes: string[]
    schemaValidators: SchemaValidatorItem[]
}

export interface CreateApiVersionPayload {
    prefixPath: string
    httpMethod: string
    isActive?: boolean
    allowedScopes?: string[]
    schemaValidators?: SchemaValidatorPayload[]
}

export interface UpdateApiVersionPayload {
    prefixPath?: string
    httpMethod?: string
    isActive?: boolean
    allowedScopes?: string[]
    schemaValidators?: SchemaValidatorPayload[]
}
