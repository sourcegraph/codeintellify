import githubCode from '../../testdata/generated/github.html'
import sourcegraphCode from '../../testdata/generated/sourcegraph.html'
import { DOMOptions, getTextNodes } from '../token_position'
import { TEST_DATA_REVSPEC } from './rev'

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

export const getCharacterWidth = (character: string): number =>
    createElementFromString(character).getBoundingClientRect().width

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

const getCharactersInCell = (cell: HTMLElement) =>
    Array.from(
        getTextNodes(cell)
            .map(node => node.nodeValue)
            .join('')
    )

export const getNumberOfCharactersFromCell = (cell: HTMLElement): number => getCharactersInCell(cell).length
export const getWidthOfCharactersFromCell = (cell: HTMLElement): number =>
    getCharactersInCell(cell)
        .map((c, i) => getCharacterWidthInContainer(cell, c, i))
        .reduce((a, b) => a + b, 0)

export interface CodeViewProps extends DOMOptions {
    element: HTMLElement
    injectedElement: HTMLElement
    revSpec: typeof TEST_DATA_REVSPEC

    insertRow: (text: string) => HTMLElement
}

export const wrapCharsInSpans = (line: string) =>
    Array.from(line)
        .map((c, j) => `<span data-char="${j}">${c}</span>`)
        .join('')

const getDiffCodePart = (target: HTMLElement, content: string) => {
    switch (content.charAt(0)) {
        case '+':
            return 'new'
        case '-':
            return 'old'
        default:
            return undefined
    }
}

const createGitHubCodeView = (): CodeViewProps => {
    const codeView = document.createElement('div')

    codeView.innerHTML = githubCode
    codeView.style.clear = 'both'

    const getCodeElementFromTarget = (target: HTMLElement): HTMLElement | null => {
        const row = target.closest('tr')
        if (!row) {
            return null
        }

        const codeCell = row.children.item(1) as HTMLElement

        if (!codeCell.classList.contains('blob-code')) {
            // Line element mouse overs probably
            return null
        }

        return codeCell
    }

    const getCodeElementFromLineNumber = (b: HTMLElement, line: number): HTMLElement | null => {
        const numCell = b.querySelector(`[data-line-number="${line}"]`)
        if (!numCell) {
            return null
        }

        const row = numCell.closest('tr') as HTMLElement
        if (!row) {
            return row
        }

        return row.children.item(1) as HTMLElement | null
    }

    const getLineNumberFromCodeElement = (codeCell: HTMLElement): number => {
        const row = codeCell.closest('tr')
        if (!row) {
            return -1
        }
        const numCell = row.children.item(0) as HTMLElement
        if (!numCell || (numCell && !numCell.dataset.lineNumber)) {
            return -1
        }

        return parseInt(numCell.dataset.lineNumber as string, 10)
    }

    return {
        injectedElement: codeView,
        element: codeView,

        revSpec: TEST_DATA_REVSPEC,
        getCodeElementFromTarget,
        getCodeElementFromLineNumber,
        getLineNumberFromCodeElement,
        getDiffCodePart,

        insertRow: (text: string) => {
            const lastRow = codeView.querySelector('tbody tr:last-of-type')!

            const node = lastRow.cloneNode(true) as HTMLElement
            const line = parseInt((lastRow.children.item(0) as HTMLElement).dataset.lineNumber as string, 10) + 1

            const lineNode = node.children.item(0)! as HTMLElement
            lineNode.id = `L${line}`
            lineNode.dataset.lineNumber = line.toString()

            const codeNode = node.children.item(1)! as HTMLElement
            codeNode.id = `LC${line}`
            codeNode.innerHTML = wrapCharsInSpans(text)

            codeView.querySelector('tbody')!.appendChild(node)

            return node
        },
    }
}

const createSourcegraphCodeView = (): CodeViewProps => {
    const codeView = document.createElement('div')

    codeView.innerHTML = sourcegraphCode
    codeView.style.clear = 'both'

    const getCodeElementFromTarget = (target: HTMLElement): HTMLElement | null => {
        const row = target.closest('tr')
        if (!row) {
            return null
        }

        const codeCell = row.children.item(1) as HTMLElement

        if (!codeCell.classList.contains('code')) {
            // Line element mouse overs probably
            return null
        }

        return codeCell
    }

    const getCodeElementFromLineNumber = (b: HTMLElement, line: number): HTMLElement | null => {
        const numCell = b.querySelector(`[data-line="${line}"]`)
        if (!numCell) {
            return null
        }

        const row = numCell.closest('tr') as HTMLElement
        if (!row) {
            return row
        }

        return row.children.item(1) as HTMLElement | null
    }

    const getLineNumberFromCodeElement = (codeCell: HTMLElement): number => {
        const row = codeCell.closest('tr')
        if (!row) {
            return -1
        }

        const numCell = row.children.item(0) as HTMLElement
        if (!numCell || (numCell && !numCell.dataset.line)) {
            return -1
        }

        return parseInt(numCell.dataset.line as string, 10)
    }

    return {
        injectedElement: codeView,

        element: codeView.querySelector('code')!,
        revSpec: TEST_DATA_REVSPEC,
        getCodeElementFromTarget,
        getCodeElementFromLineNumber,
        getLineNumberFromCodeElement,
        getDiffCodePart,
        insertRow: (text: string) => {
            const lastRow = codeView.querySelector('tbody tr:last-of-type')!

            const node = lastRow.cloneNode(true) as HTMLElement
            const line = parseInt((lastRow.children.item(0) as HTMLElement).dataset.line as string, 10) + 1

            const lineNode = node.children.item(0)! as HTMLElement
            lineNode.dataset.line = line.toString()

            const codeNode = node.children.item(1)! as HTMLElement
            codeNode.innerHTML = wrapCharsInSpans(text)

            codeView.querySelector('tbody')!.appendChild(node)

            return node
        },
    }
}

export class DOM {
    private nodes = new Set<Element>()

    public createCodeViews(): CodeViewProps[] {
        const codeViews: CodeViewProps[] = [createSourcegraphCodeView(), createGitHubCodeView()]

        for (const { injectedElement } of codeViews) {
            this.insert(injectedElement)
        }

        return codeViews
    }

    public createElementFromString(html: string): HTMLElement {
        const element = createElementFromString(html)
        this.insert(element)
        return element as HTMLElement
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
