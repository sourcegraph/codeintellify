import { Position, Range } from '@sourcegraph/extension-api-types'
import { isEqual } from 'lodash'
import {
    combineLatest,
    concat,
    EMPTY,
    from,
    fromEvent,
    merge,
    Observable,
    of,
    Subject,
    Subscribable,
    SubscribableOrPromise,
    Subscription,
    zip,
} from 'rxjs'
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
import { asError, ErrorLike, isErrorLike } from './errors'
import { scrollIntoCenterIfNeeded } from './helpers'
import { calculateOverlayPosition } from './overlay_position'
import { DiffPart, PositionEvent, SupportedMouseEvent } from './positions'
import { createObservableStateContainer } from './state'
import {
    convertNode,
    DOMFunctions,
    findElementWithOffset,
    getCodeElementsInRange,
    getTokenAtPosition,
    HoveredToken,
} from './token_position'
import { HoverAttachment, HoverOverlayProps, isPosition, LineOrPositionOrRange, LOADING } from './types'

export { HoveredToken }

/**
 * @template C Extra context for the hovered token.
 * @template D The type of the hover content data.
 * @template A The type of an action.
 */
export interface HoverifierOptions<C extends object, D, A> {
    /**
     * Emit the HoverOverlay element on this after it was rerendered when its content changed and it needs to be repositioned.
     */
    hoverOverlayRerenders: Subscribable<{
        /**
         * The HoverOverlay element
         */
        hoverOverlayElement: HTMLElement

        /**
         * The closest parent element that is `position: relative`
         */
        relativeElement: HTMLElement
    }>

    /**
     * Emit on this Observable when the close button in the HoverOverlay was clicked
     */
    closeButtonClicks: Subscribable<MouseEvent>

    hoverOverlayElements: Subscribable<HTMLElement | null>

    /**
     * Called to get the data to display in the hover.
     */
    getHover: HoverProvider<C, D>

    /**
     * Called to get the actions to display in the hover.
     */
    getActions: ActionsProvider<C, A>

    /**
     * Whether or not hover tooltips can be pinned.
     */
    pinningEnabled: boolean

    /**
     * Whether or not code views need to be tokenized. Defaults to true.
     */
    tokenize?: boolean
}

/**
 * A Hoverifier is a function that hoverifies one code view element in the DOM.
 * It will do very dirty things to it. Only call it if you're into that.
 *
 * There can be multiple code views in the DOM, which will only show a single HoverOverlay if the same Hoverifier was used.
 *
 * @template C Extra context for the hovered token.
 * @template D The type of the hover content data.
 * @template A The type of an action.
 */
export interface Hoverifier<C extends object, D, A> {
    /**
     * The current Hover state. You can use this to read the initial state synchronously.
     */
    hoverState: Readonly<HoverState<C, D, A>>
    /**
     * This Observable is to notify that the state that is used to render the HoverOverlay needs to be updated.
     */
    hoverStateUpdates: Observable<Readonly<HoverState<C, D, A>>>

    /**
     * Hoverifies a code view.
     */
    hoverify(options: HoverifyOptions<C>): Subscription

    unsubscribe(): void
}

export interface PositionJump {
    /**
     * The position within the code view to jump to
     */
    position: LineOrPositionOrRange & { part?: DiffPart }
    /**
     * The code view
     */
    codeView: HTMLElement
    /**
     * The element to scroll if the position is out of view
     */
    scrollElement: HTMLElement
}

/**
 * The possible directions to adjust a position in.
 */
export enum AdjustmentDirection {
    /** Adjusting the position from what is found on the page to what it would be in the actual file. */
    CodeViewToActual,
    /** Adjusting the position from what is in the actual file to what would be found on the page. */
    ActualToCodeView,
}

/**
 * @template C Extra context for the hovered token.
 */
export interface AdjustPositionProps<C extends object> {
    /** The code view the token is in. */
    codeView: HTMLElement
    /** The position the token is at. */
    position: HoveredToken & C
    /** The direction the adjustment should go. */
    direction: AdjustmentDirection
}

