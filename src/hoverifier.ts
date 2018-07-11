import { isEqual } from 'lodash'
import { combineLatest, concat, fromEvent, merge, Observable, of, Subject, Subscription, zip } from 'rxjs'
import {
    catchError,
    debounceTime,
    delay,
    distinctUntilChanged,
    filter,
    map,
    share,
    switchMap,
    takeUntil,
    withLatestFrom,
} from 'rxjs/operators'
import { Key } from 'ts-key-enum'
import { Position } from 'vscode-languageserver-types'
import { asError, ErrorLike } from './errors'
import { isDefined } from './helpers'
import { overlayUIHasContent, scrollIntoCenterIfNeeded } from './helpers'
import { HoverOverlayProps, isJumpURL } from './HoverOverlay'
import { calculateOverlayPosition } from './overlay_position'
import { PositionEvent, SupportedMouseEvent } from './positions'
import { createObservableStateContainer } from './state'
import {
    convertNode,
    DOMOptions,
    findElementWithOffset,
    getCodeElementsInRange,
    getTokenAtPosition,
    HoveredToken,
    locateTarget,
} from './token_position'
import { EMODENOTFOUND, HoverMerged, LOADING } from './types'
import { FileSpec, LineOrPositionOrRange, RepoSpec, ResolvedRevSpec, RevSpec } from './url'

export { HoveredToken }

interface HoverifierOptions {
    /**
     * Emit the HoverOverlay element on this after it was rerendered when its content changed and it needs to be repositioned.
     */
    hoverOverlayRerenders: Observable<{
        hoverOverlayElement: HTMLElement
        scrollElement: HTMLElement
    }>

    /**
     * Emit on this Observable when the Go-To-Definition button in the HoverOverlay was clicked
     */
    goToDefinitionClicks: Observable<MouseEvent>

    /**
     * Emit on this Observable when the close button in the HoverOverlay was clicked
     */
    closeButtonClicks: Observable<MouseEvent>

    hoverOverlayElements: Observable<HTMLElement | null>

    dom: DOMOptions

    /**
     * Called for programmatic navigation (like `history.push()`)
     */
    pushHistory: (path: string) => void

    /**
     * Called to log telemetry events
     */
    logTelemetryEvent: (event: string, data?: any) => void

    fetchHover: HoverFetcher
    fetchJumpURL: JumpURLFetcher
}

/**
 * A Hoverifier is a function that hoverifies one code view element in the DOM.
 * It will do very dirty things to it. Only call it if you're into that.
 *
 * There can be multiple code views in the DOM, which will only show a single HoverOverlay if the same Hoverifier was used.
 */
export interface Hoverifier {
    /**
     * The current Hover state. You can use this to read the initial state synchronously.
     */
    hoverState: Readonly<HoverState>
    /**
     * This Observable is to notify that the state that is used to render the HoverOverlay needs to be updated.
     */
    hoverStateUpdates: Observable<Readonly<HoverState>>

    /**
     * Hoverifies a code view.
     */
    hoverify(options: HoverifyOptions): Subscription

    unsubscribe(): void
}

export interface HoverifyOptions {
    positionEvents: Observable<PositionEvent>

    /**
     * Emit on this Observable to trigger the overlay on a position in this code view.
     * This Observable is intended to be used to trigger a Hover after a URL change with a position.
     */
    positionJumps: Observable<{
        /**
         * The position within the code view to jump to
         */
        position: LineOrPositionOrRange
        /**
         * The code view
         */
        codeElement: HTMLElement
        /**
         * The element to scroll if the position is out of view
         */
        scrollElement: HTMLElement
    }>
    resolveContext: ContextResolver
}

/**
 * Output that contains the information needed to render the HoverOverlay.
 */
export interface HoverState {
    /**
     * The props to pass to `HoverOverlay`, or `undefined` if it should not be rendered.
     */
    hoverOverlayProps?: Pick<HoverOverlayProps, Exclude<keyof HoverOverlayProps, 'linkComponent' | 'logTelemetryEvent'>>

    /**
     * The currently selected position, if any.
     * Can be a single line number or a line range.
     * Highlighted with a background color.
     */
    selectedPosition?: LineOrPositionOrRange
}

