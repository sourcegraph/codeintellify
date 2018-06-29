import { fromEvent, Observable, of, Subject, Subscription } from 'rxjs'
import { Position } from 'vscode-languageserver-types'

import { createHoverifier, HoverFetcher, JumpURLFetcher } from './hoverifier'
import { BlobProps, DOM } from './testutils/dom'
import { createHoverMerged } from './testutils/lsp'
import { clickPosition } from './testutils/mouse'

describe('Hoverifier', () => {
    const dom = new DOM()
    after(dom.cleanup)

    let testcases: BlobProps[] = []
    before(() => {
        testcases = dom.createBlobs()
    })

    it('can run in the test environment', () => {
        for (const blob of testcases) {
            const subscriptions = new Subscription()

            const fetchHover: HoverFetcher = () => of(createHoverMerged())
            const fetchJumpURL: JumpURLFetcher = () => of('def url')

            const hoverifier = createHoverifier({
                closeButtonClicks: new Observable<MouseEvent>(),
                goToDefinitionClicks: new Observable<MouseEvent>(),
                hoverOverlayElements: of(null),
                hoverOverlayRerenders: new Observable<{
                    hoverOverlayElement: HTMLElement
                    scrollElement: HTMLElement
                }>(),
                fetchHover,
                fetchJumpURL,
                pushHistory: (url: string) => console.log(url),
                logTelementryEvent: (eventLabel: string, eventProperties?: any) =>
                    console.log(eventLabel, eventProperties),
            })

            subscriptions.add(hoverifier)

            const resolveContext = () => blob.revSpec

            const positionJumps = new Subject<{
                position: Position
                codeElement: HTMLElement
                scrollElement: HTMLElement
            }>()

            const codeMouseMoves = fromEvent<MouseEvent>(blob.element, 'mousemove')
            const codeMouseOvers = fromEvent<MouseEvent>(blob.element, 'mouseover')
            const codeClicks = fromEvent<MouseEvent>(blob.element, 'click')

            subscriptions.add(
                hoverifier.hoverify({
                    codeMouseMoves,
                    codeMouseOvers,
                    codeClicks,
                    positionJumps,
                    resolveContext,
                })
            )

            subscriptions.add(hoverifier.hoverStateUpdates.subscribe(update => console.log(update)))

            // Click https://sourcegraph.sgdev.org/github.com/gorilla/mux@cb4698366aa625048f3b815af6a0dea8aef9280a/-/blob/mux.go#L24:6
            clickPosition(blob, {
                line: 24,
                character: 6,
            })
        }
    })
})
