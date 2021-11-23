const getFirstChild = (elem: HTMLElement): Node | null => elem.firstChild

export const getElementPaddingLeft = (elem: HTMLElement): number => {
    const firstChild = getFirstChild(elem)
    if (!firstChild) {
        return 0
    }

    const range = document.createRange()
    range.selectNodeContents(firstChild)

    return range.getBoundingClientRect().left - elem.getBoundingClientRect().left
}

export const getElementOffset = (elem: HTMLElement, useElemOffset = true): number =>
    (useElemOffset ? elem.getBoundingClientRect().left : 0) + getElementPaddingLeft(elem)

export const getTextNodes = (node: Node): Node[] => {
    if (node.childNodes.length === 0 && node.TEXT_NODE === node.nodeType && node.nodeValue) {
        return [node]
    }

    const nodes: Node[] = []

    for (const child of Array.from(node.childNodes)) {
        nodes.push(...getTextNodes(child))
    }

    return nodes
}
