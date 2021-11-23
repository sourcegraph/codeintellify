import githubCode from '../../../event-positions-testcases/generated/github.html'
import sourcegraphCode from '../../../event-positions-testcases/generated/sourcegraph.html'

import { PositionsProps } from '../positions_events'

const createElementFromString = (html: string): HTMLElement => {
    const elem = document.createElement('div')

    elem.innerHTML = html
    elem.style.height = 'auto'
    elem.style.width = 'auto'
    elem.style.whiteSpace = 'pre'
    elem.style.cssFloat = 'left'
    elem.style.display = 'block'
    elem.style.clear = 'both'

    return elem
}

export const getCharacterWidthInContainer = (container: HTMLElement, character: string, idx: number): number => {
    const span = document.createElement('span')
    span.innerHTML = character
    span.dataset.char = idx + ''
    span.dataset.charCode = character.charCodeAt(0) + ''
    span.style.visibility = 'hidden'
    span.style.cssFloat = 'left'
    span.style.height = '0'

    container.appendChild(span)
    const width = span.getBoundingClientRect().width
    container.removeChild(span)

    return width
}

export type BlobProps = Pick<
    PositionsProps,
    'getCodeElementFromTarget' | 'getCodeElementFromLineNumber' | 'getLineNumberFromCodeElement'
> & { insertRow: (text: string) => HTMLElement; element: HTMLElement }

export const wrapCharsInSpans = (line: string): string =>
    Array.from(line)
        .map((c, j) => `<span data-char="${j}">${c}</span>`)
        .join('')

const createGitHubBlob = (): BlobProps => {
    const blob = document.createElement('div')

    blob.innerHTML = githubCode
    blob.style.clear = 'both'

    const getCodeElementFromTarget = (target: HTMLElement): HTMLElement | null => {
        const row = target.closest('tr')
        if (!row) {
            return null
        }

        const codeCell = row.children.item(1) as HTMLElement

        return codeCell
    }

    const getCodeElementFromLineNumber = (b: HTMLElement, line: number): HTMLElement | null => {
        const numCell = b.querySelector(`[data-line-number="${line + 1}"]`)
        if (!numCell) {
            return null
        }

        const row = numCell.closest('tr')

        return row!.children.item(1) as HTMLElement | null
    }

    const getLineNumberFromCodeElement = (codeCell: HTMLElement): number => {
        const row = codeCell.closest('tr')
        if (!row) {
            return -1
        }
        const numCell = row.children.item(0) as HTMLElement

        return parseInt(numCell.dataset.lineNumber as string, 10) - 1
    }

    return {
        element: blob,
        getCodeElementFromTarget,
        getCodeElementFromLineNumber,
        getLineNumberFromCodeElement,
        insertRow: (text: string) => {
            const lastRow = blob.querySelector('tbody tr:last-of-type')!

            const node = lastRow.cloneNode(true) as HTMLElement
            const line = parseInt((lastRow.children.item(0) as HTMLElement).dataset.lineNumber as string, 10) + 1

            const lineNode = node.children.item(0)! as HTMLElement
            lineNode.id = `L${line}`
            lineNode.dataset.lineNumber = line.toString()

            const codeNode = node.children.item(1)! as HTMLElement
            codeNode.id = `LC${line}`
            codeNode.innerHTML = wrapCharsInSpans(text)

            blob.querySelector('tbody')!.appendChild(node)

            return node
        },
    }
}

const createSourcegraphBlob = (): BlobProps => {
    const blob = document.createElement('div')

    blob.innerHTML = sourcegraphCode
    blob.style.clear = 'both'

    const getCodeElementFromTarget = (target: HTMLElement): HTMLElement | null => {
        const row = target.closest('tr')
        if (!row) {
            return null
        }

        const codeCell = row.children.item(1) as HTMLElement

        return codeCell
    }

    const getCodeElementFromLineNumber = (b: HTMLElement, line: number): HTMLElement | null => {
        const numCell = b.querySelector(`[data-line="${line + 1}"]`)
        if (!numCell) {
            return null
        }

        const row = numCell.closest('tr')

        return row!.children.item(1) as HTMLElement | null
    }

    const getLineNumberFromCodeElement = (codeCell: HTMLElement): number => {
        const row = codeCell.closest('tr')
        if (!row) {
            return -1
        }

        const numCell = row.children.item(0) as HTMLElement

        // data-line - 1 because 0-based in LSP
        // https://sourcegraph.com/github.com/Microsoft/vscode-languageserver-node/-/blob/types/src/main.ts#L20:5
        return parseInt(numCell.dataset.line as string, 10) - 1
    }

    return {
        element: blob,
        getCodeElementFromTarget,
        getCodeElementFromLineNumber,
        getLineNumberFromCodeElement,
        insertRow: (text: string) => {
            const lastRow = blob.querySelector('tbody tr:last-of-type')!

            const node = lastRow.cloneNode(true) as HTMLElement
            const line = parseInt((lastRow.children.item(0) as HTMLElement).dataset.line as string, 10) + 1

            const lineNode = node.children.item(0)! as HTMLElement
            lineNode.dataset.line = line.toString()

            const codeNode = node.children.item(1)! as HTMLElement
            codeNode.innerHTML = wrapCharsInSpans(text)

            blob.querySelector('tbody')!.appendChild(node)

            return node
        },
    }
}

export class DOM {
    private nodes = new Set<Element>()

    public createBlobs(): BlobProps[] {
        const blobs: BlobProps[] = [createSourcegraphBlob(), createGitHubBlob()]

        for (const { element } of blobs) {
            this.insert(element)
        }

        return blobs
    }

    public createElementFromString(html: string): HTMLElement {
        const element = createElementFromString(html)
        this.insert(element)
        return element
    }

    public cleanup = (): void => {
        for (const node of this.nodes) {
            document.body.removeChild(node)
        }
    }

    private insert(node: Element): void {
        document.body.appendChild(node)

        this.nodes.add(node)
    }
}
