import { of } from 'rxjs'
import { delay } from 'rxjs/operators'

import { HoverFetcher, JumpURLFetcher } from '../hoverifier'
import { HoverAttachment } from '../types'

/**
 * Create a stubbed HoverAttachment object.
 * @param hover optional values for the HoverAttachment object. If none is provided, we'll output defaults.
 */
export const createHoverAttachment = (hover: Partial<HoverAttachment> = {}): HoverAttachment => ({
    range: hover.range
        ? hover.range
        : {
              start: { line: 24, character: 5 },
              end: { line: 24, character: 14 },
          },
})

/**
 * Create a stubbed HoverFetcher
 * @param hover optional values to be passed to createHoverAttachment
 * @param delayTime optionally delay the hover fetch
 */
export function createStubHoverFetcher(hover: Partial<HoverAttachment> = {}, delayTime?: number): HoverFetcher<{}> {
    return () => of(createHoverAttachment(hover)).pipe(delay(delayTime || 0))
}

/**
 * Create a stubbed JumpURLFetcher
 * @param jumpURL optional value to emit as the url
 * @param delayTime optionally delay the jump url fetch
 */
export function createStubJumpURLFetcher(jumpURL = '', delayTime?: number): JumpURLFetcher<{}> {
    return () => of(jumpURL).pipe(delay(delayTime || 0))
}
