import { Position } from '@sourcegraph/extension-api-types'
import { getElementOffset, getTextNodes } from './dom'

export interface CharacterRange {
    code: number
    start: number
    end: number
}

export interface TokenRange {
    start: number
    end: number
}

interface CharacterData {
    code: number
    width: number
}

export interface Token {
    /** The start character of the token (0-indexed) */
    start: number
    /** The end character of the token (0-indexed) */
    end: number
    /** The value of the token */
    value: string
    /** The left position in pixels of the token */
    left: number
    /** The width in pixels of the token */
    width: number
}

export const FULL_LINE = Infinity

const isAlphanumeric = (code: number): boolean =>
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) // a-z

const isWhitespace = (code: number): boolean =>
    code === 9 || // tab
    code === 32 || // space
    code === 10 || // LF
    code === 12 || // FF
    code === 13 // CR

export const findWordEdge = (codes: number[], at: number, delta: -1 | 1): number => {
    // Group alphanumeric characters together. These are identities.
    if (isAlphanumeric(codes[at])) {
        let i = at

        while (isAlphanumeric(codes[i + delta])) {
            i += delta
        }

        return i
    }

    // Group whitespace just in case it is needed.
    if (isWhitespace(codes[at])) {
        let i = at

        while (isWhitespace(codes[i + delta])) {
            i += delta
        }

        return i
    }

    // Anything else is by itself. Think '{}|(),.' etc.
    return at
}

export class Characters {
    private container: HTMLElement

    private widths = new Map<number, number>()

    constructor(container: HTMLElement, getLineNumber?: () => void) {
        this.container = container
    }

    public getCharacterRanges = (elem: HTMLElement): CharacterRange[] => {
        const ranges: CharacterRange[] = []

        let left = 0
        for (const { code, width } of this.getCharacterWidths(elem)) {
            ranges.push({
                code,
                start: left,
                end: left + width,
            })

            left += width
        }

        return ranges
    }

    public getCharacterOffset = (character: number, elem: HTMLElement, atStart: boolean, line?: number): number => {
        const ranges = this.getCharacterRanges(elem)
        if (ranges.length === 0) {
            return 0
        }

        let at: 'start' | 'end' = atStart ? 'start' : 'end'

        let range = ranges[character]
        // Be lenient for requests for characters after the end of the line. Language servers sometimes send
        // this as the end of a range.
        if ((!range && character === ranges.length) || character === FULL_LINE) {
            range = ranges[ranges.length - 1]
            at = 'end'
        } else if (!range) {
            throw new Error(
                `Out of bounds: attempted to get range of character ${character} for line ${line || ''} (line length ${
                    ranges.length
                })`
            )
        }

        return range[at]
    }

    public getCharacter = (elem: HTMLElement, event: MouseEvent): number => {
        const paddingLeft = getElementOffset(elem, true)

        const x = event.clientX - paddingLeft

        const character = this.getCharacterRanges(elem).findIndex(
            // In the future, we should think about how to handle events at a position that lies exectly on
            // the line between two characters. Right now, it'll go to the first character.
            range => x >= range.start && x <= range.end
        )

        return character
    }

    public getToken(elem: HTMLElement, event: MouseEvent): { token: Token | null; character: number } {
        const paddingLeft = getElementOffset(elem, true)

        const x = event.clientX - paddingLeft

        const ranges = this.getCharacterRanges(elem)

        const character = ranges.findIndex(
            // In the future, we should think about how to handle events at a position that lies exectly on
            // the line between two characters. Right now, it'll go to the first character.
            range => x >= range.start && x <= range.end
        )

        if (character === -1) {
            return {
                character,
                token: null,
            }
        }

        const characterCodes = this.getCharacterRanges(elem).map(({ code }) => code)

        const start = findWordEdge(characterCodes, character, -1)
        const end = findWordEdge(characterCodes, character, 1)

        const left = this.getCharacterOffset(start, elem, true)
        const right = this.getCharacterOffset(end, elem, false)

        return {
            character,
            token: {
                start,
                end,
                value: characterCodes
                    .slice(start, end + 1)
                    .map(c => String.fromCharCode(c))
                    .join(''),
                left,
                width: right - left,
            },
        }
    }

    public getTokenRangeFromPosition = (elem: HTMLElement, position: Position): TokenRange => {
        const characterCodes = this.getCharacterRanges(elem).map(({ code }) => code)

        const range = {
            start: findWordEdge(characterCodes, position.character, -1),
            end: findWordEdge(characterCodes, position.character, 1),
        }

        return range
    }

    private getCharacterWidths(elem: HTMLElement): CharacterData[] {
        const nodes = getTextNodes(elem as Node)

        const data: CharacterData[] = []
        for (const node of nodes) {
            if (!node.nodeValue) {
                continue
            }

            for (let i = 0; i < node.nodeValue.length; i++) {
                const code = node.nodeValue.charCodeAt(i)

                data.push({ width: this.getCharacterWidth(code), code })
            }
        }

        return data
    }

    private getCharacterWidth(charCode: number): number {
        if (this.widths.has(charCode)) {
            return this.widths.get(charCode) as number
        }

        const elem = document.createElement('div')

        elem.innerHTML = String.fromCharCode(charCode)

        // Ensure we preserve whitespace and only get the width of the character
        elem.style.visibility = 'hidden'
        elem.style.height = '0'
        elem.style.cssFloat = 'left'

        this.container.appendChild(elem)

        const width = elem.getBoundingClientRect().width

        this.container.removeChild(elem)

        this.widths.set(charCode, width)

        return width
    }
}
