import { of } from 'rxjs'
import { delay } from 'rxjs/operators'

import { HoverFetcher, JumpURLFetcher } from '../hoverifier'
import { HoverMerged } from '../types'

/**
 * Create a stubbed HoverMerged object.
 * @param hover optional values for the HoverMerged object. If none is provided, we'll output defaults.
 */
export const createHoverMerged = (hover: Partial<HoverMerged> = {}): HoverMerged => ({
    contents: hover.contents
        ? hover.contents
        : ['func NewRouter() *Router', 'NewRouter returns a new router instance.'],
    range: hover.range
        ? hover.range
        : {
              start: { line: 24, character: 5 },
              end: { line: 24, character: 14 },
          },
})

/**
 * Create a stubbed HoverFetcher
 * @param hover optional values to be passed to createHoverMerged
 * @param delayTime optionally delay the hover fetch
 */
export function createStubHoverFetcher(hover: Partial<HoverMerged> = {}, delayTime?: number): HoverFetcher {
    return () => of(createHoverMerged(hover)).pipe(delay(delayTime || 0))
}

/**
 * Create a stubbed JumpURLFetcher
 * @param jumpURL optional value to emit as the url
 * @param delayTime optionally delay the jump url fetch
 */
export function createStubJumpURLFetcher(jumpURL = '', delayTime?: number): JumpURLFetcher {
    return () => of(jumpURL).pipe(delay(delayTime || 0))
}
