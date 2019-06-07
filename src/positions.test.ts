import { Position } from '@sourcegraph/extension-api-types'
import { of } from 'rxjs'
import { filter, map } from 'rxjs/operators'
import { TestScheduler } from 'rxjs/testing'

import { CodeViewProps, DOM } from './testutils/dom'
import { createMouseEvent, dispatchMouseEventAtPositionImpure } from './testutils/mouse'

import { propertyIsDefined } from './helpers'
import { findPositionsFromEvents } from './positions'
import { HoveredToken } from './token_position'

describe('positions', () => {
    const dom = new DOM()
    after(dom.cleanup)

    let testcases: CodeViewProps[] = []
    before(() => {
        testcases = dom.createCodeViews()
    })

    it('can find the position from a mouse event', () => {
        for (const codeView of testcases) {
            const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))

            scheduler.run(({ cold, expectObservable }) => {
                const diagram = '-ab'

                const positions: { [key: string]: Position } = {
                    a: { line: 5, character: 3 },
                    b: { line: 18, character: 4 },
                }

                const tokens: { [key: string]: HoveredToken } = {
                    a: {
                        line: 5,
                        character: 1,
                    },
                    b: {
                        line: 18,
                        character: 2,
                    },
                }

                const clickedTokens = of(codeView.codeView).pipe(
                    findPositionsFromEvents({ domFunctions: codeView }),
                    filter(propertyIsDefined('position')),
                    map(({ position: { line, character } }) => ({ line, character }))
                )

                cold<Position>(diagram, positions).subscribe(position =>
                    dispatchMouseEventAtPositionImpure('click', codeView, position)
                )

                expectObservable(clickedTokens).toBe(diagram, tokens)
            })
        }
    })

    for (const tokenize of [false, true]) {
        for (const codeView of testcases) {
            it((tokenize ? 'tokenizes' : 'does not tokenize') + ` the DOM when tokenize: ${tokenize}`, () => {
                of(codeView.codeView)
                    .pipe(findPositionsFromEvents({ domFunctions: codeView, tokenize }))
                    .subscribe()

                const htmlBefore = codeView.getCodeElementFromLineNumber(codeView.codeView, 5)!.outerHTML
                codeView.getCodeElementFromLineNumber(codeView.codeView, 5)!.dispatchEvent(
                    createMouseEvent('mouseover', {
                        x: 0,
                        y: 0,
                    })
                )
                const htmlAfter = codeView.getCodeElementFromLineNumber(codeView.codeView, 5)!.outerHTML

                if (tokenize) {
                    chai.expect(htmlBefore).to.not.equal(htmlAfter)
                } else {
                    chai.expect(htmlBefore).to.equal(htmlAfter)
                }
            })
        }
    }
})
