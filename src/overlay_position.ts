interface CalculateOverlayPositionOptions {
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

    // If the relativeElement is scrolled horizontally, we need to account for the offset (if not scrollLeft will be 0)
    const relativeHoverOverlayLeft = targetBounds.left + relativeElement.scrollLeft - relativeElementBounds.left

    let relativeHoverOverlayTop: number
    // If the top of the hover overlay would be outside of the viewport (top negative)
    if (targetBounds.top - hoverOverlayBounds.height < 0) {
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