/**
 * Function to adjust positions coming into and out of hoverifier. It can be used to correct the position used in HoverProvider and
 * ActionsProvider requests and the position of the token to highlight in the code view. This is useful for code hosts that convert whitespace.
 *
 *
 * @template C Extra context for the hovered token.
 */
export type PositionAdjuster<C extends object> = (props: AdjustPositionProps<C>) => SubscribableOrPromise<Position>

/**
 * HoverifyOptions that need to be included internally with every event
 *
 * @template C Extra context for the hovered token.
 */
export interface EventOptions<C extends object> {
    resolveContext: ContextResolver<C>
    adjustPosition?: PositionAdjuster<C>
    dom: DOMFunctions
    codeViewId: symbol
}

/**
 * @template C Extra context for the hovered token.
 */
export interface HoverifyOptions<C extends object>
    extends Pick<EventOptions<C>, Exclude<keyof EventOptions<C>, 'codeViewId'>> {
    positionEvents: Subscribable<PositionEvent>

    /**
     * Emit on this Observable to trigger the overlay on a position in this code view.
     * This Observable is intended to be used to trigger a Hover after a URL change with a position.
     */
    positionJumps?: Subscribable<PositionJump>
}

/**
 * Output that contains the information needed to render the HoverOverlay.
 *
 * @template C Extra context for the hovered token.
 *  * @template D The type of the hover content data.
 * @template A The type of an action.
 */
export interface HoverState<C extends object, D, A> {
    /**
     * The currently hovered and highlighted HTML element.
     */
    hoveredTokenElement?: HTMLElement

    /**
     * Actions for the current token.
     */
    actionsOrError?: typeof LOADING | A[] | null | ErrorLike

    /**
     * The props to pass to `HoverOverlay`, or `undefined` if it should not be rendered.
     */
    hoverOverlayProps?: Pick<HoverOverlayProps<C, D, A>, Exclude<keyof HoverOverlayProps<C, D, A>, 'actionComponent'>>

    /**
     * The highlighted range, which is the range in the hover result or else the range of the hovered token.
     */
    highlightedRange?: Range

    /**
     * The currently selected position, if any.
     * Can be a single line number or a line range.
     * Highlighted with a background color.
     */
    selectedPosition?: LineOrPositionOrRange
}

/**
 * @template C Extra context for the hovered token.
 * @template D The type of the hover content data.
 * @template A The type of an action.
 */
interface InternalHoverifierState<C extends object, D, A> {
    hoverOrError?: typeof LOADING | (HoverAttachment & D) | null | ErrorLike

    hoverOverlayIsFixed: boolean

    /** The desired position of the hover overlay */
    hoverOverlayPosition?: { left: number; top: number }

    /** The currently hovered token */
    hoveredToken?: HoveredToken & C

    /** The currently hovered token HTML element */
    hoveredTokenElement?: HTMLElement

    /**
     * The highlighted range, which is the range in the hoverOrError data or else the range of the hovered token.
     */
    highlightedRange?: Range

    mouseIsMoving: boolean

    /**
     * The currently selected position, if any.
     * Can be a single line number or a line range.
     * Highlighted with a background color.
     */
    selectedPosition?: LineOrPositionOrRange

    /**
     * Actions to display as buttons or links in the hover.
     */
    actionsOrError?: typeof LOADING | A[] | null | ErrorLike

    /**
     * A value that identifies the code view that triggered the current hover overlay.
     */
    codeViewId?: symbol
}

/**
 * Returns true if the HoverOverlay component should be rendered according to the given state.
 *
 * The primary purpose of this is to reduce UI jitter by not showing the overlay when there is nothing to show
 * (because there is no content, or because it is still loading).
 */
const shouldRenderOverlay = (state: InternalHoverifierState<{}, {}, {}>): boolean =>
    !(!state.hoverOverlayIsFixed && state.mouseIsMoving) &&
    ((!!state.hoverOrError && state.hoverOrError !== LOADING) ||
        (!!state.actionsOrError &&
            state.actionsOrError !== LOADING &&
            (isErrorLike(state.actionsOrError) || state.actionsOrError.length > 0)))

