import { Position, Range } from '@sourcegraph/extension-api-types'
import { isEqual } from 'lodash'
import {
    animationFrameScheduler,
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
    distinctUntilChanged,
    filter,
    first,
    map,
    mapTo,
    observeOn,
    share,
    switchMap,
    takeUntil,
    withLatestFrom,
    mergeMap,
} from 'rxjs/operators'
import { Key } from 'ts-key-enum'
import { asError, ErrorLike, isErrorLike } from './errors'
import { elementOverlaps, scrollIntoCenterIfNeeded, toMaybeLoadingProviderResult } from './helpers'
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
import { HoverAttachment, HoverOverlayProps, isPosition, LineOrPositionOrRange, DocumentHighlight } from './types'
import { emitLoading, MaybeLoadingResult, LOADING } from './loading'

export { HoveredToken }

const defaultSelectionHighlightClassName = 'selection-highlight'
const defaultDocumentHighlightClassName = 'sourcegraph-document-highlight'

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
     * Called to get the set of ranges to highlight within the document.
     */
    getDocumentHighlights: DocumentHighlightProvider<C>

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

    /**
     * The class name to apply to hovered tokens.
     */
    selectionHighlightClassName?: string

    /**
     * The class name to apply to document highlight tokens.
     */
    documentHighlightClassName?: string
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

    /**
     * An array of elements used to hide the hover overlay if any of them
     * overlap with the hovered token. Overlapping is checked in reaction to scroll events.
     *
     * scrollBoundaries are typically elements with a lower z-index than the hover overlay
     * but a higher z-index than the code view, such as a sticky file header.
     */
    scrollBoundaries?: HTMLElement[]
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
 * @template D The type of the hover content data.
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
export const LOADER_DELAY = 600

/** The time in ms after the mouse has stopped moving in which to show the tooltip */
export const TOOLTIP_DISPLAY_DELAY = 100

/** The time in ms to debounce mouseover events. */
export const MOUSEOVER_DELAY = 50

/**
 * Function that returns a Subscribable or PromiseLike of the hover result to be shown.
 * If a Subscribable is returned, it may emit more than once to update the content,
 * and must indicate when it starts and stopped loading new content.
 * It should emit a `null` result if the token has no hover content (e.g. whitespace, punctuation).
 *
 * @template C Extra context for the hovered token.
 * @template D The type of the hover content data.
 */
export type HoverProvider<C extends object, D> = (
    position: HoveredToken & C
) => Subscribable<MaybeLoadingResult<(HoverAttachment & D) | null>> | PromiseLike<(HoverAttachment & D) | null>

/**
 * Function that returns a Subscribable or PromiseLike of the ranges to be highlighted in the document.
 * If a Subscribable is returned, it may emit more than once to update the content, and must indicate when
 * it starts and stopped loading new content. It should emit a `null` result if the token has no highlights.
 *
 * @template C Extra context for the hovered token.
 */
