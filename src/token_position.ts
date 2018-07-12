import { Position } from 'vscode-languageserver-types'
import { LineOrPositionOrRange } from './url'

/**
 * The part of the diff a line belongs to.
 * - `'head'` is the green, new, added part
 * - `'base'` is the red, old, deleted part
 * - `undefined` is the unchanged part, i.e. the line appears both in `head` and `base`
 */
export type DiffPart = 'head' | 'base' | undefined

/**
 * A collection of methods needed to tell codeintellify how to look at the DOM. These are required for
 * ensuring that we don't rely on any sort of specific DOM structure.
 */
export interface DOMFunctions {
    /**
     * Get the element containing the code for a line from an event target.
     * @param target is the event target.
     * @returns the element containing the code for a line or null if it can't be found. For example, the second <td> inside a <tr> on Sourcegraph and Github.
     */
    getCodeElementFromTarget: (target: HTMLElement) => HTMLElement | null
    /**
     * Get the element containing the code for a line from a code view given a line number.
     * @param codeView is the code view itself. For example, the <code> element on Sourcegraph or a <table> on GitHub.
     * @returns the element containing the code for the given line number or null if it can't be found.
     */
    getCodeElementFromLineNumber: (codeView: HTMLElement, line: number) => HTMLElement | null
    /**
     * Gets the line number for a given element containing code for a line.
     * @param codeElement is the element containing code for a line. When this function is called,
     * it will be passed the result of either `getCodeElementFromTarget` or `getCodeElementFromLineNumber`.
     * @returns the line number.
     */
    getLineNumberFromCodeElement: (codeElement: HTMLElement) => number
    /**
     * Determine whether a code element is from the old, new part of a diff or not part of a diff.
     * @param codeElement is the element containing a line of code.
     * @returns whether the line is `'base'`, `'head'` or `undefined` if both or not part of a diff.
     */
    getDiffPart?: (codeElement: HTMLElement) => DiffPart
}

/**
 * Like `convertNode`, but idempotent.
 * The CSS class `annotated` is used to check if the cell is already converted.
 *
 * @param cell The code `<td>` to convert.
 */
export function convertCodeElementIdempotent(element: HTMLElement): void {
    if (element && !element.classList.contains('annotated')) {
        convertNode(element)
        element.classList.add('annotated')
    }
}

/**
 * convertNode modifies a DOM node so that we can identify precisely token a user has clicked or hovered over.
 * On a code view, source code is typically wrapped in a HTML table cell. It may look like this:
 *
 *     <td id="LC18" class="blob-code blob-code-inner js-file-line">
 *        <#textnode>\t</#textnode>
 *        <span class="pl-k">return</span>
 *        <#textnode>&amp;Router{namedRoutes: </#textnode>
 *        <span class="pl-c1">make</span>
 *        <#textnode>(</#textnode>
 *        <span class="pl-k">map</span>
 *        <#textnode>[</#textnode>
 *        <span class="pl-k">string</span>
 *        <#textnode>]*Route), KeepContext: </#textnode>
 *        <span class="pl-c1">false</span>
 *        <#textnode>}</#textnode>
 *     </td>
 *
 * The browser extension works by registering a hover event listeners on the <td> element. When the user hovers over
 * "return" (in the first <span> node) the event target will be the <span> node. We can use the event target to determine which line
 * and which character offset on that line to use to fetch tooltip data. But when the user hovers over "Router"
 * (in the second text node) the event target will be the <td> node, which lacks the appropriate specificity to request
 * tooltip data. To circumvent this, all we need to do is wrap every free text node in a <span> tag.
 *
 * In summary, convertNode effectively does this: https://gist.github.com/lebbe/6464236
 *
 * There are three additional edge cases we handle:
 *   1. some text nodes contain multiple discrete code tokens, like the second text node in the example above; by wrapping
 *     that text node in a <span> we lose the ability to distinguish whether the user is hovering over "Router" or "namedRoutes".
 *   2. there may be arbitrary levels of <span> nesting; in the example above, every <span> node has only one (text node) child, but
 *     in reality a <span> node could have multiple children, both text and element nodes
 *   3. on GitHub diff views (e.g. pull requests) the table cell contains an additional prefix character ("+" or "-" or " ", representing
 *     additions, deletions, and unchanged code, respectively); we want to make sure we don't count that character when computing the
 *     character offset for the line
 *   4. TODO(john) some code hosts transform source code before rendering; in the example above, the first text node may be a tab character
 *     or multiple spaces
 *
 * @param parentNode The node to convert.
 */
