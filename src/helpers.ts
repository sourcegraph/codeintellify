import { highlight, highlightAuto } from 'highlight.js/lib/highlight'
import marked from 'marked'
import sanitize from 'sanitize-html'
import { MarkupContent } from 'vscode-languageserver-types'
import { HoverOverlayProps, isJumpURL } from './HoverOverlay'
import { HoverMerged } from './types'

/**
 * Returns true if `val` is not `null` or `undefined`
 */
export const isDefined = <T>(val: T): val is NonNullable<T> => val !== undefined && val !== null

/**
 * Returns a function that returns `true` if the given `key` of the object is not `null` or `undefined`.
 *
 * I ❤️ TypeScript.
 */
export const propertyIsDefined = <T extends object, K extends keyof T>(key: K) => (
    val: T
): val is K extends any ? T & { [k in K]: NonNullable<T[k]> } : never => isDefined(val[key])

const isEmptyHover = (hover: HoverMerged | null): boolean =>
    !hover ||
    !hover.contents ||
    (Array.isArray(hover.contents) && hover.contents.length === 0) ||
    (MarkupContent.is(hover.contents) && !hover.contents.value)

/**
 * Returns true if the HoverOverlay would have anything to show according to the given hover and definition states.
 */
export const overlayUIHasContent = (state: Pick<HoverOverlayProps, 'hoverOrError' | 'definitionURLOrError'>): boolean =>
    (state.hoverOrError && !(HoverMerged.is(state.hoverOrError) && isEmptyHover(state.hoverOrError))) ||
    isJumpURL(state.definitionURLOrError)

/**
 * Scrolls an element to the center if it is out of view.
 * Does nothing if the element is in view.
 *
 * @param container The scrollable container (that has `overflow: auto`)
 * @param content The content child that is being scrolled
 * @param target The element that should be scrolled into view
 */
export const scrollIntoCenterIfNeeded = (container: HTMLElement, content: HTMLElement, target: HTMLElement): void => {
    const blobRect = container.getBoundingClientRect()
    const rowRect = target.getBoundingClientRect()
    if (rowRect.top <= blobRect.top || rowRect.bottom >= blobRect.bottom) {
        const blobRect = container.getBoundingClientRect()
        const contentRect = content.getBoundingClientRect()
        const rowRect = target.getBoundingClientRect()
        const scrollTop = rowRect.top - contentRect.top - blobRect.height / 2 + rowRect.height / 2
        container.scrollTop = scrollTop
    }
}

/**
 * Attempts to syntax-highlight the given code.
 * If the language is not given, it is auto-detected.
 * If an error occurs, the code is returned as plain text with escaped HTML entities
 *
 * @param code The code to highlight
 * @param language The language of the code, if known
 * @return Safe HTML
 */
export const highlightCodeSafe = (code: string, language?: string): string => {
    try {
        if (language) {
            return highlight(language, code, true).value
        }
        return highlightAuto(code).value
    } catch (err) {
        console.warn('Error syntax-highlighting hover markdown code block', err)
        return escape(code)
    }
}

/**
 * Renders the given markdown to HTML, highlighting code and sanitizing dangerous HTML.
 * Can throw an exception on parse errors.
 */
export const renderMarkdown = (markdown: string): string =>
    sanitize(
        marked(markdown, {
            gfm: true,
            breaks: true,
            sanitize: false,
            highlight: (code, language) => '<code>' + highlightCodeSafe(code, language) + '</code>',
        })
    )
