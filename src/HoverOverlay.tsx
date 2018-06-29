import Loader from '@sourcegraph/icons/lib/Loader'
import { castArray, upperFirst } from 'lodash'
import marked from 'marked'
import AlertCircleOutlineIcon from 'mdi-react/AlertCircleOutlineIcon'
import CloseIcon from 'mdi-react/CloseIcon'
import InformationOutlineIcon from 'mdi-react/InformationOutlineIcon'
import * as React from 'react'
import { MarkedString, MarkupContent, MarkupKind } from 'vscode-languageserver-types/lib/umd/main'
import { asError, ErrorLike, isErrorLike } from './errors'
import { highlightCodeSafe } from './helpers'
import { HoveredTokenContext } from './hoverifier'
import { HoveredToken } from './token_position'
import { HoverMerged, LOADING } from './types'
import { toPrettyBlobURL } from './url'

/**
 * Uses a placeholder `<button>` or a React Router `<Link>` depending on whether `to` is set.
 */
const ButtonOrLink: React.StatelessComponent<
    { linkComponent: React.ComponentType<{ to: string }>; to?: string } & React.HTMLAttributes<HTMLElement>
> = props => {
    const { linkComponent, to, ...rest } = props
    const Link = props.linkComponent
    return to ? (
        <Link to={to} {...rest}>
            {props.children}
        </Link>
    ) : (
        <button {...rest}>{props.children}</button>
    )
}

export interface HoverOverlayProps {
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
     * Used for the Find References/Implementations buttons and for error messages
     */
    hoveredToken?: HoveredToken & HoveredTokenContext

    /** Whether to show the close button for the hover overlay */
    showCloseButton: boolean

    linkComponent: React.ComponentType<{ to: string }>

    /** Called when the Go-to-definition button was clicked */
    onGoToDefinitionClick?: (event: React.MouseEvent<HTMLElement>) => void

    /** Called when the close button is clicked */
    onCloseButtonClick?: (event: React.MouseEvent<HTMLElement>) => void

    logTelemetryEvent: (event: string) => void
}

/** Returns true if the input is successful jump URL result */
export const isJumpURL = (val: any): val is { jumpURL: string } =>
    val && typeof val === 'object' && typeof val.jumpURL === 'string'

export const HoverOverlay: React.StatelessComponent<HoverOverlayProps> = props => (
    <div
        className="hover-overlay card"
        ref={props.hoverRef}
        // tslint:disable-next-line:jsx-ban-props needed for dynamic styling
        style={
            props.overlayPosition
                ? {
                      opacity: 1,
                      visibility: 'visible',
                      left: props.overlayPosition.left + 'px',
                      top: props.overlayPosition.top + 'px',
                  }
                : {
                      opacity: 0,
                      visibility: 'hidden',
                  }
        }
    >
        {props.showCloseButton && (
            <button className="hover-overlay__close-button btn btn-icon" onClick={props.onCloseButtonClick}>
                <CloseIcon className="icon-inline" />
            </button>
        )}
        {props.hoverOrError && (
            <div className="hover-overlay__contents">
                {props.hoverOrError === LOADING ? (
                    <div className="hover-overlay__row hover-overlay__loader-row">
                        <Loader className="icon-inline" />
                    </div>
                ) : isErrorLike(props.hoverOrError) ? (
                    <div className="hover-overlay__row hover-overlay__hover-error lert alert-danger">
                        <h4>
                            <AlertCircleOutlineIcon className="icon-inline" /> Error fetching hover from language
                            server:
                        </h4>
                        {upperFirst(props.hoverOrError.message)}
                    </div>
                ) : (
                    // tslint:disable-next-line deprecation We want to handle the deprecated MarkedString
                    castArray<MarkedString | MarkupContent>(props.hoverOrError.contents)
                        .map(value => (typeof value === 'string' ? { kind: MarkupKind.Markdown, value } : value))
                        .map((content, i) => {
                            if (MarkupContent.is(content)) {
                                if (content.kind === MarkupKind.Markdown) {
                                    try {
                                        const rendered = marked(content.value, {
                                            gfm: true,
                                            breaks: true,
                                            sanitize: true,
                                            highlight: (code, language) =>
                                                '<code>' + highlightCodeSafe(code, language) + '</code>',
                                        })
                                        return (
                                            <div
                                                className="hover-overlay__content hover-overlay__row e2e-tooltip-content"
                                                key={i}
                                                dangerouslySetInnerHTML={{ __html: rendered }}
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
                linkComponent={props.linkComponent}
                to={isJumpURL(props.definitionURLOrError) ? props.definitionURLOrError.jumpURL : undefined}
                className="btn btn-secondary hover-overlay__action e2e-tooltip-j2d"
                onClick={props.onGoToDefinitionClick}
            >
                Go to definition {props.definitionURLOrError === LOADING && <Loader className="icon-inline" />}
            </ButtonOrLink>
            <ButtonOrLink
                linkComponent={props.linkComponent}
                // tslint:disable-next-line:jsx-no-lambda
                onClick={() => props.logTelemetryEvent('FindRefsClicked')}
                to={
                    props.hoveredToken &&
                    toPrettyBlobURL({
                        repoPath: props.hoveredToken.repoPath,
                        rev: props.hoveredToken.rev,
                        filePath: props.hoveredToken.filePath,
                        position: props.hoveredToken,
                        viewState: 'references',
                    })
                }
                className="btn btn-secondary hover-overlay__action e2e-tooltip-find-refs"
            >
                Find references
            </ButtonOrLink>
            <ButtonOrLink
                linkComponent={props.linkComponent}
                // tslint:disable-next-line:jsx-no-lambda
                onClick={() => props.logTelemetryEvent('FindImplementationsClicked')}
                to={
                    props.hoveredToken &&
                    toPrettyBlobURL({
                        repoPath: props.hoveredToken.repoPath,
                        rev: props.hoveredToken.rev,
                        filePath: props.hoveredToken.filePath,
                        position: props.hoveredToken,
                        viewState: 'impl',
                    })
                }
                className="btn btn-secondary hover-overlay__action e2e-tooltip-find-impl"
            >
                Find implementations
            </ButtonOrLink>
        </div>
        {props.definitionURLOrError === null ? (
            <div className="alert alert-info hover-overlay__alert-below">
                <InformationOutlineIcon className="icon-inline" /> No definition found
            </div>
        ) : (
            isErrorLike(props.definitionURLOrError) && (
                <div className="alert alert-danger hover-overlay__alert-below">
                    <strong>
                        <AlertCircleOutlineIcon className="icon-inline" /> Error finding definition:
                    </strong>{' '}
                    {upperFirst(props.definitionURLOrError.message)}
                </div>
            )
        )}
    </div>
)
