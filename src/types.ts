import { Hover, MarkedString, MarkupContent, Range } from 'vscode-languageserver-types'

export const LOADING: 'loading' = 'loading'

/** LSP proxy error code for unsupported modes */
export const EMODENOTFOUND = -32000

/** A hover that is merged from multiple Hover results and normalized. */
export type HoverMerged = Pick<Hover, Exclude<keyof Hover, 'contents'>> & {
    /** Also allows MarkupContent[]. */
    // tslint:disable-next-line deprecation We want to handle MarkedString
    contents: (MarkupContent | MarkedString)[]
}

export namespace HoverMerged {
    /** Reports whether the value conforms to the HoverMerged interface. */
    export function is(value: any): value is HoverMerged {
        // Based on Hover.is from vscode-languageserver-types.
        return (
            value !== null &&
            typeof value === 'object' &&
            Array.isArray(value.contents) &&
            // tslint:disable-next-line deprecation We want to handle MarkedString
            (value.contents as any[]).every(c => MarkupContent.is(c) || MarkedString.is(c)) &&
            (value.range === undefined || Range.is(value.range))
        )
    }
}
