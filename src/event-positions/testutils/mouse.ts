interface Coordinates {
    x: number
    y: number
}

export const createMouseEvent = (type: string) => (coords: Coordinates) => {
    const event = new MouseEvent(type, {
        clientX: coords.x,
        clientY: coords.y,
        bubbles: true, // Must be true so that React can see it.
    })

    return event
}

export const createMouseMoveEvent = createMouseEvent('mousemove')
export const createClickEvent = createMouseEvent('click')
