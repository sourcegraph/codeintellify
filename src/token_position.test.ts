import { Position } from 'vscode-languageserver-types'

import { CodeViewProps, DOM } from './testutils/dom'
import { convertNode, findElementWithOffset, getTokenAtPosition, HoveredToken, locateTarget } from './token_position'

const { expect } = chai

const tabChar = String.fromCharCode(9)

/**
 * Get the all of the text nodes under a given node in the DOM tree.
 *
 * @param node is the node in which you want to get all of the text nodes from it's children
 */
export const getTextNodes = (node: Node): Node[] => {
    if (node.childNodes.length === 0 && node.TEXT_NODE === node.nodeType && node.nodeValue) {
        return [node]
    }

    const nodes: Node[] = []

    for (const child of Array.from(node.childNodes)) {
        nodes.push(...getTextNodes(child))
    }

    return nodes
}

describe('token_positions', () => {
    const dom = new DOM()
    after(dom.cleanup)

    let testcases: CodeViewProps[] = []
    before(() => {
        testcases = dom.createCodeViews()
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

        for (const { codeView, ...domOptions } of testcases) {
            for (const { token, position } of tokens) {
                const found = getTokenAtPosition(codeView, position, domOptions)

                expect(found).to.not.equal(undefined)
                expect(found!.textContent).to.equal(token)
            }
        }
    })

    it('locateTarget finds the correct token for a target', () => {
        const positions: {
            /** A position within the expected token. */
            atPosition: Position
            /** The position that locateTarget found. If it works correctly, it is the position of the first character in the token. */
            foundPosition: Position
        }[] = [
            { atPosition: { line: 24, character: 8 }, foundPosition: { line: 24, character: 6 } }, // NewRouter
            { atPosition: { line: 7, character: 3 }, foundPosition: { line: 7, character: 1 } }, // import
            { atPosition: { line: 154, character: 3 }, foundPosition: { line: 154, character: 2 } }, // if
            { atPosition: { line: 257, character: 5 }, foundPosition: { line: 257, character: 5 } }, // =
            { atPosition: { line: 121, character: 9 }, foundPosition: { line: 121, character: 9 } }, // *
            { atPosition: { line: 128, character: 8 }, foundPosition: { line: 128, character: 8 } }, // :
        ]

        for (const { codeView, ...domOptions } of testcases) {
            for (const { atPosition, foundPosition } of positions) {
                const target = getTokenAtPosition(codeView, atPosition, domOptions)

                const found = locateTarget(target!, domOptions)

                expect(found).to.not.equal(undefined)

                const token = found as HoveredToken

                expect(token.line).to.equal(foundPosition.line)
                expect(token.character).to.equal(foundPosition.character)
            }
        }
    })
})
