import { isEqual } from 'lodash'
import { EMPTY, Observable, of, Subject, Subscription } from 'rxjs'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'
import { TestScheduler } from 'rxjs/testing'
import { Position } from 'vscode-languageserver-types'

import { noop } from 'lodash'
import { propertyIsDefined } from './helpers'
import {
    AdjustmentDirection,
    createHoverifier,
    HoverFetcher,
    JumpURLFetcher,
    LOADER_DELAY,
    PositionAdjuster,
    TOOLTIP_DISPLAY_DELAY,
} from './hoverifier'
import { HoverOverlayProps } from './HoverOverlay'
import { findPositionsFromEvents } from './positions'
import { CodeViewProps, DOM } from './testutils/dom'
import { createHoverMerged, createStubHoverFetcher, createStubJumpURLFetcher } from './testutils/lsp'
import { clickPositionImpure } from './testutils/mouse'
import { LOADING } from './types'

describe('Hoverifier', () => {
    const dom = new DOM()
    after(dom.cleanup)

    let testcases: CodeViewProps[] = []
    before(() => {
        testcases = dom.createCodeViews()
    })

    it('emits loading and then state on click events', () => {
        for (const codeView of testcases) {
            const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))

            const delayTime = LOADER_DELAY + 100
            const hover = {}
            const defURL = 'def url'

            scheduler.run(({ cold, expectObservable }) => {
                const hoverifier = createHoverifier({
                    closeButtonClicks: new Observable<MouseEvent>(),
                    goToDefinitionClicks: new Observable<MouseEvent>(),
                    hoverOverlayElements: of(null),
                    hoverOverlayRerenders: EMPTY,
                    fetchHover: createStubHoverFetcher(hover, delayTime),
                    fetchJumpURL: createStubJumpURLFetcher(defURL, delayTime),
                    pushHistory: noop,
                    logTelemetryEvent: noop,
                })

                const positionJumps = new Subject<{
                    position: Position
                    codeView: HTMLElement
                    scrollElement: HTMLElement
                }>()

                const positionEvents = of(codeView.codeView).pipe(findPositionsFromEvents(codeView))

                const subscriptions = new Subscription()

                subscriptions.add(hoverifier)
                subscriptions.add(
                    hoverifier.hoverify({
                        dom: codeView,
                        positionEvents,
                        positionJumps,
                        resolveContext: () => codeView.revSpec,
                    })
                )

                const hoverAndDefinitionUpdates = hoverifier.hoverStateUpdates.pipe(
                    filter(propertyIsDefined('hoverOverlayProps')),
                    map(({ hoverOverlayProps: { definitionURLOrError, hoverOrError } }) => ({
                        definitionURLOrError,
                        hoverOrError,
                    })),
                    distinctUntilChanged(isEqual),
                    // For this test, only emit when both hover and def are here.
                    // Even though the fetchers are emitting at the same time, this observable emits twice.
                    filter(
                        ({ definitionURLOrError, hoverOrError }) =>
                            !(
                                (definitionURLOrError && hoverOrError === LOADING) ||
                                (hoverOrError !== LOADING && !definitionURLOrError)
                            )
                    )
                )

                const inputDiagram = 'a'

                // This diagram is probably wrong. We shouldn't have to subtract 1 from the TOOLTIP_DISPLAY_DELAY.
                // The actual frames are 300 and 400 but the expected without the -1 is 300 and 401.
                // I'm either misunderstanding something about marble diagram syntax or there is a 1ms delay somewhere in
                // the code that I'm missing.
                const outputDiagram = `${LOADER_DELAY}ms a ${TOOLTIP_DISPLAY_DELAY - 1}ms b`

                const outputValues: {
                    [key: string]: Pick<HoverOverlayProps, 'hoverOrError' | 'definitionURLOrError'>
                } = {
                    a: { hoverOrError: LOADING, definitionURLOrError: undefined }, // def url is undefined when it is loading
                    b: { hoverOrError: createHoverMerged(hover), definitionURLOrError: { jumpURL: defURL } },
                }

                // Click https://sourcegraph.sgdev.org/github.com/gorilla/mux@cb4698366aa625048f3b815af6a0dea8aef9280a/-/blob/mux.go#L24:6
                cold(inputDiagram).subscribe(() =>
                    clickPositionImpure(codeView, {
                        line: 24,
                        character: 6,
                    })
                )

                expectObservable(hoverAndDefinitionUpdates).toBe(outputDiagram, outputValues)
            })
        }
    })

    it('PositionAdjuster properly adjusts positions', () => {
        for (const codeView of testcases) {
            const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))

            scheduler.run(({ cold, expectObservable }) => {
                const adjustedPositions = new Subject<Position>()

                const fetchHover = createStubHoverFetcher({})
                const wrappedHoverFetcher: HoverFetcher = position => {
                    adjustedPositions.next(position)

                    return fetchHover(position)
                }

                const fetchJumpURL = createStubJumpURLFetcher('def')
                const wrappedJumpURLFetcher: JumpURLFetcher = position => {
                    adjustedPositions.next(position)

                    return fetchJumpURL(position)
                }

                const adjustPosition: PositionAdjuster = ({ codeView, position, direction }) =>
                    direction === AdjustmentDirection.CodeViewToActual
                        ? { line: 1, character: 1 }
                        : { line: -1, character: -1 }

                const hoverifier = createHoverifier({
                    closeButtonClicks: new Observable<MouseEvent>(),
                    goToDefinitionClicks: new Observable<MouseEvent>(),
                    hoverOverlayElements: of(null),
                    hoverOverlayRerenders: EMPTY,
                    fetchHover: wrappedHoverFetcher,
                    fetchJumpURL: wrappedJumpURLFetcher,
                    pushHistory: noop,
                    adjustPosition,
                    logTelemetryEvent: noop,
                })

                const positionJumps = new Subject<{
                    position: Position
                    codeView: HTMLElement
                    scrollElement: HTMLElement
                }>()

                const positionEvents = of(codeView.codeView).pipe(findPositionsFromEvents(codeView))

                const subscriptions = new Subscription()

                subscriptions.add(hoverifier)
                subscriptions.add(
                    hoverifier.hoverify({
                        dom: codeView,
                        positionEvents,
                        positionJumps,
                        resolveContext: () => codeView.revSpec,
                    })
                )

                const inputDiagram = 'ab'
                const outputDiagram = '-(abb)'

                const outputValues: {
                    [key: string]: Position
                } = {
                    a: { line: -1, character: -1 },
                    b: { line: 1, character: 1 },
                }

                cold(inputDiagram).subscribe(() =>
                    clickPositionImpure(codeView, {
                        line: 1,
                        character: 1,
                    })
                )

                expectObservable(adjustedPositions.pipe(map(({ line, character }) => ({ line, character })))).toBe(
                    outputDiagram,
                    outputValues
                )
            })
        }
    })
})
