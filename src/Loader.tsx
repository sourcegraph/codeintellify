import * as React from 'react'

export interface Props {
    className?: string
}

export const Loader: React.StatelessComponent<Props> = props => <div className={`loader ${props.className || ''}`} />
