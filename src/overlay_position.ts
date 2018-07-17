/**
 * `padding-top` of the blob element in px.
 * TODO find a way to remove the need for this.
 */
const BLOB_PADDING_TOP = 8

interface CalculateOverlayPositionOptions {
    /** The closest parent element that is `position: relative` */
    relativeElement: HTMLElement
    /** The DOM Node that was hovered */
    target: HTMLElement
    /** The DOM Node of the tooltip */
    hoverOverlayElement: HTMLElement
}

/**
 * Calculates the desired position of the hover overlay depending on the container,
 * the hover target and the size of the hover overlay
 */
export const calculateOverlayPosition = ({
    relativeElement,
    target,
    hoverOverlayElement,
}: CalculateOverlayPositionOptions): { left: number; top: number } => {
    // The scrollable element is the one with scrollbars. The scrolling element is the one with the content.
    const relativeElementBounds = relativeElement.getBoundingClientRect()
    const targetBound = target.getBoundingClientRect() // our target elements bounds

    // Anchor it horizontally, prior to rendering to account for wrapping
    // changes to vertical height if the tooltip is at the edge of the viewport.
    const relLeft = targetBound.left - relativeElementBounds.left

    // Anchor the tooltip vertically.
    const tooltipBound = hoverOverlayElement.getBoundingClientRect()
    const relTop = targetBound.top + relativeElement.scrollTop - relativeElementBounds.top
    // This is the padding-top of the blob element
    let tooltipTop = relTop - (tooltipBound.height - BLOB_PADDING_TOP)
    if (tooltipTop - relativeElement.scrollTop < 0) {
        // Tooltip wouldn't be visible from the top, so display it at the
        // bottom.
        const relBottom = targetBound.bottom + relativeElement.scrollTop - relativeElementBounds.top
        tooltipTop = relBottom
    } else {
        tooltipTop -= BLOB_PADDING_TOP
    }
    return { left: relLeft, top: tooltipTop }
}
