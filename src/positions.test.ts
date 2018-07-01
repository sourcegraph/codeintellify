import { of } from 'rxjs'
import { filter, map } from 'rxjs/operators'
import { TestScheduler } from 'rxjs/testing'
import { Position } from 'vscode-languageserver-types'

import { BlobProps, DOM } from './testutils/dom'
import { clickPositionImpure } from './testutils/mouse'

import { propertyIsDefined } from './helpers'
import { findPositionsFromEvents } from './positions'
import { HoveredToken } from './token_position'

describe('position_listener', () => {
    const dom = new DOM()
    after(dom.cleanup)

    let testcases: BlobProps[] = []
    before(() => {
        testcases = dom.createBlobs()
    })

    it('can find the position from a mouse event', () => {
        for (const blob of testcases) {
            const scheduler = new TestScheduler(chai.assert.deepEqual)

            scheduler.run(({ cold, expectObservable }) => {
                const diagram = '-ab'

                const positions: { [key: string]: Position } = {
                    a: { line: 4, character: 3 },
                    b: { line: 17, character: 4 },
                }

                const tokens: { [key: string]: HoveredToken } = {
                    a: {
                        line: 5,
                        character: 1,
                        word: 'package',
                    },
                    b: {
                        line: 18,
                        character: 2,
                        word: 'ErrMethodMismatch',
                    },
                }

                const clickedTokens = of(blob.element).pipe(
                    findPositionsFromEvents(),
                    filter(propertyIsDefined('position')),
                    map(({ position: { line, character, word } }) => ({ line, character, word }))
                )

                cold<Position>(diagram, positions).subscribe(position => clickPositionImpure(blob, position))

                expectObservable(clickedTokens).toBe(diagram, tokens)
            })
        }
    })
})
