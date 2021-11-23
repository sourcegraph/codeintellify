import { DOM } from './dom'

const { expect } = chai

describe('can create dom elements from generated code tables', () => {
    const dom = new DOM()
    after(dom.cleanup)

    it('can create the blob test cases and their helper function work', () => {
        for (const blob of dom.createBlobs()) {
            const {
                element,
                getCodeElementFromTarget,
                getCodeElementFromLineNumber,
                getLineNumberFromCodeElement,
            } = blob

            for (let i = 0; i < 10; i++) {
                const cellFromLine = getCodeElementFromLineNumber(element, i)
                expect(cellFromLine).to.not.equal(null)
                const cellFromTarget = getCodeElementFromTarget(cellFromLine!)
                expect(cellFromTarget).to.equal(cellFromLine)
                const line = getLineNumberFromCodeElement(cellFromTarget!)
                expect(line).to.equal(i)
            }
        }
    })

    it('blob helpers handle non happy cases', () => {
        for (const blob of dom.createBlobs()) {
            const {
                element,
                getCodeElementFromTarget,
                getCodeElementFromLineNumber,
                getLineNumberFromCodeElement,
            } = blob

            expect(getCodeElementFromLineNumber(element, 100000)).to.equal(null)

            expect(getCodeElementFromTarget(dom.createElementFromString(''))).to.equal(null)

            expect(getLineNumberFromCodeElement(dom.createElementFromString(''))).to.equal(-1)
        }
    })
})
