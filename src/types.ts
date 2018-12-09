import { Position, Range } from '@sourcegraph/extension-api-types'

export const LOADING: 'loading' = 'loading'

/**
 * Describes the range in the document (usually a token) that the hover is attached to.
 */
export interface HoverAttachment {
    /**
     * The range to which this hover applies. When missing, it will use the range at the current
     * position or the current position itself.
     */
    range?: Range
}

/**
 * Reports whether {@link value} is a {@link HoverAttachment} value with a range.
 */
export function isHoverAttachmentWithRange(value: any): value is HoverAttachment & { range: Range } {
    return (
        value &&
        value.range &&
        value.range.start &&
        typeof value.range.start.line === 'number' &&
        typeof value.range.start.character === 'number' &&
        typeof value.range.end.line === 'number' &&
        typeof value.range.end.character === 'number'
    )
}

/**
 * Reports whether {@link value} is a {@link Position}.
 */
export function isPosition(value: any): value is Position {
    return value && typeof value.line === 'number' && typeof value.character === 'number'
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
