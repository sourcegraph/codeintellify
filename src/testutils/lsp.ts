import { HoverMerged } from '../types'

export function createHoverMerged(): HoverMerged {
    return {
        contents: ['func NewRouter() *Router', 'NewRouter returns a new router instance.'],
        range: {
            start: { line: 24, character: 5 },
            end: { line: 24, character: 14 },
        },
    }
}
