import { Position, Range } from 'vscode-languageserver-types'

export interface RepoSpec {
    /**
     * Example: github.com/gorilla/mux
     */
    repoPath: string
}

export interface RevSpec {
    /**
     * a revision string (like 'master' or 'my-branch' or '24fca303ac6da784b9e8269f724ddeb0b2eea5e7')
     */
    rev: string
}

export interface ResolvedRevSpec {
    /**
     * a 40 character commit SHA
     */
    commitID: string
}

export interface FileSpec {
    /**
     * a path to a directory or file
     */
    filePath: string
}

export interface PositionSpec {
    /**
     * a 1-indexed point in the blob
     */
    position: Position
}

export interface RangeSpec {
    /**
     * a 1-indexed range in the blob
     */
    range: Range
}

export type BlobViewState = 'references' | 'references:external' | 'impl'

export interface ViewStateSpec {
    /**
     * The view state (for the blob panel).
     */
    viewState: BlobViewState
}

/**
 * 'code' for Markdown/rich-HTML files rendered as code, 'rendered' for rendering them as
 * Markdown/rich-HTML, undefined for the default for the file type ('rendered' for Markdown, etc.,
 * 'code' otherwise).
 */
export type RenderMode = 'code' | 'rendered' | undefined

export interface RenderModeSpec {
    /**
     * How the file should be rendered.
     */
    renderMode: RenderMode
}

/**
 * A file in a repo
 */
export interface RepoFile extends RepoSpec, RevSpec, Partial<ResolvedRevSpec>, FileSpec {}

function toRenderModeQuery(ctx: Partial<RenderModeSpec>): string {
    if (ctx.renderMode === 'code') {
        return '?view=code'
    }
    return ''
}

/**
 * Represents a line, a position, a line range, or a position range. It forbids
 * just a character, or a range from a line to a position or vice versa (such as
 * "L1-2:3" or "L1:2-3"), none of which would make much sense.
 *
 * 1-indexed.
 */
export type LineOrPositionOrRange =
    | { line?: undefined; character?: undefined; endLine?: undefined; endCharacter?: undefined }
    | { line: number; character?: number; endLine?: undefined; endCharacter?: undefined }
    | { line: number; character?: undefined; endLine?: number; endCharacter?: undefined }
    | { line: number; character: number; endLine: number; endCharacter: number }

/**
 * @param ctx 1-indexed partial position or range spec
 */
export function toPositionOrRangeHash(ctx: {
    position?: { line: number; character?: number }
    range?: { start: { line: number; character?: number }; end: { line: number; character?: number } }
}): string {
    if (ctx.range) {
        const emptyRange =
            ctx.range.start.line === ctx.range.end.line && ctx.range.start.character === ctx.range.end.character
        return (
            '#L' +
            (emptyRange
                ? toPositionHashComponent(ctx.range.start)
                : `${toPositionHashComponent(ctx.range.start)}-${toPositionHashComponent(ctx.range.end)}`)
        )
    }
    if (ctx.position) {
        return '#L' + toPositionHashComponent(ctx.position)
    }
    return ''
}

/**
 * @param ctx 1-indexed partial position
 */
function toPositionHashComponent(position: { line: number; character?: number }): string {
    return position.line.toString() + (position.character ? ':' + position.character : '')
}

/** Encodes a repository at a revspec for use in a URL. */
export function encodeRepoRev(repo: string, rev?: string): string {
    return rev ? `${repo}@${escapeRevspecForURL(rev)}` : repo
}

/**
 * Encodes rev with encodeURIComponent, except that slashes ('/') are preserved,
 * because they are not ambiguous in any of the current places where used, and URLs
 * for (e.g.) branches with slashes look a lot nicer with '/' than '%2F'.
 */
export function escapeRevspecForURL(rev: string): string {
    return encodeURIComponent(rev).replace(/%2F/g, '/')
}

export function toViewStateHashComponent(viewState: string | undefined): string {
    return viewState ? `&tab=${viewState}` : ''
}

export function toPrettyBlobURL(
    ctx: RepoFile & Partial<PositionSpec> & Partial<ViewStateSpec> & Partial<RangeSpec> & Partial<RenderModeSpec>
): string {
    return `/${encodeRepoRev(ctx.repoPath, ctx.rev)}/-/blob/${ctx.filePath}${toRenderModeQuery(
        ctx
    )}${toPositionOrRangeHash(ctx)}${toViewStateHashComponent(ctx.viewState)}`
}
