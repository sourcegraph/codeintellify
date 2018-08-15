import { fromEvent, merge, Observable, pipe } from 'rxjs'
import { filter, map, switchMap, tap } from 'rxjs/operators'
import { Position } from 'vscode-languageserver-types'
import { convertCodeElementIdempotent, DiffPart, DOMFunctions, HoveredToken, locateTarget } from './token_position'

export type SupportedEvent = 'click' | 'mousemove' | 'mouseover' | 'keydown' | 'keyup'

export interface PositionEvent {
    /**
     * The event object
     */
    event: MouseEvent | KeyboardEvent
    /**
     * The type of event that caused this to emit.
     */
    eventType: SupportedEvent
    /**
     * The position of the token that the event occured at.
     * or undefined when a target was hovered/clicked that does not correspond to a position (e.g. after the end of the line)
     */
    position: HoveredToken | undefined
    /**
     * The current code view.
     */
    codeView: HTMLElement
}

/**
 * The current target element and code view being hovered over.
 * Used to select the relevant target on KeyboardEvents (which a user will want to apply to the hovered token, but
 * which actually register on another, unrelated element that has focus).
 */
let hoverTarget: HTMLElement | undefined
let hoverCodeView: HTMLElement | undefined

const findPositionsForKeyboardEvents = pipe(
    filter((event: { event: KeyboardEvent; eventType: SupportedEvent }) => event.event.currentTarget !== null),
    map(({ event, ...rest }) => ({
        event,
        target: hoverTarget as HTMLElement,
        codeView: hoverCodeView as HTMLElement,
        ...rest,
    }))
)

export { DOMFunctions, DiffPart }
export const findPositionsFromEvents = (options: DOMFunctions) => (
    elements: Observable<HTMLElement>
): Observable<PositionEvent> =>
    merge(
        elements.pipe(
            switchMap(element => fromEvent<MouseEvent>(element, 'mouseover')),
            map(event => ({ event, eventType: 'mouseover' as 'mouseover' })),
            filter(({ event }) => event.currentTarget !== null),
            tap(event => {
                hoverTarget = event.event.target as HTMLElement
                hoverCodeView = event.event.currentTarget as HTMLElement
            }),
            map(({ event, ...rest }) => ({
                event,
                target: event.target as HTMLElement,
                codeView: event.currentTarget as HTMLElement,
                ...rest,
            })),
            // SIDE EFFECT (but idempotent)
            // If not done for this cell, wrap the tokens in this cell to enable finding the precise positioning.
            // This may be possible in other ways (looking at mouse position and rendering characters), but it works
            tap(({ target }) => {
                const code = options.getCodeElementFromTarget(target)
                if (code) {
                    convertCodeElementIdempotent(code)
                }
            })
        ),
        elements.pipe(
            switchMap(element => fromEvent<MouseEvent>(element, 'click')),
            map(event => ({ event, eventType: 'click' as 'click' })),
            // ignore click events caused by the user selecting text.
            // Selecting text should not mess with the hover, hover pinning nor the URL.
            filter(() => window.getSelection().toString() === ''),
            filter(({ event }) => event.currentTarget !== null),
            map(({ event, ...rest }) => ({
                event,
                target: event.target as HTMLElement,
                codeView: event.currentTarget as HTMLElement,
                ...rest,
            }))
        ),
        elements.pipe(
            switchMap(() => fromEvent<KeyboardEvent>(window, 'keydown')),
            map(event => ({ event, eventType: 'keydown' as 'keydown' })),
            findPositionsForKeyboardEvents
        ),
        elements.pipe(
            switchMap(() => fromEvent<KeyboardEvent>(window, 'keyup')),
            map(event => ({ event, eventType: 'keyup' as 'keyup' })),
            findPositionsForKeyboardEvents
        )
    ).pipe(
        // Find out the position that was hovered over
        map(({ target, codeView, ...rest }) => {
            const hoveredToken = locateTarget(target, options)
            const position = Position.is(hoveredToken) ? hoveredToken : undefined
            return { position, codeView, ...rest }
        })
    )
