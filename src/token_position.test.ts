import { Position, Range } from '@sourcegraph/extension-api-types'
import * as assert from 'assert'
import { CodeViewProps, DOM } from './testutils/dom'
import {
    convertNode,
    findElementWithOffset,
    getCodeElementsInRange,
    getTextNodes,
    getTokenAtPositionOrRange,
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

    describe('covertNode()', () => {
        it('tokenizes text properly', () => {
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

        it('does not change the text', () => {
            const text = 'fmt.Sprintf("%5d", someVar)'
            const elem = dom.createElementFromString(text)

            convertNode(elem)

            expect(elem.textContent).to.equal(text)
        })
    })

    describe('findElementWithOffset()', () => {
        describe('position', () => {
            // Only provide offsetStart
            it('finds the correct token (with tokenization)', () => {
                const content = `${tabChar}if rv := contextGet(r, routeKey); rv != nil {`

                const elems = [
                    {
                        offsetStart: 11,
                        token: 'contextGet',
                    },
                    {
                        offsetStart: 21,
                        token: '(',
                    },
                    {
                        offsetStart: 2,
                        token: 'if',
                    },
                    {
                        offsetStart: 4,
                        token: ' ',
                    },
                ]

                const elem = dom.createElementFromString(content)

                for (const { offsetStart, token } of elems) {
                    const tokenElem = findElementWithOffset(elem, { offsetStart })

                    expect(tokenElem).to.not.equal(undefined)

                    expect(tokenElem!.textContent).to.equal(token)
                }
            })

            it('finds the correct token (without tokenization)', () => {
                const content =
                    '<span role="presentation" style="padding-right: 0.1px;"><span class="cm-tab" role="presentation" cm-text="	">    </span><span class="cm-keyword">if</span> <span class="cm-variable">rv</span> :<span class="cm-operator">=</span> <span class="cm-variable">contextGet</span>(<span class="cm-variable">r</span>, <span class="cm-variable">varsKey</span>); <span class="cm-variable">rv</span> <span class="cm-operator">!=</span> <span class="cm-atom">nil</span> {</span>'

                // Each offset is 3 more than the corresponding offset in the
                // tokenized test above because this test case comes from Bitbucket
                // where tabs are converted to spaces.
                //
                // The '(' and ' ' tokens are absent from this test because, on
                // Bitbucket, punctuation characters are not wrapped in tags and the
                // current offset-finding logic can't determine the offset for such
                // tokens. One way to fix that is to use the CodeMirror API
                // directly.
                const elems = [
                    {
                        offsetStart: 14,
                        token: 'contextGet',
                    },
                    {
                        offsetStart: 5,
                        token: 'if',
                    },
                ]

                const elem = dom.createElementFromString(content)

                for (const { offsetStart, token } of elems) {
                    const tokenElem = findElementWithOffset(elem, { offsetStart }, false)

                    expect(tokenElem).to.not.equal(undefined)

                    expect(tokenElem!.textContent).to.equal(token)
                }
            })

            it('returns undefined for invalid offsets', () => {
                const content = 'Hello, World!'

                const offsets = [content.length + 1, 0]

                const elem = dom.createElementFromString(content)

                for (const offset of offsets) {
                    const tokenElem = findElementWithOffset(elem, { offsetStart: offset })

                    expect(tokenElem).to.equal(undefined)
                }
            })
        })

        describe('range', () => {
            // Provide offsetStart and offsetEnd
            it('finds the correct token (with tokenization', () => {
                const content = `${tabChar}if rv := contextGet(r, routeKey); rv != nil {`

                const ranges = [
                    { offsetStart: 2, offsetEnd: 3, textContent: 'if' },
                    // Intentional limitation: match whole text node at a given offset
                    // since that is much simpler to highlight.
                    { offsetStart: 3, offsetEnd: 5, textContent: 'if rv' },
                    { offsetStart: 2, offsetEnd: 5, textContent: 'if rv' },
                    { offsetStart: 2, offsetEnd: 6, textContent: 'if rv' },
                    { offsetStart: 11, offsetEnd: 33, textContent: 'contextGet(r, routeKey)' },
                    // If offsetEnd is less or equal to offsetStart, range should be treated as a position (offsetStart)
                    { offsetStart: 11, offsetEnd: 4, textContent: 'contextGet' },
                ]

                const elem = dom.createElementFromString(content)

                for (const { offsetStart, offsetEnd, textContent } of ranges) {
                    const tokenElem = findElementWithOffset(elem, { offsetStart, offsetEnd })

                    expect(tokenElem).to.not.equal(undefined)

                    expect(tokenElem!.textContent).to.equal(textContent)
                }
            })

            it('finds the correct token (without tokenization)', () => {
                const content =
                    '<span role="presentation" style="padding-right: 0.1px;"><span class="cm-tab" role="presentation" cm-text="	">    </span><span class="cm-keyword">if</span> <span class="cm-variable">rv</span> :<span class="cm-operator">=</span> <span class="cm-variable">contextGet</span>(<span class="cm-variable">r</span>, <span class="cm-variable">varsKey</span>); <span class="cm-variable">rv</span> <span class="cm-operator">!=</span> <span class="cm-atom">nil</span> {</span>'

                // Each offset is 3 more than the corresponding offset in the
                // tokenized test above because this test case comes from Bitbucket
                // where tabs are converted to spaces.
                //
                // The '(' and ' ' tokens are absent from this test because, on
                // Bitbucket, punctuation characters are not wrapped in tags and the
                // current offset-finding logic can't determine the offset for such
                // tokens. One way to fix that is to use the CodeMirror API
                // directly.
                const elems = [
                    {
                        offsetStart: 14,
                        offsetEnd: 34,
                        textContent: 'contextGet(r, varsKey',
                    },
                    {
                        offsetStart: 5,
                        offsetEnd: 9,
                        textContent: 'if rv',
                    },
                ]

                const elem = dom.createElementFromString(content)

                for (const { offsetStart, offsetEnd, textContent } of elems) {
                    const tokenElem = findElementWithOffset(elem, { offsetStart, offsetEnd }, false)

                    expect(tokenElem).to.not.equal(undefined)

                    expect(tokenElem!.textContent).to.equal(textContent)
                }
            })

            it('returns undefined for invalid offsets', () => {
                const content = 'Hello, World!'

                const offsets = [
                    { offsetStart: content.length + 1, offsetEnd: content.length + 2 },
                    { offsetStart: 1, offsetEnd: content.length + 1 },
                ]

                const elem = dom.createElementFromString(content)

                for (const offset of offsets) {
                    const tokenElem = findElementWithOffset(elem, offset)

                    expect(tokenElem).to.equal(undefined)
                }
            })
        })
    })

    describe('getTokenAtPositionOrRange()', () => {
        describe('position', () => {
            it('finds the correct tokens', () => {
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
                        const found = getTokenAtPositionOrRange(codeView, position, domOptions)

                        expect(found).to.not.equal(undefined)
                        expect(found!.textContent).to.equal(token)
                    }
                }
            })

            it('gets the full token, even when it crosses multiple elements', () => {
                const codeView = dom.createElementFromString('<div> To<span>ken </span></div>')

                const positions = [
                    // Test walking to the right
                    { line: 1, character: 2 },
                    // Test walking to the left
                    { line: 1, character: 4 },
                ]

                for (const position of positions) {
                    const token = getTokenAtPositionOrRange(codeView, position, {
                        getCodeElementFromLineNumber: code => code.children.item(0) as HTMLElement,
                    })

                    chai.expect(token!.textContent).to.equal('Token')
                }
            })

            it("doesn't wrap tokens that span multiple elements more than once", () => {
                const codeView = dom.createElementFromString('<div> To<span>ken </span></div>')

                const domFn = {
                    getCodeElementFromLineNumber: (code: HTMLElement) => code.children.item(0) as HTMLElement,
                }
                const position = { line: 1, character: 2 }

                const token1 = getTokenAtPositionOrRange(codeView, position, domFn)
                const token2 = getTokenAtPositionOrRange(codeView, position, domFn)

                chai.expect(token1).to.equal(token2, 'getTokenAtPositionOrRange is wrapping tokens more than once')
            })
        })

        describe('range', () => {
            it('finds the correct elements', () => {
                const ranges: { textContent: string; range: Range }[] = [
                    // When start and end are equal, `range` is treated like a `Position`
                    {
                        textContent: 'NewRouter',
                        range: {
                            start: {
                                line: 24,
                                character: 7,
                            },
                            end: { line: 24, character: 7 },
                        },
                    },
                    // When start line is not equal to end line, `range` is treated like a `Position`
                    {
                        textContent: 'NewRouter',
                        range: {
                            start: {
                                line: 24,
                                character: 6,
                            },
                            end: { line: 25, character: 14 },
                        },
                    },
                    {
                        textContent: 'NewRouter',
                        range: {
                            start: {
                                line: 24,
                                character: 6,
                            },
                            end: { line: 24, character: 14 },
                        },
                    },

                    {
                        textContent: 'http://code.google.com/p/go/issues/detail?id=5252',
                        range: {
                            start: { line: 132, character: 7 },
                            end: { line: 132, character: 55 },
                        },
                    },
                ]

                for (const { codeView, ...domOptions } of testcases) {
                    for (const { textContent, range } of ranges) {
                        const found = getTokenAtPositionOrRange(codeView, range, domOptions)
                        expect(found).to.not.equal(undefined)
                        expect(found!.textContent).to.equal(textContent)
                    }
                }
            })
        })
    })

    describe('locateTarget()', () => {
        it('finds the correct token for a target', () => {
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
                    const target = getTokenAtPositionOrRange(codeView, atPosition, domOptions)

                    const found = locateTarget(target!, domOptions)

                    expect(found).to.not.equal(undefined)

                    const token = found as HoveredToken

                    expect(token.line).to.equal(
                        foundPosition.line,
                        `expected line to be ${token.line} but got ${foundPosition.line}`
                    )
                    expect(token.character).to.equal(
                        foundPosition.character,
                        `expected character to be ${token.character} but got ${foundPosition.character}`
                    )
                }
            }
        })

        it('returns only the line number when the code element itself is hovered', () => {
            for (const { codeView, ...domOptions } of testcases) {
                const target = domOptions.getCodeElementFromLineNumber(codeView, 1)!
                const result = locateTarget(target, domOptions)
                assert.deepStrictEqual(result, { line: 1 })
            }
        })

        it('returns undefined when the code view itself is hovered', () => {
            for (const { codeView, ...domOptions } of testcases) {
                const target = codeView
                const result = locateTarget(target, domOptions)
                assert.strictEqual(result, undefined)
            }
        })
    })

    describe('getCodeElementsInRange()', () => {
        it('returns all code elements within a given range on a non-diff code view', () => {
            const codeView = dom.createElementFromString(`
                <div>Line 1</div>
                <div>Line 2</div>
                <div>Line 3</div>
                <div>Line 4</div>
            `)
            const codeElements = getCodeElementsInRange({
                codeView,
                position: { line: 2, endLine: 4 },
                getCodeElementFromLineNumber: (codeView, line) => codeView.children[line - 1] as HTMLElement,
            })
            assert.deepStrictEqual(
                codeElements.map(({ line, element }) => ({ line, content: element.textContent })),
                [
                    { line: 2, content: 'Line 2' },
                    { line: 3, content: 'Line 3' },
                    { line: 4, content: 'Line 4' },
                ]
            )
        })

        it('returns all code elements within a given range on a diff code view')
    })
})