export function convertNode(parentNode: HTMLElement): void {
    for (let i = 0; i < parentNode.childNodes.length; ++i) {
        const node = parentNode.childNodes[i]
        const isLastNode = i === parentNode.childNodes.length - 1

        if (node.nodeType === Node.TEXT_NODE) {
            let nodeText = unescape(node.textContent || '')
            if (nodeText === '') {
                continue
            }
            parentNode.removeChild(node)
            let insertBefore = i

            while (true) {
                const nextToken = consumeNextToken(nodeText)
                if (nextToken === '') {
                    break
                }
                const newTextNode = document.createTextNode(nextToken)
                const newTextNodeWrapper = document.createElement('SPAN')
                newTextNodeWrapper.appendChild(newTextNode)
                if (isLastNode) {
                    parentNode.appendChild(newTextNodeWrapper)
                } else {
                    // increment insertBefore as new span-wrapped text nodes are added
                    parentNode.insertBefore(newTextNodeWrapper, parentNode.childNodes[insertBefore++])
                }
                nodeText = nodeText.substr(nextToken.length)
            }
        } else if (node.nodeType === Node.ELEMENT_NODE) {
            const elementNode = node as HTMLElement
            if (elementNode.children.length > 0 || (elementNode.textContent && elementNode.textContent.trim().length)) {
                convertNode(elementNode)
            }
        }
    }
}

const VARIABLE_TOKENIZER = /(^\w+)/
const ASCII_CHARACTER_TOKENIZER = /(^[\x21-\x2F|\x3A-\x40|\x5B-\x60|\x7B-\x7E])/
const NONVARIABLE_TOKENIZER = /(^[^\x21-\x7E]+)/

/**
 * consumeNextToken parses the text content of a text node and returns the next "distinct"
 * code token. It handles edge case #1 from convertNode(). The tokenization scheme is
 * heuristic-based and uses simple regular expressions.
 * @param txt Aribitrary text to tokenize.
 */
function consumeNextToken(txt: string): string {
    if (txt.length === 0) {
        return ''
    }

    // first, check for real stuff, i.e. sets of [A-Za-z0-9_]
    const variableMatch = txt.match(VARIABLE_TOKENIZER)
    if (variableMatch) {
        return variableMatch[0]
    }
    // next, check for tokens that are not variables, but should stand alone
    // i.e. {}, (), :;. ...
    const asciiMatch = txt.match(ASCII_CHARACTER_TOKENIZER)
    if (asciiMatch) {
        return asciiMatch[0]
    }
    // finally, the remaining tokens we can combine into blocks, since they are whitespace
    // or UTF8 control characters. We had better clump these in case UTF8 control bytes
    // require adjacent bytes
    const nonVariableMatch = txt.match(NONVARIABLE_TOKENIZER)
    if (nonVariableMatch) {
        return nonVariableMatch[0]
    }
    return txt[0]
}

/**
 * Returns the <span> (descendent of a <td> containing code) which contains text beginning
 * at the specified character offset (1-indexed).
 * Will convert tokens in the code cell if needed.
 *
 * @param codeElement the element containing syntax highlighted code
 * @param offset character offset (1-indexed)
 */
export function findElementWithOffset(codeElement: HTMLElement, offset: number): HTMLElement | undefined {
    // Without being converted first, finding the position is inaccurate
    convertCodeElementIdempotent(codeElement)

    let currOffset = 0
    const walkNode = (currNode: HTMLElement): HTMLElement | undefined => {
        const numChildNodes = currNode.childNodes.length
        for (let i = 0; i < numChildNodes; ++i) {
            const child = currNode.childNodes[i]
            switch (child.nodeType) {
                case Node.TEXT_NODE:
                    if (currOffset < offset && currOffset + child.textContent!.length >= offset) {
                        return currNode
                    }
                    currOffset += child.textContent!.length
                    continue

                case Node.ELEMENT_NODE:
                    const found = walkNode(child as HTMLElement)
                    if (found) {
                        return found
                    }
                    continue
            }
        }
        return undefined
    }
    return walkNode(codeElement)
}

