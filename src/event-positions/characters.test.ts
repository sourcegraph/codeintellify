import { Characters, findWordEdge } from './characters'
import { getTextNodes } from './dom'
import { isWithinOne } from './testutils/assert'
import { BlobProps, DOM, getCharacterWidthInContainer, wrapCharsInSpans } from './testutils/dom'
import { createMouseMoveEvent } from './testutils/mouse'

const { expect } = chai

const tabChar = String.fromCharCode(9)
const spaceChar = String.fromCharCode(32)

describe('getTextNodes', () => {
    const dom = new DOM()
    after(dom.cleanup)

    it('gets the correct text nodes', () => {
        const elems = [
            {
                // Has nodes at multiple depths
                elem: '<div><span>He</span><span>llo,<span> Wo</span></span><span>rld!</span></div>',
                nodeValues: ['He', 'llo,', ' Wo', 'rld!'],
            },
            {
                elem: `<div><span>${tabChar}He</span><span>llo,<span> Wo</span></span><span>orld!</span></div>`,
                nodeValues: [tabChar + 'He', 'llo,', ' Wo', 'orld!'],
            },
        ]
        for (const { elem, nodeValues } of elems) {
            const nodes = getTextNodes(dom.createElementFromString(elem))
            expect(nodes.length).to.equal(nodeValues.length)

            for (const [i, val] of nodeValues.entries()) {
                expect(nodes[i].nodeValue).to.equal(val)
            }
        }
    })
})

describe('Characters', () => {
    const dom = new DOM()
    after(dom.cleanup)

    let testcases: {
        blobProps: BlobProps
        measure: Characters
        measureContainer: HTMLElement
        chars: {
            character: string
            width: number
        }[]
    }[] = []

    before(() => {
        testcases = dom.createBlobs().map((blobProps, i) => {
            const firstRow = blobProps.getCodeElementFromLineNumber(blobProps.element, 0)!

            const cases = [tabChar, spaceChar, 'a', 'b', 'c', 'd', '/', '#']

            const measure = new Characters(firstRow)
            const newRow = blobProps.insertRow('')
            const measureContainer = newRow.children.item(1)! as HTMLElement
            measureContainer.innerHTML = wrapCharsInSpans(cases.join(''))

            const chars = cases.map((character, j) => ({
                character,
                width: getCharacterWidthInContainer(measureContainer, character, j),
            }))

            return {
                blobProps,
                measure,
                measureContainer,
                chars,
            }
        })
    })

    it('can get character ranges', () => {
        for (const { chars, measure, measureContainer } of testcases) {
            const ranges = measure.getCharacterRanges(measureContainer)
            let offset = 0

            for (const [i, range] of ranges.entries()) {
                expect(range.end - range.start).to.be.greaterThan(0)
                isWithinOne(range.start, offset)
                offset += chars[i].width
                isWithinOne(range.end, offset)
            }
        }
    })

    it('can get character offset', () => {
        for (const { chars, measure, measureContainer } of testcases) {
            let offset = 0
            for (const [i, character] of chars.entries()) {
                isWithinOne(measure.getCharacterOffset(i, measureContainer, true), offset)
                offset += character.width
                isWithinOne(measure.getCharacterOffset(i, measureContainer, false), offset)
            }
        }
    })

    it('can get character from MouseEvent', () => {
        for (const { measure, measureContainer } of testcases) {
            const offsetLeft = measureContainer.querySelector('[data-char="0"]')!.getBoundingClientRect().left
            const ranges = measure.getCharacterRanges(measureContainer)

            for (const [i, range] of ranges.entries()) {
                const eventStart = createMouseMoveEvent({
                    x: offsetLeft + range.start + 1,
                    y: 0, // doesn't matter
                })

                let character = measure.getCharacter(measureContainer, eventStart)

                expect(character).to.equal(i)

                const eventEnd = createMouseMoveEvent({
                    x: offsetLeft + range.end - 1,
                    y: 0, // doesn't matter
                })

                character = measure.getCharacter(measureContainer, eventEnd)

                expect(character).to.equal(i)
            }
        }
    })

    it('returns -1 for coordinates outside of the ranges for a cell', () => {
        for (const { measure, measureContainer } of testcases) {
            const eventStart = createMouseMoveEvent({
                x: 0,
                y: 0,
            })

            let character = measure.getCharacter(measureContainer, eventStart)

            expect(character).to.equal(-1)

            const eventEnd = createMouseMoveEvent({
                x: measureContainer.getBoundingClientRect().right + 1,
                y: 0,
            })

            character = measure.getCharacter(measureContainer, eventEnd)

            expect(character).to.equal(-1)
        }
    })

    it('can get the range of the full token', () => {
        const tests = [
            { position: { line: 6, character: 3 }, range: { start: 0, end: 5 } }, // 'import'
            { position: { line: 6, character: 7 }, range: { start: 7, end: 7 } }, // '('
            { position: { line: 15, character: 6 }, range: { start: 4, end: 20 } }, // ErrMethodMismatch
            { position: { line: 17, character: 26 }, range: { start: 21, end: 26 } }, // errors
            { position: { line: 24, character: 31 }, range: { start: 29, end: 32 } }, // make
            { position: { line: 89, character: 51 }, range: { start: 49, end: 53 } }, // match
            { position: { line: 89, character: 55 }, range: { start: 55, end: 61 } }, // Handler
            { position: { line: 89, character: 0 }, range: { start: 0, end: 4 } }, // <Tab>
        ]

        for (const { measure, blobProps } of testcases) {
            for (const { position, range } of tests) {
                const lineElem = blobProps.getCodeElementFromLineNumber(blobProps.element, position.line)

                const gotRange = measure.getTokenRangeFromPosition(lineElem!, position)

                expect(gotRange).to.deep.equal(range)
            }
        }
    })
})