export type DocumentHighlightProvider<C extends object> = (
    position: HoveredToken & C
) => Subscribable<DocumentHighlight[]> | PromiseLike<DocumentHighlight[]>

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
    getDocumentHighlights,
    getActions,
    pinningEnabled,
    tokenize = true,
    selectionHighlightClassName = defaultSelectionHighlightClassName,
    documentHighlightClassName = defaultDocumentHighlightClassName,
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
                      eventType: 'jump' as const,
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
     * An Observable of scroll events on the document.
     */
    const scrollEvents = fromEvent(document, 'scroll').pipe(observeOn(animationFrameScheduler), share())

    /**
     * Returns the highlighted range for the given hover result and position.
     *
     * Returns `undefined` if the hover result is not successful.
     *
     * Uses the range specified by the hover result if present, or `position` oherwise,
     * which will be expanded into a full token in getTokenAtPosition().
     */
    const getHighlightedRange = ({
        hoverOrError,
        position,
    }: {
        hoverOrError?: typeof LOADING | (HoverAttachment & D) | ErrorLike | null
        position: Position | undefined
    }): Range | undefined => {
        if (hoverOrError && !isErrorLike(hoverOrError) && hoverOrError !== LOADING) {
            if (hoverOrError.range) {
                // The result is 0-indexed; the code view is treated as 1-indexed.
                return {
                    start: {
                        line: hoverOrError.range.start.line + 1,
                        character: hoverOrError.range.start.character + 1,
                    },
                    end: {
                        line: hoverOrError.range.end.line + 1,
                        character: hoverOrError.range.end.character + 1,
                    },
                }
            }
            if (position) {
                return { start: position, end: position }
            }
        }
        return undefined
    }

    /**
     * Returns an Observable that emits the hover result immediately,
     * and will emit a result resetting the hover when the hoveredTokenElement intersects
     * with the scrollBoundaries.
     */
    const resetOnBoundaryIntersection = ({
        hoveredTokenElement,
        scrollBoundaries,
        ...rest
    }: Omit<InternalHoverifierState<C, D, A>, 'mouseIsMoving' | 'hoverOverlayIsFixed'> &
        Omit<EventOptions<C>, 'resolveContext' | 'dom'> & { codeView: HTMLElement }): Observable<
        Omit<InternalHoverifierState<C, D, A>, 'mouseIsMoving' | 'hoverOverlayIsFixed'> & { codeView: HTMLElement }
    > => {
        const result = of({ hoveredTokenElement, ...rest })
        if (!hoveredTokenElement || !scrollBoundaries) {
            return result
        }
        return merge(
            result,
            scrollEvents.pipe(
                filter(() => scrollBoundaries.some(elementOverlaps(hoveredTokenElement))),
                first(),
                mapTo({
                    ...rest,
                    hoveredTokenElement,
                    hoverOverlayIsFixed: false,
                    hoverOrError: undefined,
                    hoveredToken: undefined,
                    actionsOrError: undefined,
                })
            )
        )
    }

    /**
     * For every position, emits an Observable with new values for the `hoverOrError` state.
     * This is a higher-order Observable (Observable that emits Observables).
     */
    const hoverObservables: Observable<Observable<{
        eventType: SupportedMouseEvent | 'jump'
        dom: DOMFunctions
        target: HTMLElement
        adjustPosition?: PositionAdjuster<C>
        codeView: HTMLElement
        codeViewId: symbol
        scrollBoundaries?: HTMLElement[]
        hoverOrError?: typeof LOADING | (HoverAttachment & D) | ErrorLike | null
        position?: HoveredToken & C
        part?: DiffPart
    }>> = resolvedPositions.pipe(
        map(({ position, codeViewId, ...rest }) => {
            if (!position) {
                return of({ hoverOrError: null, position: undefined, part: undefined, codeViewId, ...rest })
            }
            // Get the hover for that position
            return toMaybeLoadingProviderResult(getHover(position)).pipe(
                catchError((error): [MaybeLoadingResult<ErrorLike>] => [{ isLoading: false, result: asError(error) }]),
                emitLoading<(HoverAttachment & D) | ErrorLike, null>(LOADER_DELAY, null),
                map(hoverOrError => ({ ...rest, codeViewId, position, hoverOrError, part: position.part })),
                // Do not emit anything after the code view this action came from got unhoverified
                takeUntil(allUnhoverifies.pipe(filter(unhoverifiedCodeViewId => unhoverifiedCodeViewId === codeViewId)))
            )
        }),
        share()
    )
    // Highlight the hover range returned by the hover provider
    subscription.add(
        hoverObservables
            .pipe(
                switchMap(hoverObservable => hoverObservable),
                switchMap(({ hoverOrError, position, adjustPosition, codeView, part, ...rest }) => {
                    let pos =
                        hoverOrError &&
                        hoverOrError !== LOADING &&
                        !isErrorLike(hoverOrError) &&
                        hoverOrError.range &&
                        position
                            ? { ...hoverOrError.range.start, ...position }
                            : position

                    if (!pos) {
                        return of({
                            hoverOrError,
                            codeView,
                            part,
                            position: undefined as Position | undefined,
                            ...rest,
                        })
                    }

                    // The requested position is is 0-indexed; the code here is currently 1-indexed
                    const { line, character } = pos
                    pos = { line: line + 1, character: character + 1, ...pos }

                    const adjustingPosition = adjustPosition
                        ? from(
                              adjustPosition({
                                  codeView,
                                  direction: AdjustmentDirection.ActualToCodeView,
                                  position: {
                                      ...pos,
                                      part,
                                  },
                              })
                          )
                        : of(pos)

                    return adjustingPosition.pipe(
                        map(position => ({ position, hoverOrError, codeView, part, ...rest }))
                    )
                }),
                switchMap(({ scrollBoundaries, hoverOrError, position, codeView, codeViewId, dom, part }) => {
                    const highlightedRange = getHighlightedRange({ hoverOrError, position })
                    const hoveredTokenElement = highlightedRange
                        ? getTokenAtPosition(codeView, highlightedRange.start, dom, part, tokenize)
                        : undefined
                    return resetOnBoundaryIntersection({
                        scrollBoundaries,
                        codeViewId,
                        codeView,
                        highlightedRange,
                        hoverOrError,
                        hoveredTokenElement,
                        hoverOverlayPosition: undefined,
                    })
                })
            )
            .subscribe(({ codeView, highlightedRange, hoveredTokenElement, ...rest }) => {
                container.update({
                    highlightedRange,
                    hoveredTokenElement,
                    ...rest,
                })
                // Ensure the previously highlighted range is not highlighted and the new highlightedRange (if any)
                // is highlighted.
                const currentHighlighted = codeView.querySelector(`.${selectionHighlightClassName}`)
                if (currentHighlighted) {
                    currentHighlighted.classList.remove(selectionHighlightClassName)
                }
                if (hoveredTokenElement) {
                    hoveredTokenElement.classList.add(selectionHighlightClassName)
                }
            })
    )

    /**
     * For every position, emits an Observable with new values for the `documentHighlights` state.
     * This is a higher-order Observable (Observable that emits Observables).
     */
    const documentHighlightObservables: Observable<Observable<{
        eventType: SupportedMouseEvent | 'jump'
        dom: DOMFunctions
        target: HTMLElement
        adjustPosition?: PositionAdjuster<C>
        codeView: HTMLElement
        codeViewId: symbol
        scrollBoundaries?: HTMLElement[]
        documentHighlights?: DocumentHighlight[]
        position?: HoveredToken & C
        part?: DiffPart
    }>> = resolvedPositions.pipe(
        map(({ position, codeViewId, ...rest }) => {
            if (!position) {
                return of({
                    documentHighlights: [],
                    position: undefined,
                    part: undefined,
                    codeViewId,
                    ...rest,
                })
            }
            // Get the document highlights for that position
            return from(getDocumentHighlights(position)).pipe(
                catchError(error => {
                    console.error(error)
                    return []
                }),
                map(documentHighlights => ({
                    ...rest,
                    codeViewId,
                    position,
                    documentHighlights,
                    part: position.part,
                })),
                // Do not emit anything after the code view this action came from got unhoverified
                takeUntil(allUnhoverifies.pipe(filter(unhoverifiedCodeViewId => unhoverifiedCodeViewId === codeViewId)))
            )
        }),
        share()
    )

    // Highlight the ranges returned by the document highlight provider
    subscription.add(
        documentHighlightObservables
            .pipe(
                switchMap(highlightObservable => highlightObservable),
                map(({ documentHighlights, position, adjustPosition, codeView, part, ...rest }) =>
                    !documentHighlights || documentHighlights.length === 0 || !position
                        ? { adjustPosition, codeView, part, ...rest, positions: of<Position[]>([]) }
                        : {
                              adjustPosition,
                              codeView,
                              part,
                              ...rest,
                              // Adjust the position of each highlight range so that it can be resolved to a
                              // token in the current document in the next step. This currently on highlights the
                              // token that intersects with the start of the highlight range, but this is all we
                              // need in the majority of cases as we currently only highlight references.
                              //
                              // To expand this use case in the future, we should determine all intersecting tokens
                              // between the range start and end positions.
                              positions: combineLatest(
                                  documentHighlights.map(({ range }) => {
                                      let pos = { ...position, ...range.start }

                                      // The requested position is is 0-indexed; the code here is currently 1-indexed
                                      const { line, character } = pos
                                      pos = { ...pos, line: line + 1, character: character + 1 }

                                      return adjustPosition
                                          ? from(
                                                adjustPosition({
                                                    codeView,
                                                    direction: AdjustmentDirection.ActualToCodeView,
                                                    position: {
                                                        ...pos,
                                                        part,
                                                    },
                                                })
                                            )
                                          : of(pos)
                                  })
                              ),
                          }
                ),
                mergeMap(({ positions, codeView, dom, part }) =>
                    positions.pipe(
                        map(highlightedRanges =>
                            highlightedRanges.map(highlightedRange =>
                                getTokenAtPosition(codeView, highlightedRange, dom, part, tokenize)
                            )
                        ),
                        map(elements => ({ elements, codeView, dom, part }))
                    )
                )
            )
            .subscribe(({ codeView, elements }) => {
                // Ensure the previously highlighted range is not highlighted and the new highlightedRange (if any)
                // is highlighted.
                const currentHighlights = codeView.querySelectorAll(`.${documentHighlightClassName}`)
                for (const currentHighlighted of currentHighlights) {
                    currentHighlighted.classList.remove(documentHighlightClassName)
                }

                for (const element of elements) {
                    if (element) {
                        element.classList.add(documentHighlightClassName)
                    }
                }
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
        // and either the hover or the definition turn out non-empty, pin the tooltip.
        // If they both turn out empty, unpin it so we don't end up with an invisible tooltip.
        //
        // zip together the corresponding hover and definition
        subscription.add(
            combineLatest([
                zip(hoverObservables, actionObservables),
                resolvedPositionEvents.pipe(map(({ eventType }) => eventType)),
            ])
                .pipe(
                    switchMap(([[hoverObservable, actionObservable], eventType]) => {
                        // If the position was triggered by a mouseover, never pin
                        if (eventType !== 'click' && eventType !== 'jump') {
                            return [false]
                        }
                        // combine the latest values for them, so we have access to both values
                        // and can reevaluate our pinning decision whenever one of the two updates,
                        // independent of the order in which they emit
                        return combineLatest([hoverObservable, actionObservable]).pipe(
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

    const resetHover = (): void => {
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
