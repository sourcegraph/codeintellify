export interface ErrorLike {
    message: string
    code?: string
}

export const isErrorLike = (val: any): val is ErrorLike =>
    !!val && typeof val === 'object' && (!!val.stack || ('message' in val || 'code' in val)) && !('__typename' in val)

/**
 * Ensures a value is a proper Error, copying all properties if needed
 */
export const asError = (err: any): Error => {
    if (err instanceof Error) {
        return err
    }
    if (typeof err === 'object' && err !== null) {
        return Object.assign(new Error(err.message), err)
    }
    return new Error(err)
}
