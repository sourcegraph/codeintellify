import { LoadingSpinner } from '@sourcegraph/react-loading-spinner'
import { upperFirst } from 'lodash'
import AlertCircleOutlineIcon from 'mdi-react/AlertCircleOutlineIcon'
import CloseIcon from 'mdi-react/CloseIcon'
import InformationOutlineIcon from 'mdi-react/InformationOutlineIcon'
import * as React from 'react'
import { ErrorLike, isErrorLike } from './errors'
import { toNativeEvent } from './helpers'
import { HoveredToken } from './token_position'
import { HoverAttachment, LOADING } from './types'

/**
 * The component used to render an action.
 *
 * @template A The type of an action.
 */
export type ActionComponent<A> = React.ComponentType<A & React.HTMLAttributes<HTMLElement>>

/**
 * @template C Extra context for the hovered token.
 * @template D The type of the hover content data.
 * @template A The type of an action.
 */
export interface HoverOverlayProps<C extends object, D, A> {
    /** What to show as contents */
    hoverOrError?: typeof LOADING | (HoverAttachment & D) | null | ErrorLike // TODO disallow null and undefined

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

    /**
     * Actions to display as buttons or links in the hover.
     */
    actionsOrError?: typeof LOADING | A[] | null | ErrorLike

    /** An optional class name to apply to the outermost element of the HoverOverlay */
    className?: string

    /** Called when the close button is clicked */
    onCloseButtonClick?: (event: MouseEvent) => void
}

const transformMouseEvent = (handler: (event: MouseEvent) => void) => (event: React.MouseEvent<HTMLElement>) =>
    handler(toNativeEvent(event))

/**
 * @template C Extra context for the hovered token.
 * @template D The type of the hover content data.
 * @template A The type of an action.
 */
export const HoverOverlay: <C extends object, D, A>(
    props: HoverOverlayProps<C, D, A> & {
        /** The content of the hover overlay. */
        children?: React.ReactNode | React.ReactNode[]

        /** The component used to render actions. */
        actionComponent: ActionComponent<A>
    }
) => React.ReactElement<any> = ({
    hoverOrError,
    hoverRef,
    children,
    onCloseButtonClick,
    overlayPosition,
    showCloseButton,
    actionsOrError,
    actionComponent: ActionComponent,
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
        <div className="hover-overlay__contents">
            {hoverOrError === LOADING ? (
                <div className="hover-overlay__row hover-overlay__loader-row">
                    <LoadingSpinner className="icon-inline" />
                </div>
            ) : isErrorLike(hoverOrError) ? (
                <div className="hover-overlay__row hover-overlay__hover-error alert alert-danger">
                    <h4>
                        <AlertCircleOutlineIcon className="icon-inline" /> Error fetching hover from language server:
                    </h4>
                    {upperFirst(hoverOrError.message)}
                </div>
            ) : (
                children
            )}
        </div>
        {actionsOrError === null ? (
            <div className="alert alert-info hover-overlay__alert-below">
                <InformationOutlineIcon className="icon-inline" /> No definition found
            </div>
        ) : isErrorLike(actionsOrError) ? (
            <div className="alert alert-danger hover-overlay__alert-below">
                <strong>
                    <AlertCircleOutlineIcon className="icon-inline" /> Error finding definition:
                </strong>{' '}
                {upperFirst(actionsOrError.message)}
            </div>
        ) : (
            actionsOrError !== undefined &&
            actionsOrError !== LOADING && (
                <div className="hover-overlay__actions hover-overlay__row">
                    {actionsOrError.map((action, i) => (
                        <ActionComponent key={i} {...action} />
                    ))}
                </div>
            )
        )}
    </div>
)
