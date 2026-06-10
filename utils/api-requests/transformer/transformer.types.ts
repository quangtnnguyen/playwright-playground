// ─── Shared sub-shapes ────────────────────────────────────────────────────────

/** Valid values: "JsonToJson" */
export interface TransformerStep {
    transformType: 'JsonToJson' | string
    expression: string
}

/** Valid contentType values: "Json" | "Xml" */
export interface TransformerOutputValidator {
    contentType: 'Json' | 'Xml' | string
    schemaValidatorContent: string
}

export interface TransformerSample {
    input: string
    expectedOutput: string
}

// ─── Health ──────────────────────────────────────────────────────────────────

export interface TransformerHealthResponse {
    status: string // "Healthy"
    timestamp: string // ISO 8601
    version: string
    region: string
    commitId: string
}

// ─── GET /transformers/v1/configs ────────────────────────────────────────────

export interface TransformerItem {
    id: string
    name: string
    description: string
    steps: TransformerStep[]
    outputValidator: TransformerOutputValidator | null
    samples: TransformerSample[]
}

export interface GetTransformersResponse {
    items: TransformerItem[]
}

// ─── POST /transformers/v1/configs ───────────────────────────────────────────

export interface CreateTransformerPayload {
    name: string
    description: string
    steps: TransformerStep[]
    outputValidator?: TransformerOutputValidator | null
    samples?: TransformerSample[]
}

export interface CreateTransformerResponse {
    id: string
}

// ─── PUT /transformers/v1/configs/{transformerId} ────────────────────────────

export interface UpdateTransformerPayload {
    name: string
    description: string
    steps: TransformerStep[]
    outputValidator?: TransformerOutputValidator | null
    samples?: TransformerSample[]
}

export interface UpdateTransformerResponse {
    id: string
    name: string
    description: string | null
    steps: TransformerStep[]
    outputValidator: TransformerOutputValidator | null
    samples: TransformerSample[]
}

// ─── POST /transformers/v1/evaluate/{transformerId} ──────────────────────────

/** Parameters passed to the evaluate endpoint's multipart `parameters` section. */
export interface EvaluateParams {
    skipValidator?: boolean
    /** Arbitrary additional parameters injected into the transform expression */
    [key: string]: string | boolean | undefined
}

export interface EvaluateResult {
    /** Raw transformed output — may be JSON string or XML string */
    output: string
    /** "Json" | "Xml" */
    outputContentType: string
}

// ─── POST /transformers/v1/xml/parse ─────────────────────────────────────────

/** The parsed result is a JSON object whose shape depends on the input XML. */
export type ParseXmlResponse = Record<string, unknown>