/**
 * Maps internal HoverifierState to the publicly exposed HoverState
 *
 * @template C Extra context for the hovered token.
 * @template D The type of the hover content data.
 * @template A The type of an action.
 */
const internalToExternalState = <C extends object, D, A>(
    internalState: InternalHoverifierState<C, D, A>
): HoverState<C, D, A> => ({
    hoveredTokenElement: internalState.hoveredTokenElement,
    actionsOrError: internalState.actionsOrError,
    selectedPosition: internalState.selectedPosition,
    highlightedRange: shouldRenderOverlay(internalState) ? internalState.highlightedRange : undefined,
    hoverOverlayProps: shouldRenderOverlay(internalState)
        ? {
              overlayPosition: internalState.hoverOverlayPosition,
              hoverOrError: internalState.hoverOrError,
              hoveredToken: internalState.hoveredToken,
              showCloseButton: internalState.hoverOverlayIsFixed,
              actionsOrError: internalState.actionsOrError,
          }
        : undefined,
})

/** The time in ms after which to show a loader if the result has not returned yet */
export const LOADER_DELAY = 1200

/** The time in ms after the mouse has stopped moving in which to show the tooltip */
export const TOOLTIP_DISPLAY_DELAY = 100

/** The time in ms to debounce mouseover events. */
export const MOUSEOVER_DELAY = 50

/**
 * @template C Extra context for the hovered token.
 * @template D The type of the hover content data.
 */
export type HoverProvider<C extends object, D> = (
    position: HoveredToken & C
) => SubscribableOrPromise<(HoverAttachment & D) | null>

/**
 * @template C Extra context for the hovered token.
 * @template A The type of an action.
 */
export type ActionsProvider<C extends object, A> = (position: HoveredToken & C) => SubscribableOrPromise<A[] | null>

/**
 * Function responsible for resolving the position of a hovered token
 * and its diff part to a full context including repository, commit ID and file path.
 *
 * @template C Extra context for the hovered token.
 */
export type ContextResolver<C extends object> = (hoveredToken: HoveredToken) => C

/**
 * @template C Extra context for the hovered token.
 * @template D The type of the hover content data.
 * @template A The type of an action.
 */
