import * as assert from 'assert'
import { calculateOverlayPosition } from './overlay_position'

describe('overlay_position', () => {
    describe('calculateOverlayPosition()', () => {
        let relativeElement: HTMLElement
        let hoverOverlayElement: HTMLElement
        beforeEach(() => {
            const style = document.createElement('style')
            style.innerHTML = `
                * {
                    box-sizing: border-box;
                }
                .relative-element {
                    background: lightgray;
                    margin: 20px;
                    width: 800px;
                    height: 600px;
                    position: relative;
                }
                .hover-overlay-element {
                    background: gray;
                    width: 350px;
                    height: 150px;
                    position: absolute;
                }
                .target {
                    background: orange;
                    width: 60px;
                    height: 16px;
                    position: absolute;
                }
            `
            document.head.appendChild(style)

            relativeElement = document.createElement('div')
            relativeElement.className = 'relative-element'
            relativeElement.textContent = 'relativeElement'
            document.body.appendChild(relativeElement)

            hoverOverlayElement = document.createElement('div')
            hoverOverlayElement.className = 'hover-overlay-element'
            hoverOverlayElement.textContent = 'hoverOverlayElement'
            relativeElement.appendChild(hoverOverlayElement)
        })
        afterEach(() => {
            relativeElement.remove()
        })
        it('should return a position below the a given target in the middle of the page', () => {
            const target = document.createElement('div')
            target.className = 'target'
            target.style.left = '100px'
            target.style.top = '100px'
            target.textContent = 'target'
            relativeElement.appendChild(target)
            const position = calculateOverlayPosition({ relativeElement, target, hoverOverlayElement })
            hoverOverlayElement.style.left = position.left + 'px'
            hoverOverlayElement.style.top = position.top + 'px'
            assert.deepStrictEqual(position, { left: 100, top: 116 })
        })
    })
})
