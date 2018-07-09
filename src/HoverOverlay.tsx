import Loader from '@sourcegraph/icons/lib/Loader'
import { castArray, upperFirst } from 'lodash'
import AlertCircleOutlineIcon from 'mdi-react/AlertCircleOutlineIcon'
import CloseIcon from 'mdi-react/CloseIcon'
import InformationOutlineIcon from 'mdi-react/InformationOutlineIcon'
import * as React from 'react'
import { Observable, Subject, Subscription } from 'rxjs'
import { distinctUntilChanged, filter, switchMap } from 'rxjs/operators'
import { MarkedString, MarkupContent, MarkupKind } from 'vscode-languageserver-types'
import { asError, ErrorLike, isErrorLike } from './errors'
import { highlightCodeSafe, isDefined, renderMarkdown } from './helpers'
import { HoveredTokenContext } from './hoverifier'
import { calculateOverlayPosition } from './overlay_position'
import { HoveredToken } from './token_position'
import { HoverMerged, LOADING } from './types'
import { toPrettyBlobURL } from './url'

/**
 * Uses a placeholder `<button>` or a React Router `<Link>` depending on whether `to` is set.
 */
const ButtonOrLink: React.StatelessComponent<
    { linkComponent: React.ComponentType<{ to: string }>; to?: string } & React.HTMLAttributes<HTMLElement>
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
    // overlayPosition?: { left: number; top: number }
    hoveredTokenClientRect?: ClientRect

    scrollableElements: Observable<HTMLElement>

    /** A ref callback to get the root overlay element. Use this to calculate the position. */
    // hoverRef?: React.Ref<HTMLDivElement>

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

    logTelemetryEvent: (event: string, data?: any) => void
}

interface HoverOverlayState {
    scrollableScrollTop?: number
    scrollableClientRect?: ClientRect
    tooltipClientRect?: ClientRect
}

/** Returns true if the input is successful jump URL result */
export const isJumpURL = (val: any): val is { jumpURL: string } =>
    val && typeof val === 'object' && typeof val.jumpURL === 'string'

export class HoverOverlay extends React.PureComponent<HoverOverlayProps, HoverOverlayState> {
    public state: HoverOverlayState = {}

    private subscriptions = new Subscription()

    private componentUpdates = new Subject<HoverOverlayProps>()
    private tooltipElements = new Subject<HTMLElement | null>()

    constructor(props: HoverOverlayProps) {
        super(props)

        this.subscriptions.add(
            this.componentUpdates
                .pipe(
                    distinctUntilChanged(),
                    switchMap(props => props.scrollableElements)
                )
                .subscribe(scrollable =>
                    this.setState({
                        scrollableScrollTop: scrollable.scrollTop,
                        scrollableClientRect: scrollable.getBoundingClientRect(),
                    })
                )
        )

        this.subscriptions.add(
            this.tooltipElements.pipe(filter(isDefined)).subscribe(tooltip =>
                this.setState({
                    tooltipClientRect: tooltip.getBoundingClientRect(),
                })
            )
        )
    }