interface InternalHoverifierState {
    hoverOrError?: typeof LOADING | HoverMerged | null | ErrorLike
    definitionURLOrError?: typeof LOADING | { jumpURL: string } | null | ErrorLike

    hoverOverlayIsFixed: boolean

    /** The desired position of the hover overlay */
    hoverOverlayPosition?: { left: number; top: number }

    /**
     * Whether the user has clicked the go to definition button for the current overlay yet,
     * and whether he pressed Ctrl/Cmd while doing it to open it in a new tab or not.
     */
    clickedGoToDefinition: false | 'same-tab' | 'new-tab'

    /** The currently hovered token */
    hoveredToken?: HoveredToken & HoveredTokenContext

    mouseIsMoving: boolean

    /**
     * The currently selected position, if any.
     * Can be a single line number or a line range.
     * Highlighted with a background color.
     */
    selectedPosition?: LineOrPositionOrRange
}

/**
 * Returns true if the HoverOverlay component should be rendered according to the given state.
 */
const shouldRenderOverlay = (state: InternalHoverifierState): boolean =>
    !(!state.hoverOverlayIsFixed && state.mouseIsMoving) && overlayUIHasContent(state)

/**
 * Maps internal HoverifierState to the publicly exposed HoverState
 */
const internalToExternalState = (internalState: InternalHoverifierState): HoverState => ({
    selectedPosition: internalState.selectedPosition,
    hoverOverlayProps: shouldRenderOverlay(internalState)
        ? {
              overlayPosition: internalState.hoverOverlayPosition,
              hoverOrError: internalState.hoverOrError,
              definitionURLOrError:
                  // always modify the href, but only show error/loader/not found after the button was clicked
                  isJumpURL(internalState.definitionURLOrError) || internalState.clickedGoToDefinition
                      ? internalState.definitionURLOrError
                      : undefined,
              hoveredToken: internalState.hoveredToken,
              showCloseButton: internalState.hoverOverlayIsFixed,
          }
        : undefined,
})

/** The time in ms after which to show a loader if the result has not returned yet */
export const LOADER_DELAY = 300

/** The time in ms after the mouse has stopped moving in which to show the tooltip */
export const TOOLTIP_DISPLAY_DELAY = 100

export type HoverFetcher = (position: HoveredToken & HoveredTokenContext) => Observable<HoverMerged | null>
export type JumpURLFetcher = (position: HoveredToken & HoveredTokenContext) => Observable<string | null>
export type ContextResolver = (hoveredToken: HoveredToken) => HoveredTokenContext

export interface HoveredTokenContext extends RepoSpec, RevSpec, FileSpec, ResolvedRevSpec {}