/**
 * Returned when only the line is known.
 *
 * 1-indexed
 */
interface Line {
    line: number
}

export interface HoveredToken {
    /** 1-indexed */
    line: number
    /** 1-indexed */
    character: number
    part: DiffPart
}

interface LocateTargetOptions extends DOMFunctions {
    ignoreFirstChar?: boolean
}

/**
 * Determines the line and character offset for some source code, identified by its HTMLElement wrapper.
 * It works by traversing the DOM until the HTMLElement's TD ancestor. Once the ancestor is found, we traverse the DOM again
 * (this time the opposite direction) counting characters until the original target is found.
 * Returns undefined if line/char cannot be determined for the provided target.
 * @param target The element to compute line & character offset for.
 * @param ignoreFirstChar Whether to ignore the first character on a line when computing character offset.
 */
export function locateTarget(
    target: HTMLElement,
    { ignoreFirstChar, getCodeElementFromTarget, getDiffPart, getLineNumberFromCodeElement }: LocateTargetOptions
): Line | HoveredToken | undefined {
    const codeElement = getCodeElementFromTarget(target)

    if (!codeElement) {
        // Make sure we're looking at an element we've annotated line number for (otherwise we have no idea )
        return undefined
    }

    const line = getLineNumberFromCodeElement(codeElement)
    const part = getDiffPart && getDiffPart(codeElement)

    let character = 1
    // Iterate recursively over the current target's children until we find the original target;
    // count characters along the way. Return true if the original target is found.
    function findOrigTarget(root: HTMLElement): boolean {
        if (root === target) {
            return true
        }
        // tslint:disable-next-line
        for (let i = 0; i < root.childNodes.length; ++i) {
            const child = root.childNodes[i] as HTMLElement
            if (child === target) {
                return true
            }
            if (child.children === undefined) {
                character += child.textContent!.length
                continue
            }
            if (child.children.length > 0 && findOrigTarget(child)) {
                // Walk over nested children, then short-circuit the loop to avoid double counting children.
                return true
            }
            if (child.children.length === 0) {
                // Child is not the original target, but has no chidren to recurse on. Add to character offset.
                character += (child.textContent as string).length // TODO(john): I think this needs to be escaped before we add its length...
                if (ignoreFirstChar) {
                    character -= 1 // make sure not to count weird diff prefix
                    ignoreFirstChar = false
                }
            }
        }
        return false
    }
    // Start recursion.
    if (findOrigTarget(codeElement)) {
        return { line, character, part }
    }
    return { line }
}

interface GetCodeElementsInRangeOptions extends DOMFunctions {
    position?: LineOrPositionOrRange
}

export const getCodeElementsInRange = (
    codeElement: HTMLElement,
    { position, getCodeElementFromLineNumber }: GetCodeElementsInRangeOptions
): {
    /** 1-indexed line number */
    line: number
    /** The element containing the code */
    element: HTMLElement
}[] => {
    if (!position || position.line === undefined) {
        return []
    }

    const elements: { line: number; element: HTMLElement }[] = []
    for (let line = position.line; line <= (position.endLine || position.line); line++) {
        const element = getCodeElementFromLineNumber(codeElement, position.line)
        if (!element) {
            break
        }
        elements.push({ line, element })
    }
    return elements
}

/**
 * Returns the token `<span>` element in a code view for a given 1-indexed position.
 *
 * @param codeView The code view
 * @param position 1-indexed position
 */
export const getTokenAtPosition = (
    codeView: HTMLElement,
    position: Position,
    options: DOMFunctions
): HTMLElement | undefined => {
    const codeCell = options.getCodeElementFromLineNumber(codeView, position.line)
    if (!codeCell) {
        return undefined
    }

    return findElementWithOffset(codeCell, position.character)
}
