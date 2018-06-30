import { Position } from 'vscode-languageserver-types'

import { BlobProps } from './dom'

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

export const clickPosition = ({ element, getCodeElementFromLineNumber }: BlobProps, position: Position) => {
    const line = getCodeElementFromLineNumber(element, position.line)
    if (!line) {
        throw new Error('invalid position')
    }

    const char = line.querySelector(`[data-char="${position.character}"]`)
    if (!char) {
        throw new Error('invalid position')
    }

    const charRect = char.getBoundingClientRect()

    const event = createClickEvent({
        x: charRect.left + charRect.width / 2,
        y: charRect.top + charRect.height / 2,
    })

    char.dispatchEvent(event)
}
