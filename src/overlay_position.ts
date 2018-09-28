export interface CalculateOverlayPositionOptions {
    /** The closest parent element that is `position: relative` */
    relativeElement: HTMLElement
    /** The DOM Node that was hovered */
    target: HTMLElement
    /** The DOM Node of the tooltip */
    hoverOverlayElement: HTMLElement
}

export interface CSSOffsets {
    /** Offset from the left in pixel */
    left: number
    /** Offset from the top in pixel */
    top: number
}

/**
 * Calculates the desired position of the hover overlay depending on the container,
 * the hover target and the size of the hover overlay
 */
export const calculateOverlayPosition = ({
    relativeElement,
    target,
    hoverOverlayElement,
}: CalculateOverlayPositionOptions): CSSOffsets => {
    const relativeElementBounds = relativeElement.getBoundingClientRect()
    const targetBounds = target.getBoundingClientRect()
    const hoverOverlayBounds = hoverOverlayElement.getBoundingClientRect()

    let relativeHoverOverlayLeft: number

    // Check if the right of the hover overlay would be outside of the relative element or the viewport
    if (relativeElementBounds.right < targetBounds.left + hoverOverlayBounds.width) {
        // Position it to be aligned with the right side of the target
        // Calculate the offset from the right of the relative element
        // If the relativeElement is scrolled horizontally, we need to account for the offset (if not scrollLeft will be 0)
        relativeHoverOverlayLeft =
            targetBounds.right - relativeElementBounds.left + relativeElement.scrollLeft - hoverOverlayBounds.width
    } else {
        // Else position it to be aligned with the left of the target
        // If the relativeElement is scrolled horizontally, we need to account for the offset (if not scrollLeft will be 0)
        relativeHoverOverlayLeft = targetBounds.left + relativeElement.scrollLeft - relativeElementBounds.left
    }

    let relativeHoverOverlayTop: number
    // Check if the top of the hover overlay would be outside of the relative element or the viewport
    if (targetBounds.top - hoverOverlayBounds.height < Math.max(relativeElementBounds.top, 0)) {
        // Position it below the target
        // If the relativeElement is scrolled, we need to account for the offset (if not scrollTop will be 0)
        relativeHoverOverlayTop = targetBounds.bottom - relativeElementBounds.top + relativeElement.scrollTop
    } else {
        // Else position it above the target
        // Caculate the offset from the top of the relativeElement content to the top of the target
        // If the relativeElement is scrolled, we need to account for the offset (if not scrollTop will be 0)
        const relativeTargetTop = targetBounds.top - relativeElementBounds.top + relativeElement.scrollTop
        relativeHoverOverlayTop = relativeTargetTop - hoverOverlayBounds.height
    }

    return { left: relativeHoverOverlayLeft, top: relativeHoverOverlayTop }
}