    public render(): React.ReactNode {
        return (
            <div
                className="hover-overlay card"
                ref={ref => this.tooltipElements.next(ref)}
                // tslint:disable-next-line:jsx-ban-props needed for dynamic styling
                style={
                    this.props.hoveredTokenClientRect &&
                    this.state.scrollableClientRect &&
                    this.state.scrollableScrollTop &&
                    this.state.tooltipClientRect
                        ? {
                              opacity: 1,
                              visibility: 'visible',
                              ...calculateOverlayPosition(
                                  this.state.scrollableClientRect,
                                  this.state.scrollableScrollTop,
                                  this.props.hoveredTokenClientRect,
                                  this.state.tooltipClientRect
                              ),
                          }
                        : {
                              opacity: 0,
                              visibility: 'hidden',
                          }
                }
            >
                {this.props.showCloseButton && (
                    <button
                        className="hover-overlay__close-button btn btn-icon"
                        onClick={this.props.onCloseButtonClick}
                    >
                        <CloseIcon className="icon-inline" />
                    </button>
                )}
                {this.props.hoverOrError && (
                    <div className="hover-overlay__contents">
                        {this.props.hoverOrError === LOADING ? (
                            <div className="hover-overlay__row hover-overlay__loader-row">
                                <Loader className="icon-inline" />
                            </div>
                        ) : isErrorLike(this.props.hoverOrError) ? (
                            <div className="hover-overlay__row hover-overlay__hover-error lert alert-danger">
                                <h4>
                                    <AlertCircleOutlineIcon className="icon-inline" /> Error fetching hover from
                                    language server:
                                </h4>
                                {upperFirst(this.props.hoverOrError.message)}
                            </div>
                        ) : (
                            // tslint:disable-next-line deprecation We want to handle the deprecated MarkedString
                            castArray<MarkedString | MarkupContent>(this.props.hoverOrError.contents)
                                .map(
                                    value => (typeof value === 'string' ? { kind: MarkupKind.Markdown, value } : value)
                                )
                                .map((content, i) => {
                                    if (MarkupContent.is(content)) {
                                        if (content.kind === MarkupKind.Markdown) {
                                            try {
                                                return (
                                                    <div
                                                        className="hover-overlay__content hover-overlay__row e2e-tooltip-content"
                                                        key={i}
                                                        dangerouslySetInnerHTML={{
                                                            __html: renderMarkdown(content.value),
                                                        }}
                                                    />
                                                )
                                            } catch (err) {
                                                return (
                                                    <div className="hover-overlay__row alert alert-danger">
                                                        <strong>
                                                            <AlertCircleOutlineIcon className="icon-inline" /> Error
                                                            rendering hover content
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
                        linkComponent={this.props.linkComponent}
                        to={
                            isJumpURL(this.props.definitionURLOrError)
                                ? this.props.definitionURLOrError.jumpURL
                                : undefined
                        }
                        className="btn btn-secondary hover-overlay__action e2e-tooltip-j2d"
                        onClick={this.props.onGoToDefinitionClick}
                    >
                        Go to definition{' '}
                        {this.props.definitionURLOrError === LOADING && <Loader className="icon-inline" />}
                    </ButtonOrLink>
                    <ButtonOrLink
                        linkComponent={this.props.linkComponent}
                        // tslint:disable-next-line:jsx-no-lambda
                        onClick={() => this.props.logTelemetryEvent('FindRefsClicked')}
                        to={
                            this.props.hoveredToken &&
                            toPrettyBlobURL({
                                repoPath: this.props.hoveredToken.repoPath,
                                rev: this.props.hoveredToken.rev,
                                filePath: this.props.hoveredToken.filePath,
                                position: this.props.hoveredToken,
                                viewState: 'references',
                            })
                        }
                        className="btn btn-secondary hover-overlay__action e2e-tooltip-find-refs"
                    >
                        Find references
                    </ButtonOrLink>
                    <ButtonOrLink
                        linkComponent={this.props.linkComponent}
                        // tslint:disable-next-line:jsx-no-lambda
                        onClick={() => this.props.logTelemetryEvent('FindImplementationsClicked')}
                        to={
                            this.props.hoveredToken &&
                            toPrettyBlobURL({
                                repoPath: this.props.hoveredToken.repoPath,
                                rev: this.props.hoveredToken.rev,
                                filePath: this.props.hoveredToken.filePath,
                                position: this.props.hoveredToken,
                                viewState: 'impl',
                            })
                        }
                        className="btn btn-secondary hover-overlay__action e2e-tooltip-find-impl"
                    >
                        Find implementations
                    </ButtonOrLink>
                </div>
                {this.props.definitionURLOrError === null ? (
                    <div className="alert alert-info hover-overlay__alert-below">
                        <InformationOutlineIcon className="icon-inline" /> No definition found
                    </div>
                ) : (
                    isErrorLike(this.props.definitionURLOrError) && (
                        <div className="alert alert-danger hover-overlay__alert-below">
                            <strong>
                                <AlertCircleOutlineIcon className="icon-inline" /> Error finding definition:
                            </strong>{' '}
                            {upperFirst(this.props.definitionURLOrError.message)}
                        </div>
                    )
                )}
            </div>
        )
    }
}
