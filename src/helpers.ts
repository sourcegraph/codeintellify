import { highlight, highlightAuto } from 'highlight.js/lib/highlight'
import marked from 'marked'
import * as React from 'react'
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
): val is K extends any ? ({ [k in Exclude<keyof T, K>]: T[k] } & { [k in K]: NonNullable<T[k]> }) : never =>
    isDefined(val[key])

export const isEmptyHover = (hover: HoverMerged | null): boolean =>
    !hover ||
    !hover.contents ||
    (Array.isArray(hover.contents) && hover.contents.length === 0) ||
    (MarkupContent.is(hover.contents) && !hover.contents.value)

/**
 * Returns true if the HoverOverlay would have anything to show according to the given hover and definition states.
 */
export const overlayUIHasContent = (state: Pick<HoverOverlayProps, 'hoverOrError' | 'definitionURLOrError'>): boolean =>
    (!!state.hoverOrError && !(HoverMerged.is(state.hoverOrError) && isEmptyHover(state.hoverOrError))) ||
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
    const containerRect = container.getBoundingClientRect()
    const rowRect = target.getBoundingClientRect()
    if (rowRect.top <= containerRect.top || rowRect.bottom >= containerRect.bottom) {
        const containerRect = container.getBoundingClientRect()
        const contentRect = content.getBoundingClientRect()
        const rowRect = target.getBoundingClientRect()
        const scrollTop = rowRect.top - contentRect.top - containerRect.height / 2 + rowRect.height / 2
        container.scrollTop = scrollTop
    }
}

/**
 * Escapes HTML by replacing characters like `<` with their HTML escape sequences like `&lt;`
 */
const escapeHTML = (html: string): string => {
    const span = document.createElement('span')
    span.textContent = html
    return span.innerHTML
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
        if (language === 'plaintext' || language === 'text') {
            return escapeHTML(code)
        }
        if (language) {
            return highlight(language, code, true).value
        }
        return highlightAuto(code).value
    } catch (err) {
        console.warn('Error syntax-highlighting hover markdown code block', err)
        return escapeHTML(code)
    }
}

/**
 * Renders the given markdown to HTML, highlighting code and sanitizing dangerous HTML.
 * Can throw an exception on parse errors.
 */
export const renderMarkdown = (markdown: string): string => {
    const rendered = marked(markdown, {
        gfm: true,
        breaks: true,
        sanitize: false,
        highlight: (code, language) => highlightCodeSafe(code, language),
    })
    return sanitize(rendered, {
        // Allow highligh.js styles, e.g.
        // <span class="hljs-keyword">
        // <code class="language-javascript">
        allowedTags: [...sanitize.defaults.allowedTags, 'span'],
        allowedAttributes: {
            span: ['class'],
            code: ['class'],
        },
    })
}

/**
 * Converts a synthetic React event to a persisted, native Event object.
 *
 * @param event The synthetic React event object
 */
export const toNativeEvent = <E extends React.SyntheticEvent<T>, T>(event: E): E['nativeEvent'] => {
    event.persist()
    return event.nativeEvent
}
