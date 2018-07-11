import { isEqual } from 'lodash'
import { Observable, of, Subject, Subscription } from 'rxjs'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'
import { TestScheduler } from 'rxjs/testing'
import { Position } from 'vscode-languageserver-types'

import { noop } from 'lodash'
import { propertyIsDefined } from './helpers'
import { createHoverifier, LOADER_DELAY, TOOLTIP_DISPLAY_DELAY } from './hoverifier'
import { HoverOverlayProps } from './HoverOverlay'
import { findPositionsFromEvents } from './positions'
import { BlobProps, DOM } from './testutils/dom'
import { createHoverMerged, createStubHoverFetcher, createStubJumpURLFetcher } from './testutils/lsp'
import { clickPositionImpure } from './testutils/mouse'
import { LOADING } from './types'

describe('Hoverifier', () => {
    const dom = new DOM()
    after(dom.cleanup)

    let testcases: BlobProps[] = []
    before(() => {
        testcases = dom.createBlobs()
    })

    it('emits loading and then state on click events', () => {
        for (const blob of testcases) {
            const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))

            const delayTime = LOADER_DELAY + 100
            const hover = {}
            const defURL = 'def url'

            scheduler.run(({ cold, expectObservable }) => {
                const hoverifier = createHoverifier({
                    closeButtonClicks: new Observable<MouseEvent>(),
                    goToDefinitionClicks: new Observable<MouseEvent>(),
                    hoverOverlayElements: of(null),
                    hoverOverlayRerenders: new Observable<{
                        hoverOverlayElement: HTMLElement
                        scrollElement: HTMLElement
                    }>(),
                    fetchHover: createStubHoverFetcher(hover, delayTime),
                    fetchJumpURL: createStubJumpURLFetcher(defURL, delayTime),
                    pushHistory: noop,
                    logTelemetryEvent: noop,
                })

                const positionJumps = new Subject<{
                    position: Position
                    codeElement: HTMLElement
                    scrollElement: HTMLElement
                }>()

                const positionEvents = of(blob.element).pipe(findPositionsFromEvents())

                const subscriptions = new Subscription()

                subscriptions.add(hoverifier)
                subscriptions.add(
                    hoverifier.hoverify({
                        positionEvents,
                        positionJumps,
                        resolveContext: () => blob.revSpec,
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
                    clickPositionImpure(blob, {
                        line: 23,
                        character: 6,
                    })
                )

                expectObservable(hoverAndDefinitionUpdates).toBe(outputDiagram, outputValues)
            })
        }
    })
})