export const createHoverifier = ({
    goToDefinitionClicks,
    closeButtonClicks,
    hoverOverlayRerenders,
    pushHistory,
    fetchHover,
    fetchJumpURL,
    logTelemetryEvent,
    dom,
}: HoverifierOptions): Hoverifier => {
    // Internal state that is not exposed to the caller
    // Shared between all hoverified code views
    const container = createObservableStateContainer<InternalHoverifierState>({
        hoverOverlayIsFixed: false,
        clickedGoToDefinition: false,
        definitionURLOrError: undefined,
        hoveredToken: undefined,
        hoverOrError: undefined,
        hoverOverlayPosition: undefined,
        mouseIsMoving: false,
        selectedPosition: undefined,
    })

    interface MouseEventTrigger extends PositionEvent {
        resolveContext: ContextResolver
    }

    // These Subjects aggregate all events from all hoverified code views
    const allPositionsFromEvents = new Subject<MouseEventTrigger>()

    const isEventType = <T extends SupportedMouseEvent>(type: T) => (
        event: MouseEventTrigger
    ): event is MouseEventTrigger & { eventType: T } => event.eventType === type
    const allCodeMouseMoves = allPositionsFromEvents.pipe(filter(isEventType('mousemove')))
    const allCodeMouseOvers = allPositionsFromEvents.pipe(filter(isEventType('mouseover')))
    const allCodeClicks = allPositionsFromEvents.pipe(filter(isEventType('click')))

    const allPositionJumps = new Subject<{
        position: LineOrPositionOrRange
        codeElement: HTMLElement
        scrollElement: HTMLElement
        resolveContext: ContextResolver
    }>()

    const subscription = new Subscription()

    /**
     * click events on the code element, ignoring click events caused by the user selecting text.
     * Selecting text should not mess with the hover, hover pinning nor the URL.
     */
    const codeClicksWithoutSelections = allCodeClicks.pipe(filter(() => window.getSelection().toString() === ''))

    // Mouse is moving, don't show the tooltip
    subscription.add(
        merge(
            allCodeMouseMoves.pipe(
                map(({ event }) => event.target),
                // Make sure a move of the mouse from the go-to-definition button
                // back to the same target doesn't cause the tooltip to briefly disappear
                distinctUntilChanged(),
                map(() => true)
            ),

            // When the mouse stopped for TOOLTIP_DISPLAY_DELAY, show tooltip
            // Don't use mouseover for this because it is only fired once per token,
            // not continuously while moving the mouse
            allCodeMouseMoves.pipe(
                debounceTime(TOOLTIP_DISPLAY_DELAY),
                map(() => false)
            )
        ).subscribe(mouseIsMoving => {
            container.update({ mouseIsMoving })
        })
    )

    const codeMouseOverTargets = allCodeMouseOvers.pipe(
        map(({ event, ...rest }) => ({
            target: event.target as HTMLElement,
            ...rest,
        })),
        debounceTime(50),
        // Do not consider mouseovers while overlay is pinned
        filter(() => !container.values.hoverOverlayIsFixed),
        share()
    )

    const codeClickTargets = codeClicksWithoutSelections.pipe(
        filter(({ event }) => event.currentTarget !== null),
        map(({ event, ...rest }) => ({
            target: event.target as HTMLElement,
            ...rest,
        })),
        share()
    )

    /** Emits DOM elements at new positions found in the URL */
    const jumpTargets = allPositionJumps.pipe(
        // Only use line and character for comparison
        map(({ position: { line, character }, ...rest }) => ({ position: { line, character }, ...rest })),
        // Ignore same values
        // It's important to do this before filtering otherwise navigating from
        // a position, to a line-only position, back to the first position would get ignored
        distinctUntilChanged((a, b) => isEqual(a, b)),
        // Ignore undefined or partial positions (e.g. line only)
        filter((jump): jump is typeof jump & { position: Position } => Position.is(jump.position)),
        map(({ position, codeElement, ...rest }) => {
            const cell = dom.getCodeElementFromLineNumber(codeElement, position.line)
            if (!cell) {
                return undefined
            }
            const target = findElementWithOffset(cell, position.character)
            if (!target) {
                console.warn('Could not find target for position in file', position)
                return undefined
            }
            // TODO locateTarget is purely needed here to get `hoveredToken.part` for diffs
            //      We should define a function that takes care of _only_ figuring out the `part`
            //      so we don't have to use locateTarget
            const hoveredToken = locateTarget(target, { ignoreFirstChar: false, ...dom })
            if (!Position.is(hoveredToken)) {
                console.warn('Could not find target for position in file', position)
                return undefined
            }
            return { ...rest, eventType: 'jump' as 'jump', target, position: hoveredToken, codeElement }
        }),
        filter(isDefined)
    )

    // REPOSITIONING
    // On every componentDidUpdate (after the component was rerendered, e.g. from a hover state update) resposition
    // the tooltip
    // It's important to add this subscription first so that withLatestFrom will be guaranteed to have gotten the
    // latest hover target by the time componentDidUpdate is triggered from the setState() in the second chain
    subscription.add(
        // Take every rerender
        hoverOverlayRerenders
            .pipe(
                // with the latest target that came from either a mouseover, click or location change (whatever was the most recent)
                withLatestFrom(merge(codeMouseOverTargets, codeClickTargets, jumpTargets)),
                map(([{ hoverOverlayElement, scrollElement }, { target }]) =>
                    calculateOverlayPosition(scrollElement, target, hoverOverlayElement)
                )
            )
            .subscribe(hoverOverlayPosition => {
                container.update({ hoverOverlayPosition })
            })
    )

    /** Emits new positions including context at which a tooltip needs to be shown from clicks, mouseovers and URL changes. */
    const resolvedPositions = merge(codeMouseOverTargets, jumpTargets, codeClickTargets).pipe(
        map(({ position, resolveContext, ...rest }) => ({
            ...rest,
            position: Position.is(position) ? { ...position, ...resolveContext(position) } : undefined,
        })),
        share()
    )

    /**
     * For every position, emits an Observable with new values for the `hoverOrError` state.
     * This is a higher-order Observable (Observable that emits Observables).
     */
    const hoverObservables = resolvedPositions.pipe(
        map(({ position, codeElement }) => {
            if (!position) {
                return of({ codeElement, hoverOrError: undefined })
            }
            // Fetch the hover for that position
            const hoverFetch = fetchHover(position).pipe(
                catchError(error => {
                    if (error && error.code === EMODENOTFOUND) {
                        return [undefined]
                    }
                    return [asError(error)]
                }),
                share()
            )
            // 1. Reset the hover content, so no old hover content is displayed at the new position while fetching
            // 2. Show a loader if the hover fetch hasn't returned after 100ms
            // 3. Show the hover once it returned
            return merge(
                [undefined],
                of(LOADING).pipe(
                    delay(LOADER_DELAY),
                    takeUntil(hoverFetch)
                ),
                hoverFetch
            ).pipe(map(hoverOrError => ({ hoverOrError, codeElement })))
        }),
        share()
    )
    // Highlight the hover range returned by the language server
    subscription.add(
        hoverObservables
            .pipe(switchMap(hoverObservable => hoverObservable))
            .subscribe(({ hoverOrError, codeElement }) => {
                container.update({
                    hoverOrError,
                    // Reset the hover position, it's gonna be repositioned after the hover was rendered
                    hoverOverlayPosition: undefined,
                })
                const currentHighlighted = codeElement!.querySelector('.selection-highlight')
                if (currentHighlighted) {
                    currentHighlighted.classList.remove('selection-highlight')
                }
                if (!HoverMerged.is(hoverOrError) || !hoverOrError.range) {
                    return
                }
                // LSP is 0-indexed, the code in the webapp currently is 1-indexed
                const { line, character } = hoverOrError.range.start
                const token = getTokenAtPosition(codeElement!, { line: line + 1, character: character + 1 }, dom)
                if (!token) {
                    return
                }
                token.classList.add('selection-highlight')
            })
    )
    // Telemetry for hovers
    subscription.add(
        zip(resolvedPositions, hoverObservables)
            .pipe(
                distinctUntilChanged(([positionA], [positionB]) => isEqual(positionA, positionB)),
                switchMap(([position, hoverObservable]) => hoverObservable),
                filter(HoverMerged.is)
            )
            .subscribe(() => {
                logTelemetryEvent('SymbolHovered')
            })
    )

    /**
     * For every position, emits an Observable that emits new values for the `definitionURLOrError` state.
     * This is a higher-order Observable (Observable that emits Observables).
     */
    const definitionObservables = resolvedPositions.pipe(
        // Fetch the definition location for that position
        map(({ position }) => {
            if (!position) {
                return of(undefined)
            }
            return concat(
                [LOADING],
                fetchJumpURL(position).pipe(
                    map(url => (url !== null ? { jumpURL: url } : null)),
                    catchError(error => [asError(error)])
                )
            )
        })
    )

    // GO TO DEFINITION FETCH
    // On every new hover position, (pre)fetch definition and update the state
    subscription.add(
        definitionObservables
            // flatten inner Observables
            .pipe(switchMap(definitionObservable => definitionObservable))
            .subscribe(definitionURLOrError => {
                container.update({ definitionURLOrError })
                // If the j2d button was already clicked and we now have the result, jump to it
                // TODO move this logic into HoverOverlay
                if (container.values.clickedGoToDefinition && isJumpURL(definitionURLOrError)) {
                    switch (container.values.clickedGoToDefinition) {
                        case 'same-tab':
                            pushHistory(definitionURLOrError.jumpURL)
                            break
                        case 'new-tab':
                            window.open(definitionURLOrError.jumpURL, '_blank')
                            break
                    }
                }
            })
    )

    // DEFERRED HOVER OVERLAY PINNING
    // If the new position came from a click or the URL,
    // if either the hover or the definition turn out non-empty, pin the tooltip.
    // If they both turn out empty, unpin it so we don't end up with an invisible tooltip.
    //
    // zip together a position and the hover and definition fetches it triggered
    subscription.add(
        zip(resolvedPositions, hoverObservables, definitionObservables)
            .pipe(
                switchMap(([{ eventType }, hoverObservable, definitionObservable]) => {
                    // If the position was triggered by a mouseover, never pin
                    if (eventType !== 'click' && eventType !== 'jump') {
                        return [false]
                    }
                    // combine the latest values for them, so we have access to both values
                    // and can reevaluate our pinning decision whenever one of the two updates,
                    // independent of the order in which they emit
                    return combineLatest(hoverObservable, definitionObservable).pipe(
                        map(([{ hoverOrError }, definitionURLOrError]) =>
                            overlayUIHasContent({ hoverOrError, definitionURLOrError })
                        )
                    )
                })
            )
            .subscribe(hoverOverlayIsFixed => {
                container.update({ hoverOverlayIsFixed })
            })
    )

    // On every click on a go to definition button, reveal loader/error/not found UI
    subscription.add(
        goToDefinitionClicks.subscribe(event => {
            // Telemetry
            logTelemetryEvent('GoToDefClicked')

            // If we don't have a result yet that would be jumped to by the native <a> tag...
            if (!isJumpURL(container.values.definitionURLOrError)) {
                // Prevent default link behaviour (jump will be done programmatically once finished)
                event.preventDefault()
            }
        })
    )

    // When the close button is clicked, unpin, hide and reset the hover
    subscription.add(
        merge(
            closeButtonClicks,
            fromEvent<KeyboardEvent>(window, 'keydown').pipe(filter(event => event.key === Key.Escape))
        ).subscribe(event => {
            event.preventDefault()
            container.update({
                hoverOverlayIsFixed: false,
                hoverOverlayPosition: undefined,
                hoverOrError: undefined,
                hoveredToken: undefined,
                definitionURLOrError: undefined,
                clickedGoToDefinition: false,
            })
        })
    )

    // LOCATION CHANGES
    subscription.add(
        allPositionJumps.subscribe(({ position, scrollElement, codeElement }) => {
            container.update({
                // Remember active position in state for blame and range expansion
                selectedPosition: position,
            })
            const rows = getCodeElementsInRange(codeElement, { position, ...dom })
            for (const { element } of rows) {
                convertNode(element)
            }
            // Scroll into view
            if (rows.length > 0) {
                scrollIntoCenterIfNeeded(scrollElement, codeElement, rows[0].element)
            }
        })
    )
    subscription.add(
        resolvedPositions.subscribe(({ position }) => {
            container.update({
                hoveredToken: position,
                // On every new target (from mouseover or click) hide the j2d loader/error/not found UI again
                clickedGoToDefinition: false,
            })
        })
    )
    subscription.add(
        goToDefinitionClicks.subscribe(event => {
            container.update({ clickedGoToDefinition: event.ctrlKey || event.metaKey ? 'new-tab' : 'same-tab' })
        })
    )

    return {
        get hoverState(): Readonly<HoverState> {
            return internalToExternalState(container.values)
        },
        hoverStateUpdates: container.updates.pipe(
            map(internalToExternalState),
            distinctUntilChanged((a, b) => isEqual(a, b))
        ),
        hoverify({ positionEvents, positionJumps, resolveContext }: HoverifyOptions): Subscription {
            const subscription = new Subscription()
            const eventWithContextResolver = map((event: PositionEvent) => ({
                ...event,
                resolveContext,
            }))
            // Broadcast all events from this code view
            subscription.add(positionEvents.pipe(eventWithContextResolver).subscribe(allPositionsFromEvents))
            subscription.add(positionJumps.pipe(map(jump => ({ ...jump, resolveContext }))).subscribe(allPositionJumps))
            return subscription
        },
        unsubscribe(): void {
            subscription.unsubscribe()
        },
    }
}
