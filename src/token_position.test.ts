import { CodeViewProps, DOM } from './testutils/dom'
import {
    convertNode,
    findElementWithOffset,
    getTextNodes,
    getTokenAtPosition,
    HoveredToken,
    locateTarget,
} from './token_position'

const { expect } = chai

const tabChar = String.fromCharCode(9)

describe('token_positions', () => {
    const dom = new DOM()
    after(dom.cleanup)

    let testcases: CodeViewProps[] = []
    before(() => {
        testcases = dom.createCodeViews()
    })

    it('gets the correct text nodes', () => {
        const elems = [
            {
                // Has nodes at multiple depths
                elem: '<div><span>He</span><span>llo,<span> Wo</span></span><span>rld!</span></div>',
                nodeValues: ['He', 'llo,', ' Wo', 'rld!'],
            },
            {
                // Has a tab inside a span
                elem: `<div><span>${tabChar}He</span><span>llo,<span> Wo</span></span><span>rld!</span></div>`,
                nodeValues: [tabChar + 'He', 'llo,', ' Wo', 'rld!'],
            },
            {
                // Has leading whitespace
                elem: `${tabChar}<span>He</span><span>llo,<span> Wo</span></span><span>rld!</span>`,
                nodeValues: [tabChar, 'He', 'llo,', ' Wo', 'rld!'],
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

    it('convertNode tokenizes text properly', () => {
        const elems = [
            {
                content: '<div>Hello, World!</div>',
                nodeValues: ['Hello', ',', ' ', 'World', '!'],
            },
            {
                content: `${tabChar}if rv := contextGet(r, routeKey); rv != nil {`,
                nodeValues: [
                    tabChar,
                    'if',
                    ' ',
                    'rv',
                    ' ',
                    ':',
                    '=',
                    ' ',
                    'contextGet',
                    '(',
                    'r',
                    ',',
                    ' ',
                    'routeKey',
                    ')',
                    ';',
                    ' ',
                    'rv',
                    ' ',
                    '!',
                    '=',
                    ' ',
                    'nil',
                    ' ',
                    '{',
                ],
            },
        ]

        for (const { content, nodeValues } of elems) {
            const elem = dom.createElementFromString(content)

            convertNode(elem)

            const nodes = getTextNodes(elem)

            expect(nodes.length).to.equal(nodeValues.length)

            for (const [i, val] of nodeValues.entries()) {
                expect(nodes[i].nodeValue).to.equal(val)
            }
        }
    })

    it('findElementWithOffset finds the correct token', () => {
        const content = `${tabChar}if rv := contextGet(r, routeKey); rv != nil {`

        const elems = [
            {
                offset: 11,
                token: 'contextGet',
            },
            {
                offset: 21,
                token: '(',
            },
            {
                offset: 2,
                token: 'if',
            },
            {
                offset: 4,
                token: ' ',
            },
        ]

        const elem = dom.createElementFromString(content)

        for (const { offset, token } of elems) {
            const tokenElem = findElementWithOffset(elem, offset)

            expect(tokenElem).to.not.equal(undefined)

            expect(tokenElem!.textContent).to.equal(token)
        }
    })

    it('findElementWithOffset returns undefined for invalid offsets', () => {
        const content = 'Hello, World!'

        const offsets = [content.length + 1, 0]

        const elem = dom.createElementFromString(content)

        for (const offset of offsets) {
            const tokenElem = findElementWithOffset(elem, offset)

            expect(tokenElem).to.equal(undefined)
        }
    })

    it('getTokenAtPosition finds the correct tokens', () => {
        const tokens = [
            {
                token: 'NewRouter',
                position: { line: 24, character: 7 },
            },
            {
                token: 'import',
                position: { line: 7, character: 3 },
            },
            {
                token: 'if',
                position: { line: 154, character: 2 },
            },
            {
                token: '=',
                position: { line: 257, character: 5 },
            },
        ]

        for (const { element, ...domOptions } of testcases) {
            for (const { token, position } of tokens) {
                const found = getTokenAtPosition(element, position, domOptions)

                expect(found).to.not.equal(undefined)
                expect(found!.textContent).to.equal(token)
            }
        }
    })

    it('locateTarget finds the correct token for a target', () => {
        const positions = [
            { position: { line: 24, character: 6 }, token: 'NewRouter' },
            { position: { line: 7, character: 3 }, token: 'import' },
            { position: { line: 154, character: 2 }, token: 'if' },
            { position: { line: 257, character: 5 }, token: '=' },
            { position: { line: 121, character: 9 }, token: '*' },
            { position: { line: 128, character: 8 }, token: ':' },
        ]

        for (const { element, ...domOptions } of testcases) {
            for (const { position, token } of positions) {
                const target = getTokenAtPosition(element, position, domOptions)

                const found = locateTarget(target!, domOptions)

                expect(found).to.not.equal(undefined)
                expect((found as HoveredToken).word).to.equal(token)
            }
        }
    })
})
