import { Hover, MarkedString, MarkupContent, Range } from 'vscode-languageserver-types'

export const LOADING: 'loading' = 'loading'

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

/**
 * Represents a line, a position, a line range, or a position range. It forbids
 * just a character, or a range from a line to a position or vice versa (such as
 * "L1-2:3" or "L1:2-3"), none of which would make much sense.
 *
 * 1-indexed.
 */
export type LineOrPositionOrRange =
    | { line?: undefined; character?: undefined; endLine?: undefined; endCharacter?: undefined }
    | { line: number; character?: number; endLine?: undefined; endCharacter?: undefined }
    | { line: number; character?: undefined; endLine?: number; endCharacter?: undefined }
    | { line: number; character: number; endLine: number; endCharacter: number }
