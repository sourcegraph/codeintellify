import { LoadingSpinner } from '@sourcegraph/react-loading-spinner'
import { castArray, upperFirst } from 'lodash'
import AlertCircleOutlineIcon from 'mdi-react/AlertCircleOutlineIcon'
import CloseIcon from 'mdi-react/CloseIcon'
import InformationOutlineIcon from 'mdi-react/InformationOutlineIcon'
import * as React from 'react'
import { MarkedString, MarkupContent, MarkupKind } from 'vscode-languageserver-types'
import { asError, ErrorLike, isErrorLike } from './errors'
import { highlightCodeSafe, renderMarkdown, toNativeEvent } from './helpers'
import { HoveredToken } from './token_position'
import { HoverMerged, LOADING } from './types'

/** The component used to render a link */
export type LinkComponent = React.ComponentType<{ to: string } & React.HTMLAttributes<HTMLElement>>

/**
 * Uses a placeholder `<button>` or a React Router `<Link>` depending on whether `to` is set.
 */
const ButtonOrLink: React.StatelessComponent<
    { linkComponent: LinkComponent; to?: string } & React.HTMLAttributes<HTMLElement>
> = ({ linkComponent, to, children, ...rest }) => {
    const Link = linkComponent
    return to ? (
        <Link to={to} {...rest}>
            {children}
        </Link>
    ) : (
        <button {...rest}>{children}</button>
    )
}

/**
 * @template C Extra context for the hovered token.
 */
export interface HoverOverlayProps<C = {}> {
    /** What to show as contents */
    hoverOrError?: typeof LOADING | HoverMerged | null | ErrorLike // TODO disallow null and undefined

    /**
     * The URL to jump to on go to definition.
     * If loaded, is set as the href of the go to definition button.
     * If LOADING, a loader is displayed on the button.
     * If null, an info alert is displayed "no definition found".
     * If an error, an error alert is displayed with the error message.
     */
    definitionURLOrError?: typeof LOADING | { jumpURL: string } | null | ErrorLike

    /** The position of the tooltip (assigned to `style`) */
    overlayPosition?: { left: number; top: number }

    /** A ref callback to get the root overlay element. Use this to calculate the position. */
    hoverRef?: React.Ref<HTMLDivElement>

    /**
     * The hovered token (position and word).
     * Used for the Find References buttons and for error messages
     */
    hoveredToken?: HoveredToken & C

    /** Whether to show the close button for the hover overlay */
    showCloseButton: boolean

    /** The component used to render links */
    linkComponent: LinkComponent

    /** An optional class name to apply to the outermost element of the HoverOverlay */
    className?: string

    /** Called when the Go-to-definition button was clicked */
    onGoToDefinitionClick?: (event: MouseEvent) => void

    /** Called when the close button is clicked */
    onCloseButtonClick?: (event: MouseEvent) => void
}

/** Returns true if the input is successful jump URL result */
export const isJumpURL = (val: any): val is { jumpURL: string } =>
    val !== null && typeof val === 'object' && typeof val.jumpURL === 'string'

const transformMouseEvent = (handler: (event: MouseEvent) => void) => (event: React.MouseEvent<HTMLElement>) =>
    handler(toNativeEvent(event))

export const HoverOverlay: <C>(props: HoverOverlayProps<C>) => React.ReactElement<any> = ({
    definitionURLOrError,
    hoveredToken,
    hoverOrError,
    hoverRef,
    linkComponent,
    onCloseButtonClick,
    onGoToDefinitionClick,
    overlayPosition,
    showCloseButton,
    className = '',
}) => (
    <div
        className={`hover-overlay card ${className}`}
        ref={hoverRef}
        // tslint:disable-next-line:jsx-ban-props needed for dynamic styling
        style={
            overlayPosition
                ? {
                      opacity: 1,
                      visibility: 'visible',
                      left: overlayPosition.left + 'px',
                      top: overlayPosition.top + 'px',
                  }
                : {
                      opacity: 0,
                      visibility: 'hidden',
                  }
        }
    >
        {showCloseButton && (
            <button
                className="hover-overlay__close-button btn btn-icon"
                onClick={onCloseButtonClick ? transformMouseEvent(onCloseButtonClick) : undefined}
            >
                <CloseIcon className="icon-inline" />
            </button>
        )}

        {hoverOrError && (
            <div className="hover-overlay__contents">
                {hoverOrError === LOADING ? (
                    <div className="hover-overlay__row hover-overlay__loader-row">
                        <LoadingSpinner className="icon-inline" />
                    </div>
                ) : isErrorLike(hoverOrError) ? (
                    <div className="hover-overlay__row hover-overlay__hover-error alert alert-danger">
                        <h4>
                            <AlertCircleOutlineIcon className="icon-inline" /> Error fetching hover from language
                            server:
                        </h4>
                        {upperFirst(hoverOrError.message)}
                    </div>
                ) : (
                    // tslint:disable-next-line deprecation We want to handle the deprecated MarkedString
                    castArray<MarkedString | MarkupContent>(hoverOrError.contents)
                        .map(value => (typeof value === 'string' ? { kind: MarkupKind.Markdown, value } : value))
                        .map((content, i) => {
                            if (MarkupContent.is(content)) {
                                if (content.kind === MarkupKind.Markdown) {
                                    try {
                                        return (
                                            <div
                                                className="hover-overlay__content hover-overlay__row e2e-tooltip-content"
                                                key={i}
                                                dangerouslySetInnerHTML={{ __html: renderMarkdown(content.value) }}
                                            />
                                        )
                                    } catch (err) {
                                        return (
                                            <div className="hover-overlay__row alert alert-danger">
                                                <strong>
                                                    <AlertCircleOutlineIcon className="icon-inline" /> Error rendering
                                                    hover content
                                                </strong>{' '}
                                                {upperFirst(asError(err).message)}
                                            </div>
                                        )
                                    }
                                }
                                return content.value
                            }
                            return (
                                <code
                                    className="hover-overlay__content hover-overlay__row e2e-tooltip-content"
                                    key={i}
                                    dangerouslySetInnerHTML={{
                                        __html: highlightCodeSafe(content.value, content.language),
                                    }}
                                />
                            )
                        })
                )}
            </div>
        )}

        <div className="hover-overlay__actions hover-overlay__row">
            <ButtonOrLink
                linkComponent={linkComponent}
                to={isJumpURL(definitionURLOrError) ? definitionURLOrError.jumpURL : undefined}
                className="btn btn-secondary hover-overlay__action e2e-tooltip-j2d"
                onClick={onGoToDefinitionClick ? transformMouseEvent(onGoToDefinitionClick) : undefined}
            >
                Go to definition {definitionURLOrError === LOADING && <LoadingSpinner className="icon-inline" />}
            </ButtonOrLink>
        </div>
        {definitionURLOrError === null ? (
            <div className="alert alert-info hover-overlay__alert-below">
                <InformationOutlineIcon className="icon-inline" /> No definition found
            </div>
        ) : (
            isErrorLike(definitionURLOrError) && (
                <div className="alert alert-danger hover-overlay__alert-below">
                    <strong>
                        <AlertCircleOutlineIcon className="icon-inline" /> Error finding definition:
                    </strong>{' '}
                    {upperFirst(definitionURLOrError.message)}
                </div>
            )
        )}
    </div>
)
