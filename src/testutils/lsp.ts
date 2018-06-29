import { of } from 'rxjs'
import { delay } from 'rxjs/operators'

import { HoverFetcher, JumpURLFetcher } from '../hoverifier'
import { HoverMerged } from '../types'

export const createHoverMerged = (options: Partial<HoverMerged> = {}): HoverMerged => ({
    contents: options.contents
        ? options.contents
        : ['func NewRouter() *Router', 'NewRouter returns a new router instance.'],
    range: {
        start: { line: 24, character: 5 },
        end: { line: 24, character: 14 },
    },
})

export function createStubHoverFetcher(options: Partial<HoverMerged> = {}, delayTime?: number): HoverFetcher {
    return () => of(createHoverMerged(options)).pipe(delay(delayTime || 0))
}

export function createStubJumpURLFetcher(jumpURL = '', delayTime?: number): JumpURLFetcher {
    return () => of(jumpURL).pipe(delay(delayTime || 0))
}