const VARIABLE_TOKENIZER = /(^\w+)/
const ASCII_CHARACTER_TOKENIZER = /(^[\x21-\x2F|\x3A-\x40|\x5B-\x60|\x7B-\x7E])/
const NONVARIABLE_TOKENIZER = /(^[^\x21-\x7E]+)/

/**
 * consumeNextToken parses the text content of a text node and returns the next "distinct"
 * code token. It handles edge case #1 from convertNode(). The tokenization scheme is
 * heuristic-based and uses simple regular expressions.
 * @param txt Aribitrary text to tokenize.
 */
function tokenizeText(txt: string): string {
    if (txt.length === 0) {
        return ''
    }

    // first, check for real stuff, i.e. sets of [A-Za-z0-9_]
    const variableMatch = txt.match(VARIABLE_TOKENIZER)
    if (variableMatch) {
        return variableMatch[0]
    }
    // next, check for tokens that are not variables, but should stand alone
    // i.e. {}, (), :;. ...
    const asciiMatch = txt.match(ASCII_CHARACTER_TOKENIZER)
    if (asciiMatch) {
        return asciiMatch[0]
    }
    // finally, the remaining tokens we can combine into blocks, since they are whitespace
    // or UTF8 control characters. We had better clump these in case UTF8 control bytes
    // require adjacent bytes
    const nonVariableMatch = txt.match(NONVARIABLE_TOKENIZER)
    if (nonVariableMatch) {
        return nonVariableMatch[0]
    }
    return txt[0]
}

describe('findWordEdge', () => {
    it('has the same output at a regex based tokenizer', () => {
        const words = [
            { text: 'hello world', at: 0 },
            { text: 'handler.ServeHTTP', at: 4 },
            { text: '       hello world', at: 2 },
            { text: '{}', at: 0 },
        ]

        for (const { text, at } of words) {
            const codes = Array.from(text).map(c => c.charCodeAt(0))

            const start = findWordEdge(codes, at, -1)
            const end = findWordEdge(codes, at, 1)

            expect(text.slice(start, end + 1)).to.equal(tokenizeText(text))
        }
    })
})
