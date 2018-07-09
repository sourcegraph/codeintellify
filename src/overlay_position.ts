/**
 * Calculates the desired position of the hover overlay depending on the container,
 * the hover target and the size of the hover overlay
 *
 * @param scrollable The closest container that is scrollable
 * @param target The DOM Node that was hovered
 * @param tooltip The DOM Node of the tooltip
 */
export const calculateOverlayPosition = (
    scrollableClientRect: ClientRect,
    scrollableScrollTop: number,
    targetClientRect: ClientRect,
    tooltipClientRect: ClientRect
): { left: number; top: number } => {
    // Anchor it horizontally, prior to rendering to account for wrapping
    // changes to vertical height if the tooltip is at the edge of the viewport.
    const relLeft = targetClientRect.left - scrollableClientRect.left

    // Anchor the tooltip vertically.
    const relTop = targetClientRect.top + scrollableScrollTop - scrollableClientRect.top
    // This is the padding-top of the blob element
    let tooltipTop = relTop - tooltipClientRect.height
    if (tooltipTop - scrollableScrollTop < 0) {
        // Tooltip wouldn't be visible from the top, so display it at the
        // bottom.
        const relBottom = targetClientRect.bottom + scrollableScrollTop - scrollableClientRect.top
        tooltipTop = relBottom
    }

    return { left: relLeft, top: tooltipTop }
}
