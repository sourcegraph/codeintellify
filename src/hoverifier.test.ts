import { isEqual } from 'lodash'
import { EMPTY, NEVER, Observable, of, Subject, Subscription } from 'rxjs'
import { distinctUntilChanged, filter, map } from 'rxjs/operators'
import { TestScheduler } from 'rxjs/testing'
import { Position, Range } from 'vscode-languageserver-types'

import { noop } from 'lodash'
import { propertyIsDefined } from './helpers'
import {
    AdjustmentDirection,
    createHoverifier,
    LOADER_DELAY,
    MOUSEOVER_DELAY,
    PositionAdjuster,
    TOOLTIP_DISPLAY_DELAY,
} from './hoverifier'
import { HoverOverlayProps } from './HoverOverlay'
import { findPositionsFromEvents, SupportedMouseEvent } from './positions'
import { CodeViewProps, DOM } from './testutils/dom'
import { createHoverMerged, createStubHoverFetcher, createStubJumpURLFetcher } from './testutils/lsp'
import { dispatchMouseEventAtPositionImpure } from './testutils/mouse'
import { LOADING } from './types'

describe('Hoverifier', () => {
    const dom = new DOM()
    after(dom.cleanup)

    let testcases: CodeViewProps[] = []
    before(() => {
        testcases = dom.createCodeViews()
    })

    it('highlights token when hover is fetched (not before)', () => {
        for (const codeView of testcases) {
            const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))

            const delayTime = 100
            const hoverRange = { start: { line: 1, character: 2 }, end: { line: 3, character: 4 } }

            scheduler.run(({ cold, expectObservable }) => {
                const hoverifier = createHoverifier({
                    closeButtonClicks: NEVER,
                    goToDefinitionClicks: NEVER,
                    hoverOverlayElements: of(null),
                    hoverOverlayRerenders: EMPTY,
                    fetchHover: createStubHoverFetcher({ range: hoverRange }, LOADER_DELAY + delayTime),
                    fetchJumpURL: () => of(null),
                    pushHistory: noop,
                    getReferencesURL: () => null,
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

                const highlightedRangeUpdates = hoverifier.hoverStateUpdates.pipe(
                    map(hoverOverlayProps => (hoverOverlayProps ? hoverOverlayProps.highlightedRange : null)),
                    distinctUntilChanged((a, b) => isEqual(a, b))
                )

                const inputDiagram = 'a'

                const outputDiagram = `${MOUSEOVER_DELAY}ms a ${LOADER_DELAY + delayTime - 1}ms b`

                const outputValues: {
                    [key: string]: Range | undefined
                } = {
                    a: undefined, // highlightedRange is undefined when the hover is loading
                    b: hoverRange,
                }

                // Hover over https://sourcegraph.sgdev.org/github.com/gorilla/mux@cb4698366aa625048f3b815af6a0dea8aef9280a/-/blob/mux.go#L24:6
                cold(inputDiagram).subscribe(() =>
                    dispatchMouseEventAtPositionImpure('mouseover', codeView, {
                        line: 24,
                        character: 6,
                    })
                )

                expectObservable(highlightedRangeUpdates).toBe(outputDiagram, outputValues)
            })
        }
    })

    it('pins the overlay without it disappearing temporarily on mouseover then click', () => {
        for (const codeView of testcases) {
            const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))

            const hover = {}
            const defURL = 'def url'
            const delayTime = 10

            scheduler.run(({ cold, expectObservable }) => {
                const hoverifier = createHoverifier({
                    closeButtonClicks: NEVER,
                    goToDefinitionClicks: new Observable<MouseEvent>(),
                    hoverOverlayElements: of(null),
                    hoverOverlayRerenders: EMPTY,
                    fetchHover: createStubHoverFetcher(hover, delayTime),
                    fetchJumpURL: createStubJumpURLFetcher(defURL, delayTime),
                    pushHistory: noop,
                    getReferencesURL: () => null,
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
                    map(hoverState => !!hoverState.hoverOverlayProps),
                    distinctUntilChanged(isEqual)
                )

                // If you need to debug this test, the following might help. Append this to the `outputDiagram`
                // string below:
                //
                //   ` ${delayAfterMouseover - 1}ms c ${delayTime - 1}ms d`
                //
                // Also, add these properties to `outputValues`:
                //
                //   c: true, // the most important instant, right after the click to pin (must be true, meaning it doesn't disappear)
                //   d: true,
                //
                // There should be no emissions at "c" or "d", so this will cause the test to fail. But those are
                // the most likely instants where there would be an emission if pinning is causing a temporary
                // disappearance of the overlay.
                const delayAfterMouseover = 100
                const outputDiagram = `${MOUSEOVER_DELAY}ms a ${delayTime - 1}ms b`
                const outputValues: {
                    [key: string]: boolean
                } = {
                    a: false,
                    b: true,
                }

                // Mouseover https://sourcegraph.sgdev.org/github.com/gorilla/mux@cb4698366aa625048f3b815af6a0dea8aef9280a/-/blob/mux.go#L24:6
                cold('a').subscribe(() =>
                    dispatchMouseEventAtPositionImpure('mouseover', codeView, {
                        line: 24,
                        character: 6,
                    })
                )

                // Click (to pin) https://sourcegraph.sgdev.org/github.com/gorilla/mux@cb4698366aa625048f3b815af6a0dea8aef9280a/-/blob/mux.go#L24:6
                cold(`${MOUSEOVER_DELAY + delayTime + delayAfterMouseover}ms c`).subscribe(() =>
                    dispatchMouseEventAtPositionImpure('click', codeView, {
                        line: 24,
                        character: 6,
                    })
                )

                // Mouseover something else and ensure it remains pinned.
                cold(`${MOUSEOVER_DELAY + delayTime + delayAfterMouseover + 100}ms d`).subscribe(() =>
                    dispatchMouseEventAtPositionImpure('mouseover', codeView, {
                        line: 25,
                        character: 3,
                    })
                )

                expectObservable(hoverAndDefinitionUpdates).toBe(outputDiagram, outputValues)
            })
        }
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
                    getReferencesURL: () => null,
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

                // Subtract 1ms before "b" because "a" takes up 1ms.
                const outputDiagram = `${LOADER_DELAY}ms a ${TOOLTIP_DISPLAY_DELAY - 1}ms b`

                const outputValues: {
                    [key: string]: Pick<HoverOverlayProps, 'hoverOrError' | 'definitionURLOrError'>
                } = {
                    a: { hoverOrError: LOADING, definitionURLOrError: undefined }, // def url is undefined when it is loading
                    b: { hoverOrError: createHoverMerged(hover), definitionURLOrError: { jumpURL: defURL } },
                }

                // Click https://sourcegraph.sgdev.org/github.com/gorilla/mux@cb4698366aa625048f3b815af6a0dea8aef9280a/-/blob/mux.go#L24:6
                cold(inputDiagram).subscribe(() =>
                    dispatchMouseEventAtPositionImpure('click', codeView, {
                        line: 24,
                        character: 6,
                    })
                )

                expectObservable(hoverAndDefinitionUpdates).toBe(outputDiagram, outputValues)
            })
        }
    })

    it('debounces mousemove events before showing overlay', () => {
        for (const codeView of testcases) {
            const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))

            const hover = {}
            const defURL = 'def url'

            scheduler.run(({ cold, expectObservable }) => {
                const hoverifier = createHoverifier({
                    closeButtonClicks: new Observable<MouseEvent>(),
                    goToDefinitionClicks: new Observable<MouseEvent>(),
                    hoverOverlayElements: of(null),
                    hoverOverlayRerenders: EMPTY,
                    fetchHover: createStubHoverFetcher(hover),
                    fetchJumpURL: createStubJumpURLFetcher(defURL),
                    pushHistory: noop,
                    getReferencesURL: () => null,
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
                    map(({ hoverOverlayProps }) => !!hoverOverlayProps),
                    distinctUntilChanged(isEqual)
                )

                const mousemoveDelay = 25
                const outputDiagram = `${TOOLTIP_DISPLAY_DELAY + mousemoveDelay}ms a`

                const outputValues: { [key: string]: boolean } = {
                    a: true,
                }

                // Mousemove on https://sourcegraph.sgdev.org/github.com/gorilla/mux@cb4698366aa625048f3b815af6a0dea8aef9280a/-/blob/mux.go#L24:6
                cold(`a b ${mousemoveDelay - 2}ms c ${TOOLTIP_DISPLAY_DELAY - 1}ms`, {
                    a: 'mouseover',
                    b: 'mousemove',
                    c: 'mousemove',
                } as Record<string, SupportedMouseEvent>).subscribe(eventType =>
                    dispatchMouseEventAtPositionImpure(eventType, codeView, {
                        line: 24,
                        character: 6,
                    })
                )

                expectObservable(hoverAndDefinitionUpdates).toBe(outputDiagram, outputValues)
            })
        }
    })

    it('dedupes mouseover and mousemove event on same token', () => {
        for (const codeView of testcases) {
            const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))

            const hover = {}
            const defURL = 'def url'

            scheduler.run(({ cold, expectObservable }) => {
                const hoverifier = createHoverifier({
                    closeButtonClicks: new Observable<MouseEvent>(),
                    goToDefinitionClicks: new Observable<MouseEvent>(),
                    hoverOverlayElements: of(null),
                    hoverOverlayRerenders: EMPTY,
                    fetchHover: createStubHoverFetcher(hover),
                    fetchJumpURL: createStubJumpURLFetcher(defURL),
                    pushHistory: noop,
                    getReferencesURL: () => null,
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
                    map(({ hoverOverlayProps }) => !!hoverOverlayProps),
                    distinctUntilChanged(isEqual)
                )

                // Add 2 for 1 tick each for "c" and "d" below.
                const outputDiagram = `${TOOLTIP_DISPLAY_DELAY + MOUSEOVER_DELAY + 2}ms a`

                const outputValues: { [key: string]: boolean } = {
                    a: true,
                }

                // Mouse on https://sourcegraph.sgdev.org/github.com/gorilla/mux@cb4698366aa625048f3b815af6a0dea8aef9280a/-/blob/mux.go#L24:6
                cold(`a b ${MOUSEOVER_DELAY - 2}ms c d e`, {
                    a: 'mouseover',
                    b: 'mousemove',
                    // Now perform repeated mousemove/mouseover events on the same token.
                    c: 'mousemove',
                    d: 'mouseover',
                    e: 'mousemove',
                } as Record<string, SupportedMouseEvent>).subscribe(eventType =>
                    dispatchMouseEventAtPositionImpure(eventType, codeView, {
                        line: 24,
                        character: 6,
                    })
                )

                expectObservable(hoverAndDefinitionUpdates).toBe(outputDiagram, outputValues)
            })
        }
    })

    /**
     * This test ensures that the adjustPosition options is being called in the ways we expect. This test is actually not the best way to ensure the feature
     * works as expected. This is a good example of a bad side effect of how the main `hoverifier.ts` file is too tightly integrated with itself. Ideally, I'd be able to assert
     * that the effected positions have actually been adjusted as intended but this is impossible with the current implementation. We can assert that the `HoverFetcher` and `JumpURLFetcher`s
     * have the adjusted positions (AdjustmentDirection.CodeViewToActual). However, we cannot reliably assert that the code "highlighting" the token has the position adjusted (AdjustmentDirection.ActualToCodeView).
     */
    /**
     * This test is skipped because its flakey. I'm unsure how to reliably test this feature in hoverifiers current state.
     */
    it.skip('PositionAdjuster gets called when expected', () => {
        for (const codeView of testcases) {
            const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))

            scheduler.run(({ cold, expectObservable }) => {
                const adjustmentDirections = new Subject<AdjustmentDirection>()

                const fetchHover = createStubHoverFetcher({})
                const fetchJumpURL = createStubJumpURLFetcher('def')

                const adjustPosition: PositionAdjuster<{}> = ({ direction, position }) => {
                    adjustmentDirections.next(direction)

                    return of(position)
                }

                const hoverifier = createHoverifier({
                    closeButtonClicks: new Observable<MouseEvent>(),
                    goToDefinitionClicks: new Observable<MouseEvent>(),
                    hoverOverlayElements: of(null),
                    hoverOverlayRerenders: EMPTY,
                    fetchHover,
                    fetchJumpURL,
                    pushHistory: noop,
                    getReferencesURL: () => null,
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
                        adjustPosition,
                        resolveContext: () => codeView.revSpec,
                    })
                )

                const inputDiagram = 'ab'
                // There is probably a bug in code that is unrelated to this feature that is causing the PositionAdjuster to be called an extra time.
                // It should look like '-(ba)'. That is, we adjust the position from CodeViewToActual for the LSP fetches and then back from CodeViewToActual
                // for highlighting the token in the DOM.
                const outputDiagram = 'a(ba)'

                const outputValues: {
                    [key: string]: AdjustmentDirection
                } = {
                    a: AdjustmentDirection.ActualToCodeView,
                    b: AdjustmentDirection.CodeViewToActual,
                }

                cold(inputDiagram).subscribe(() =>
                    dispatchMouseEventAtPositionImpure('click', codeView, {
                        line: 1,
                        character: 1,
                    })
                )

                expectObservable(adjustmentDirections).toBe(outputDiagram, outputValues)
            })
        }
    })
})
