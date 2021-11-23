import { of } from 'rxjs'
import { catchError, map } from 'rxjs/operators'
import { TestScheduler } from 'rxjs/testing'

import { findPositionsFromEvents } from './positions_events'
import { BlobProps, DOM } from './testutils/dom'
import { createClickEvent, createMouseMoveEvent } from './testutils/mouse'

const getScheduler = () => new TestScheduler((a, b) => chai.assert.deepEqual(a, b))

describe('findPositionEvents', () => {
    const dom = new DOM()
    after(dom.cleanup)

    let testcases: {
        blobProps: BlobProps
        lines: string[]
    }[] = []

    before(() => {
        testcases = dom.createBlobs().map(blobProps => {
            const lines = Array.from(blobProps.element.querySelectorAll('tr td:nth-of-type(2)')!)
                .map(td => td.textContent || '')
                // Only test the first 50 lines to not kill the test runner
                .slice(0, 1)

            return {
                blobProps,
                lines,
            }
        })
    })

    it('handles empty elements', () => {
        const { blobProps } = testcases[0]

        const scheduler = getScheduler()
        scheduler.run(({ cold, expectObservable }) => {
            const errors = cold<HTMLElement>('a', {
                a: dom.createElementFromString(''),
            }).pipe(
                findPositionsFromEvents(blobProps),
                catchError(() => of('err'))
            )

            expectObservable(errors).toBe('(a|)', {
                a: 'err',
            })
        })
    })

    it('emits with the correct position on hovers', () => {
        for (const { blobProps } of testcases) {
            const scheduler = getScheduler()

            scheduler.run(({ cold, expectObservable }) => {
                const positionEvents = of(blobProps.element).pipe(
                    findPositionsFromEvents(blobProps),
                    map(({ line, character }) => ({ line, character }))
                )

                const diagram = '-abcdefg'
                const inputMap = {
                    a: 0,
                    b: 1,
                    c: 2,
                    d: 3,
                    e: 4,
                    f: 5,
                    g: 18,
                }

                // Line 18 because it has a tab at the beginning (17 because Position is 0-indexed)
                const l = 17

                const outputMap = {
                    a: { line: l, character: 0 },
                    b: { line: l, character: 1 },
                    c: { line: l, character: 18 },
                }

                const cell = blobProps.getCodeElementFromLineNumber(blobProps.element, 17) as HTMLEmbedElement

                cold(diagram, inputMap).subscribe(i => {
                    const char = cell.querySelector(`[data-char="${i}"]`) as HTMLElement

                    const rect = char.getBoundingClientRect()

                    const event = createMouseMoveEvent({
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2,
                    })

                    char.dispatchEvent(event)
                })

                expectObservable(positionEvents).toBe('-ab----c', outputMap)
            })
        }
    })

    it('emits with character as -1 when an event happens before or after the characters', () => {
        for (const { blobProps } of testcases) {
            const scheduler = getScheduler()

            scheduler.run(({ cold, expectObservable, flush }) => {
                const positionEvents = of(blobProps.element).pipe(
                    findPositionsFromEvents(blobProps),
                    map(({ line, character }) => ({ line, character }))
                )

                const diagram = '-abcdefg'
                const inputMap = {
                    a: 6,
                    b: 7,
                    c: 8,
                    d: 9,
                    e: 10,
                    f: 11,
                    g: 12,
                }

                const noChar = (line: number) => ({ line, character: -1 })

                const outputMap = {
                    a: noChar(6),
                    b: noChar(7),
                    c: noChar(8),
                    d: noChar(9),
                    e: noChar(10),
                    f: noChar(11),
                    g: noChar(12),
                }

                cold<number>(diagram, inputMap).subscribe(i => {
                    const cell = blobProps.getCodeElementFromLineNumber(blobProps.element, i) as HTMLEmbedElement

                    const char = cell.querySelector('[data-char="0"]') as HTMLElement

                    const rect = char.getBoundingClientRect()

                    const event = createMouseMoveEvent({
                        x: rect.left - 10,
                        y: 0, // doesn't matter
                    })

                    char.dispatchEvent(event)
                })

                expectObservable(positionEvents).toBe(diagram, outputMap)
            })
        }
    })

    it('emits with the correct position on clicks', () => {
        for (const { blobProps } of testcases) {
            const scheduler = getScheduler()

            scheduler.run(({ cold, expectObservable, flush }) => {
                const positionEvents = of(blobProps.element).pipe(
                    findPositionsFromEvents(blobProps),
                    map(({ line, character }) => ({ line, character }))
                )

                const diagram = '-abcdefg'
                const inputMap = {
                    a: 6,
                    b: 7,
                    c: 8,
                    d: 9,
                    e: 10,
                    f: 11,
                    g: 12,
                }

                const l = 24

                const outputMap = {
                    a: { line: l, character: 6 },
                    b: { line: l, character: 7 },
                    c: { line: l, character: 8 },
                    d: { line: l, character: 9 },
                }

                cold<number>(diagram, inputMap).subscribe(i => {
                    const cell = blobProps.getCodeElementFromLineNumber(blobProps.element, l) as HTMLEmbedElement

                    const char = cell.querySelector(`[data-char="${i}"]`) as HTMLElement

                    const rect = char.getBoundingClientRect()

                    const event = createClickEvent({
                        x: rect.left + rect.width / 2,
                        y: rect.top + rect.height / 2,
                    })

                    char.dispatchEvent(event)
                })

                expectObservable(positionEvents).toBe('-abcd', outputMap)
            })
        }
    })

    it('emits with the correct eventType', () => {
        for (const { blobProps } of testcases) {
            const scheduler = getScheduler()

            scheduler.run(({ cold, expectObservable, flush }) => {
                const positionEvents = of(blobProps.element).pipe(
                    findPositionsFromEvents(blobProps),
                    map(({ eventType }) => eventType)
                )

                const diagram = '-ab'
                const inputMap = {
                    a: createMouseMoveEvent({ x: 0, y: 0 }),
                    b: createClickEvent({ x: 0, y: 0 }),
                }

                const outputMap = {
                    a: 'mousemove',
                    b: 'click',
                }

                const elem = blobProps.getCodeElementFromLineNumber(blobProps.element, 0) as HTMLElement

                cold<MouseEvent>(diagram, inputMap).subscribe(event => {
                    elem.dispatchEvent(event)
                })

                expectObservable(positionEvents).toBe(diagram, outputMap)
            })
        }
    })
})
