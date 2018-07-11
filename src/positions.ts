import { fromEvent, merge, Observable } from 'rxjs'
import { filter, map, switchMap, tap } from 'rxjs/operators'
import { Position } from 'vscode-languageserver-types'
import { convertCodeElementIdempotent, DOMOptions, HoveredToken, locateTarget } from './token_position'

export type SupportedMouseEvent = 'click' | 'mousemove' | 'mouseover'

export interface PositionEvent {
    /**
     * The event object
     */
    event: MouseEvent
    /**
     * The type of mouse event that caused this to emit.
     */
    eventType: SupportedMouseEvent
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

export const findPositionsFromEvents = (options: DOMOptions) => (
    elements: Observable<HTMLElement>
): Observable<PositionEvent> =>
    merge(
        elements.pipe(
            switchMap(element => fromEvent<MouseEvent>(element, 'mouseover')),
            map(event => ({ event, eventType: 'mouseover' as 'mouseover' })),
            filter(({ event }) => event.currentTarget !== null),
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
        )
    ).pipe(
        // Find out the position that was hovered over
        map(({ target, codeView, ...rest }) => {
            const hoveredToken = locateTarget(target, options)
            const position = Position.is(hoveredToken) ? hoveredToken : undefined
            return { position, codeView, ...rest }
        })
    )
