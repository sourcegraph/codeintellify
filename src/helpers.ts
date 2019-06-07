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
): val is T & { [k in K]-?: NonNullable<T[k]> } => isDefined(val[key])

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
