import { CharacterPositions } from '@sourcegraph/event-positions'
import { Position } from 'vscode-languageserver-types'
import { convertNode } from '../token_position'
import { CodeViewProps } from './dom'

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

const invalidPosition = ({ line, character }: Position, message: string) =>
    `Invalid postion L${line}:${character}. ${message}. Remember, LSP Positions are 0-indexed.`

/**
 * Click the given position in a code element. This is impure because the current hoverifier implementation
 * requires the click event to come from the already tokenized DOM elements. Ideally we would not rely on this at all.
 *
 * @param codeViewProps the codeViewProps props from the test cases.
 * @param position the position to click.
 */
export const clickPositionImpure = ({ codeView, getCodeElementFromLineNumber }: CodeViewProps, position: Position) => {
    const line = getCodeElementFromLineNumber(codeView, position.line)
    if (!line) {
        throw new Error(invalidPosition(position, 'Line not found'))
    }

    if (!line.classList.contains('annotated')) {
        convertNode(line)
    }

    let characterOffset = 0
    for (const child of line.childNodes) {
        const value = child.textContent
        if (!value) {
            continue
        }

        if (characterOffset <= position.character && characterOffset + value.length >= position.character) {
            const rect = line.getBoundingClientRect()
            const { top, height, left, width } = rect

            const event = createClickEvent({
                x: left + width / 2,
                y: top + height / 2,
            })

            child.dispatchEvent(event)

            return
        }

        characterOffset += value.length
    }
}

/**
 * Dispatch a click event at a position in the code view.
 *
 * @param codeViewProps the CodeViewProps from the generated test cases
 * @param position the 0-indexed position to click
 */
export const clickPosition = ({ codeView, getCodeElementFromLineNumber }: CodeViewProps, position: Position) => {
    const line = getCodeElementFromLineNumber(codeView, position.line)
    if (!line) {
        throw new Error(invalidPosition(position, 'Line not found'))
    }

    const positions = new CharacterPositions(line)

    const left = positions.getCharacterOffset(position.character, line, true)
    const right = positions.getCharacterOffset(position.character, line, false)
    const width = right - left

    const rect = line.getBoundingClientRect()
    const top = rect.top
    const height = rect.height

    const event = createClickEvent({
        x: left + width / 2,
        y: top + height / 2,
    })

    line.dispatchEvent(event)
}
