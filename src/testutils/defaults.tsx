import * as React from 'react'
import { Subject } from 'rxjs'
import { map, tap, withLatestFrom } from 'rxjs/operators'
import { DOM } from './dom'

import { HoverOverlay, HoverOverlayProps } from '../HoverOverlay'

interface DefaultHoverOverlayProps {
    dom: DOM
}

const Link: React.ComponentType<{ to: string }> = (props: { to: string; children?: React.ReactNode }) => (
    <a href={props.to}>{props.children}</a>
)

const noop = () => undefined

export const createDefaultHoverOverlay = (props: DefaultHoverOverlayProps) => {
    const refs = new Subject<HTMLElement>()

    const overlayProps: HoverOverlayProps = {
        hoverOrError: undefined,
        definitionURLOrError: undefined,
        overlayPosition: undefined,
        hoverRef: (a: HTMLElement | null) => {
            if (a) {
                refs.next(a)
            }
        },
        hoveredToken: undefined,
        showCloseButton: false,
        linkComponent: Link,
        onGoToDefinitionClick: noop,
        onCloseButtonClick: noop,
        logTelemetryEvent: noop,
    }

    const updates = new Subject<
        Pick<HoverOverlayProps, Exclude<keyof HoverOverlayProps, 'linkComponent' | 'logTelemetryEvent'>>
    >()

    const rerenders = new Subject()

    const { rerender, unmount } = props.dom.render(<HoverOverlay {...overlayProps} />)

    updates.subscribe(newProps => {
        if (newProps) {
            rerender(<HoverOverlay {...overlayProps} {...newProps} />)
            rerenders.next()
        }
    })

    return {
        update: (
            newProps: Pick<HoverOverlayProps, Exclude<keyof HoverOverlayProps, 'linkComponent' | 'logTelemetryEvent'>>
        ) => updates.next(newProps),
        unmount,
        refs,
        rerenders: rerenders.pipe(
            withLatestFrom(refs),
            map(([, hoverOverlayElement]) => ({
                hoverOverlayElement,
                scrollElement: document.scrollingElement as HTMLElement,
            }))
        ),
    }
}
