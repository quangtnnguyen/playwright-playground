/** Error response shape returned by the API for validation / conflict errors */
export interface ApiErrorBody {
    type: string
    title: string
    status: number
    detail: string
    errors: Array<{ errorCode: string; errorDescription: string }>
}