export function createHoverifier<C extends object, D, A>({
    closeButtonClicks,
    hoverOverlayRerenders,
    getHover,
    getActions,
    pinningEnabled,
    tokenize = true,
}: HoverifierOptions<C, D, A>): Hoverifier<C, D, A> {
    // Internal state that is not exposed to the caller
    // Shared between all hoverified code views
    const container = createObservableStateContainer<InternalHoverifierState<C, D, A>>({
        hoveredTokenElement: undefined,
        hoverOverlayIsFixed: false,
        hoveredToken: undefined,
        hoverOrError: undefined,
        hoverOverlayPosition: undefined,
        mouseIsMoving: false,
        selectedPosition: undefined,
        actionsOrError: undefined,
    })

    interface MouseEventTrigger extends PositionEvent, EventOptions<C> {}

    // These Subjects aggregate all events from all hoverified code views
    const allPositionsFromEvents = new Subject<MouseEventTrigger>()

    const isEventType = <T extends SupportedMouseEvent>(type: T) => (
        event: MouseEventTrigger
    ): event is MouseEventTrigger & { eventType: T } => event.eventType === type
    const allCodeMouseMoves = allPositionsFromEvents.pipe(filter(isEventType('mousemove')))
    const allCodeMouseOvers = allPositionsFromEvents.pipe(filter(isEventType('mouseover')))
    const allCodeClicks = allPositionsFromEvents.pipe(filter(isEventType('click')))

    const allPositionJumps = new Subject<PositionJump & EventOptions<C>>()

    /**
     * Whenever a Subscription returned by `hoverify()` is unsubscribed,
     * emits the code view ID associated with it.
     */
    const allUnhoverifies = new Subject<symbol>()

    const subscription = new Subscription()

    /**
     * click events on the code element, ignoring click events caused by the user selecting text.
     * Selecting text should not mess with the hover, hover pinning nor the URL.
     */
    const codeClicksWithoutSelections = allCodeClicks.pipe(
        filter(() => {
            const selection = window.getSelection()
            return selection === null || selection.toString() === ''
        })
    )

    // Mouse is moving, don't show the tooltip
    subscription.add(
        merge(
            allCodeMouseMoves.pipe(
                map(({ event }) => event.target),
                // Make sure a move of the mouse from the action button
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
        debounceTime(MOUSEOVER_DELAY),
        // Do not consider mouseovers while overlay is pinned
        filter(() => !container.values.hoverOverlayIsFixed),
        switchMap(({ adjustPosition, codeView, resolveContext, position, ...rest }) =>
            adjustPosition && position
                ? from(
                      adjustPosition({
                          codeView,
                          position: { ...position, ...resolveContext(position) },
                          direction: AdjustmentDirection.CodeViewToActual,
                      })
                  ).pipe(
                      map(({ line, character }) => ({
                          codeView,
                          resolveContext,
                          position: { ...position, line, character },
                          adjustPosition,
                          ...rest,
                      }))
                  )
                : of({ adjustPosition, codeView, resolveContext, position, ...rest })
        ),
        share()
    )

    const codeClickTargets = codeClicksWithoutSelections.pipe(
        filter(({ event }) => event.currentTarget !== null),
        map(({ event, ...rest }) => ({
            target: event.target as HTMLElement,
            ...rest,
        })),
        switchMap(({ adjustPosition, codeView, resolveContext, position, ...rest }) =>
            adjustPosition && position
                ? from(
                      adjustPosition({
                          codeView,
                          position: { ...position, ...resolveContext(position) },
                          direction: AdjustmentDirection.CodeViewToActual,
                      })
                  ).pipe(
                      map(({ line, character }) => ({
                          codeView,
                          resolveContext,
                          position: { ...position, line, character },
                          adjustPosition,
                          ...rest,
                      }))
                  )
                : of({ adjustPosition, codeView, resolveContext, position, ...rest })
        ),
        share()
    )

    /**
     * Emits DOM elements at new positions found in the URL. When pinning is
     * disabled, this does not emit at all because the tooltip doesn't get
     * pinned at the jump target.
     */
    const jumpTargets = pinningEnabled
        ? allPositionJumps.pipe(
              // Only use line and character for comparison
              map(({ position: { line, character, part }, ...rest }) => ({
                  position: { line, character, part },
                  ...rest,
              })),
              // Ignore same values
              // It's important to do this before filtering otherwise navigating from
              // a position, to a line-only position, back to the first position would get ignored
              distinctUntilChanged((a, b) => isEqual(a, b)),
              map(({ position, codeView, dom, ...rest }) => {
                  let cell: HTMLElement | null
                  let target: HTMLElement | undefined
                  let part: DiffPart | undefined
                  if (isPosition(position)) {
                      cell = dom.getCodeElementFromLineNumber(codeView, position.line, position.part)
                      if (cell) {
                          target = findElementWithOffset(cell, position.character, tokenize)
                          if (target) {
                              part = dom.getDiffCodePart && dom.getDiffCodePart(target)
                          } else {
                              console.warn('Could not find target for position in file', position)
                          }
                      }
                  }
                  return {
                      ...rest,
                      eventType: 'jump' as 'jump',
                      target,
                      position: { ...position, part },
                      codeView,
                      dom,
                  }
              })
          )
        : EMPTY

    // REPOSITIONING
    // On every componentDidUpdate (after the component was rerendered, e.g. from a hover state update) resposition
    // the tooltip
    // It's important to add this subscription first so that withLatestFrom will be guaranteed to have gotten the
    // latest hover target by the time componentDidUpdate is triggered from the setState() in the second chain
    subscription.add(
        // Take every rerender
        from(hoverOverlayRerenders)
            .pipe(
                // with the latest target that came from either a mouseover, click or location change (whatever was the most recent)
                withLatestFrom(merge(codeMouseOverTargets, codeClickTargets, jumpTargets)),
                map(
                    ([
                        { hoverOverlayElement, relativeElement },
                        { target, position, codeView, dom, adjustPosition, resolveContext },
                    ]) => ({
                        hoverOverlayElement,
                        relativeElement,
                        target,
                        position,
                        codeView,
                        dom,
                        adjustPosition,
                        resolveContext,
                    })
                ),
                switchMap(({ position, codeView, adjustPosition, resolveContext, ...rest }) => {
                    if (!position || !isPosition(position) || !adjustPosition) {
                        return of({ position, codeView, ...rest })
                    }

                    return from(
                        adjustPosition({
                            position: { ...position, ...resolveContext(position) },
                            codeView,
                            direction: AdjustmentDirection.ActualToCodeView,
                        })
                    ).pipe(
                        map(({ line, character }) => ({
                            position: { ...position, line, character },
                            codeView,
                            ...rest,
                        }))
                    )
                }),
                map(({ target, position, codeView, dom, ...rest }) => ({
                    // We should ensure we have the correct dom element to place the overlay above. It is possible
                    // that tokens span multiple elements meaning that it's possible for the hover overlay to be
                    // placed in the middle of a token.
                    target:
                        position && isPosition(position)
                            ? getTokenAtPosition(codeView, position, dom, position.part, tokenize)
                            : target,
                    ...rest,
                })),
                map(({ hoverOverlayElement, relativeElement, target }) =>
                    target ? calculateOverlayPosition({ relativeElement, target, hoverOverlayElement }) : undefined
                )
            )
            .subscribe(hoverOverlayPosition => {
                container.update({ hoverOverlayPosition })
            })
    )

    /** Emits new positions including context at which a tooltip needs to be shown from clicks, mouseovers and URL changes. */
    const resolvedPositionEvents = merge(codeMouseOverTargets, jumpTargets, codeClickTargets).pipe(
        map(({ position, resolveContext, eventType, ...rest }) => ({
            ...rest,
            eventType,
            position: isPosition(position) ? { ...position, ...resolveContext(position) } : undefined,
        })),
        share()
    )

    const resolvedPositions = resolvedPositionEvents.pipe(
        // Suppress emissions from other events that refer to the same position as the current one. This makes it
        // so the overlay doesn't temporarily disappear when, e.g., clicking to pin the overlay when it's already
        // visible due to a mouseover.
        distinctUntilChanged((a, b) => isEqual(a.position, b.position))
    )

    /**
     * For every position, emits an Observable with new values for the `hoverOrError` state.
     * This is a higher-order Observable (Observable that emits Observables).
     */
    const hoverObservables: Observable<
        Observable<{
            eventType: SupportedMouseEvent | 'jump'
            dom: DOMFunctions
            target: HTMLElement
            adjustPosition?: PositionAdjuster<C>
            codeView: HTMLElement
            codeViewId: symbol
            hoverOrError?: typeof LOADING | (HoverAttachment & D) | ErrorLike | null
            position?: HoveredToken & C
            part?: DiffPart
        }>
    > = resolvedPositions.pipe(
        map(({ position, codeViewId, ...rest }) => {
            if (!position) {
                return of({ hoverOrError: null, position: undefined, part: undefined, codeViewId, ...rest })
            }
            // Get the hover for that position
            const hover = from(getHover(position)).pipe(
                catchError((error): [ErrorLike] => [asError(error)]),
                share()
            )
            // 1. Reset the hover content, so no old hover content is displayed at the new position while getting
            // 2. Show a loader if the hover hasn't returned after 100ms
            // 3. Show the hover once it returned
            return merge(
                [undefined],
                of(LOADING).pipe(
                    delay(LOADER_DELAY),
                    takeUntil(hover)
                ),
                hover
            ).pipe(
                map(hoverOrError => ({
                    ...rest,
                    codeViewId,
                    position,
                    hoverOrError,
                    part: position.part,
                })),
                // Do not emit anything after the code view this action came from got unhoverified
                takeUntil(allUnhoverifies.pipe(filter(unhoverifiedCodeViewId => unhoverifiedCodeViewId === codeViewId)))
            )
        }),
        share()
    )
    // Highlight the hover range returned by the language server
    subscription.add(
        hoverObservables
            .pipe(
                switchMap(hoverObservable => hoverObservable),
                switchMap(({ hoverOrError, position, adjustPosition, ...rest }) => {
                    let pos =
                        hoverOrError &&
                        hoverOrError !== LOADING &&
                        !isErrorLike(hoverOrError) &&
                        hoverOrError.range &&
                        position
                            ? { ...hoverOrError.range.start, ...position }
                            : position

                    if (!pos) {
                        return of({ hoverOrError, position: undefined as Position | undefined, ...rest })
                    }

                    // The requested position is is 0-indexed; the code here is currently 1-indexed
                    const { line, character } = pos
                    pos = { line: line + 1, character: character + 1, ...pos }

                    const adjustingPosition = adjustPosition
                        ? from(
                              adjustPosition({
                                  codeView: rest.codeView,
                                  direction: AdjustmentDirection.ActualToCodeView,
                                  position: {
                                      ...pos,
                                      part: rest.part,
                                  },
                              })
                          )
                        : of(pos)

                    return adjustingPosition.pipe(map(position => ({ position, hoverOrError, ...rest })))
                })
            )
            .subscribe(({ hoverOrError, position, codeView, codeViewId, dom, part }) => {
                // Update the highlighted token if the hover result is successful. If the hover result specifies a
                // range, use that; otherwise use the hover position (which will be expanded into a full token in
                // getTokenAtPosition).
                let highlightedRange: Range | undefined
                if (hoverOrError && !isErrorLike(hoverOrError) && hoverOrError !== LOADING) {
                    if (hoverOrError.range) {
                        // The result is 0-indexed; the code view is treated as 1-indexed.
                        highlightedRange = {
                            start: {
                                line: hoverOrError.range.start.line + 1,
                                character: hoverOrError.range.start.character + 1,
                            },
                            end: {
                                line: hoverOrError.range.end.line + 1,
                                character: hoverOrError.range.end.character + 1,
                            },
                        }
                    } else if (position) {
                        highlightedRange = { start: position, end: position }
                    }
                }

                container.update({
                    codeViewId,
                    hoverOrError,
                    highlightedRange,
                    // Reset the hover position, it's gonna be repositioned after the hover was rendered
                    hoverOverlayPosition: undefined,
                })

                // Ensure the previously highlighted range is not highlighted and the new highlightedRange (if any)
                // is highlighted.
                const currentHighlighted = codeView.querySelector('.selection-highlight')
                if (currentHighlighted) {
                    currentHighlighted.classList.remove('selection-highlight')
                }
                if (!highlightedRange) {
                    container.update({ hoveredTokenElement: undefined })
                    return
                }
                const token = getTokenAtPosition(codeView, highlightedRange.start, dom, part, tokenize)
                container.update({ hoveredTokenElement: token })
                if (!token) {
                    return
                }
                token.classList.add('selection-highlight')
            })
    )

    /**
     * For every position, emits an Observable that emits new values for the `actionsOrError` state.
     * This is a higher-order Observable (Observable that emits Observables).
     */
    const actionObservables = resolvedPositions.pipe(
        // Get the actions for that position
        map(({ position, codeViewId }) => {
            if (!position) {
                return of(null)
            }
            return concat(
                [LOADING],
                from(getActions(position)).pipe(catchError((error): [ErrorLike] => [asError(error)]))
            ).pipe(
                // Do not emit anything after the code view this action came from got unhoverified
                takeUntil(allUnhoverifies.pipe(filter(unhoverifiedCodeViewId => unhoverifiedCodeViewId === codeViewId)))
            )
        }),
        share()
    )

    // ACTIONS
    // On every new hover position, (pre)fetch actions and update the state
    subscription.add(
        actionObservables
            // flatten inner Observables
            .pipe(switchMap(actionObservable => actionObservable))
            .subscribe(actionsOrError => {
                container.update({ actionsOrError })
            })
    )

    if (pinningEnabled) {
        // DEFERRED HOVER OVERLAY PINNING
        // If the new position came from a click or the URL,
        // if either the hover or the definition turn out non-empty, pin the tooltip.
        // If they both turn out empty, unpin it so we don't end up with an invisible tooltip.
        //
        // zip together the corresponding hover and definition
        subscription.add(
            combineLatest(
                zip(hoverObservables, actionObservables),
                resolvedPositionEvents.pipe(map(({ eventType }) => eventType))
            )
                .pipe(
                    switchMap(([[hoverObservable, actionObservable], eventType]) => {
                        // If the position was triggered by a mouseover, never pin
                        if (eventType !== 'click' && eventType !== 'jump') {
                            return [false]
                        }
                        // combine the latest values for them, so we have access to both values
                        // and can reevaluate our pinning decision whenever one of the two updates,
                        // independent of the order in which they emit
                        return combineLatest(hoverObservable, actionObservable).pipe(
                            map(([{ hoverOrError }, actionsOrError]) =>
                                // In the time between the click/jump and the loader being displayed,
                                // pin the hover overlay so mouseover events get ignored
                                // If the hover comes back empty (and the definition) it will get unpinned again
                                Boolean(
                                    hoverOrError === undefined ||
                                        (actionsOrError &&
                                            !(Array.isArray(actionsOrError) && actionsOrError.length === 0) &&
                                            !isErrorLike(actionsOrError))
                                )
                            )
                        )
                    })
                )
                .subscribe(hoverOverlayIsFixed => {
                    container.update({ hoverOverlayIsFixed })
                })
        )
    }

    const resetHover = () => {
        container.update({
            hoverOverlayIsFixed: false,
            hoverOverlayPosition: undefined,
            hoverOrError: undefined,
            hoveredToken: undefined,
            actionsOrError: undefined,
        })
    }

    // When the close button is clicked, unpin, hide and reset the hover
    subscription.add(
        merge(
            closeButtonClicks,
            fromEvent<KeyboardEvent>(window, 'keydown').pipe(filter(event => event.key === Key.Escape))
        ).subscribe(event => {
            event.preventDefault()
            resetHover()
        })
    )

    // LOCATION CHANGES
    subscription.add(
        allPositionJumps.subscribe(({ position, scrollElement, codeView, dom: { getCodeElementFromLineNumber } }) => {
            container.update({
                // Remember active position in state for blame and range expansion
                selectedPosition: position,
            })
            const codeElements = getCodeElementsInRange({ codeView, position, getCodeElementFromLineNumber })
            if (tokenize) {
                for (const { element } of codeElements) {
                    convertNode(element)
                }
            }
            // Scroll into view
            if (codeElements.length > 0) {
                scrollIntoCenterIfNeeded(scrollElement, codeView, codeElements[0].element)
            }
        })
    )
    subscription.add(
        resolvedPositions.subscribe(({ position }) => {
            container.update({
                hoveredToken: position,
            })
        })
    )

    return {
        get hoverState(): Readonly<HoverState<C, D, A>> {
            return internalToExternalState(container.values)
        },
        hoverStateUpdates: container.updates.pipe(
            map(internalToExternalState),
            distinctUntilChanged((a, b) => isEqual(a, b))
        ),
        hoverify({ positionEvents, positionJumps = EMPTY, ...eventOptions }: HoverifyOptions<C>): Subscription {
            const codeViewId = Symbol('CodeView')
            const subscription = new Subscription()
            // Broadcast all events from this code view
            subscription.add(
                from(positionEvents)
                    .pipe(map(event => ({ ...event, ...eventOptions, codeViewId })))
                    .subscribe(allPositionsFromEvents)
            )
            subscription.add(
                from(positionJumps)
                    .pipe(map(jump => ({ ...jump, ...eventOptions, codeViewId })))
                    .subscribe(allPositionJumps)
            )
            subscription.add(() => {
                // Make sure hover is hidden and associated subscriptions unsubscribed
                allUnhoverifies.next(codeViewId)
                if (container.values.codeViewId === codeViewId) {
                    resetHover()
                }
            })
            return subscription
        },
        unsubscribe(): void {
            subscription.unsubscribe()
        },
    }
}
