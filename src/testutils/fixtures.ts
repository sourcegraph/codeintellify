import { of } from 'rxjs'
import { delay } from 'rxjs/operators'

import { ActionsProvider, HoverProvider } from '../hoverifier'
import { HoverAttachment } from '../types'

/**
 * Create a stubbed HoverAttachment object.
 * @param hover optional values for the HoverAttachment object. If none is provided, we'll output defaults.
 */
export const createHoverAttachment = (hover: Partial<HoverAttachment> = {}): HoverAttachment => ({
    range: hover.range
        ? hover.range
        : {
              start: { line: 24, character: 10 },
              end: { line: 24, character: 14 },
          },
})

/**
 * Create a stubbed HoverProvider
 * @param hover optional values to be passed to createHoverAttachment
 * @param delayTime optionally delay the hover fetch
 */
export function createStubHoverProvider(
    hover: Partial<HoverAttachment> = {},
    delayTime?: number
): HoverProvider<{}, {}> {
    return () => of(createHoverAttachment(hover)).pipe(delay(delayTime || 0))
}

/**
 * Create a stubbed ActionsProvider
 *
 * @template A The type of an action.
 * @param actions optional value to emit as the actions
 * @param delayTime optionally delay the fetch
 */
export function createStubActionsProvider<A>(actions: A[], delayTime?: number): ActionsProvider<{}, A> {
    return () => of(actions).pipe(delay(delayTime || 0))
}
