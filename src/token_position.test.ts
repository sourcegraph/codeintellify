import { CodeViewProps, DOM } from './testutils/dom'
import { convertNode, findElementWithOffset, getTokenAtPosition, locateTarget } from './token_position'

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
            for (const { position } of positions) {
                const target = getTokenAtPosition(element, position, domOptions)

                const found = locateTarget(target!, domOptions)

                expect(found).to.not.equal(undefined)
            }
        }
    })
})
