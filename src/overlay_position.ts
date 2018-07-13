/**
 * `padding-top` of the blob element in px.
 * TODO find a way to remove the need for this.
 */
const BLOB_PADDING_TOP = 8

const calculateOverlayPositionWithinScrollable = (
    scrollable: HTMLElement,
    target: HTMLElement,
    tooltip: HTMLElement
): { left: number; top: number } => {
    // The scrollable element is the one with scrollbars. The scrolling element is the one with the content.
    const scrollableBounds = scrollable.getBoundingClientRect()
    const targetBound = target.getBoundingClientRect() // our target elements bounds

    // Anchor it horizontally, prior to rendering to account for wrapping
    // changes to vertical height if the tooltip is at the edge of the viewport.
    const relLeft = targetBound.left - scrollableBounds.left

    const scrollTop = scrollable === document.documentElement ? window.pageYOffset : scrollable.scrollTop

    // Anchor the tooltip vertically.
    const tooltipBound = tooltip.getBoundingClientRect()
    const relTop = targetBound.top + scrollTop - scrollableBounds.top
    // This is the padding-top of the blob element
    let tooltipTop = relTop - (tooltipBound.height - BLOB_PADDING_TOP)
    if (tooltipTop - scrollTop < 0) {
        // Tooltip wouldn't be visible from the top, so display it at the
        // bottom.
        const relBottom = targetBound.bottom + scrollTop - scrollableBounds.top
        tooltipTop = relBottom
    } else {
        tooltipTop -= BLOB_PADDING_TOP
    }
    return { left: relLeft, top: tooltipTop }
}

const calculateOverlayPositionWithoutScrollable = (
    container: HTMLElement,
    target: HTMLElement,
    tooltip: HTMLElement
): { left: number; top: number } => {
    const containerBound = container.getBoundingClientRect()

    // Anchor it horizontally, prior to rendering to account for wrapping
    // changes to vertical height if the tooltip is at the edge of the viewport.
    const targetBound = target.getBoundingClientRect()
    const tooltipLeft = targetBound.left - containerBound.left + window.scrollX

    // Anchor the tooltip vertically.
    const tooltipBound = tooltip.getBoundingClientRect()
    const relTop = targetBound.top - containerBound.top + container.offsetTop

    let tooltipTop = relTop - tooltipBound.height
    if (tooltipTop - window.scrollY < 0) {
        // Tooltip wouldn't be visible from the top, so display it at the bottom.
        const relBottom = relTop + targetBound.height
        tooltipTop = relBottom
    }

    return { top: tooltipTop, left: tooltipLeft }
}

/**
 * Calculates the desired position of the hover overlay depending on the container,
 * the hover target and the size of the hover overlay
 *
 * @param container The container. If the code view is scrollable, it's the scrollable element, otherwise its the codeView itself.
 * @param target The DOM Node that was hovered.
 * @param tooltip The DOM Node of the tooltip.
 * @param isScrollable Whether the code view is scrollable or not.
 */
export const calculateOverlayPosition = (
    container: HTMLElement,
    target: HTMLElement,
    tooltip: HTMLElement,
    isScrollable?: boolean
): { left: number; top: number } => {
    if (isScrollable) {
        return calculateOverlayPositionWithinScrollable(container, target, tooltip)
    }

    return calculateOverlayPositionWithoutScrollable(container, target, tooltip)
}
