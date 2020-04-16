import { OperatorFunction, merge, combineLatest, of } from 'rxjs'
import { share, startWith, map, filter, mapTo, delay, endWith, scan } from 'rxjs/operators'
import { isEqual } from 'lodash'

export const LOADING = 'loading' as const

/**
 * An emission from a result provider.
 *
 * @template T The type of the result. Should typically include an empty value, or even an error type.
 */
export interface MaybeLoadingResult<T> {
    /**
     * Whether the result provider is currently getting a new result.
     */
    isLoading: boolean

    /**
     * The latest result.
     */
    result: T
}

/**
 * Handles input of MaybeLoadingResult (which contains both results and loading states) and returns a sequence of clear
 * instructions on when to show a loader, results or nothing.
 *
 * @param loaderDelay After how many milliseconds of no results a loader should be shown.
 * @param emptyResultValue The value that represents no results. This will be emitted, and also deep-compared to with `isEqual()`. Example: `null`, `[]`
 *
 * @template TResult The type of the provider result (without `TEmpty`).
 * @template TEmpty The type of the empty value, e.g. `null` or `[]`.
 */
export const emitLoading = <TResult, TEmpty>(
    loaderDelay: number,
    emptyResultValue: TEmpty
): OperatorFunction<MaybeLoadingResult<TResult | TEmpty>, TResult | TEmpty | typeof LOADING | undefined> => source => {
    const sharedSource = source.pipe(
        // Prevent a loading indicator to be shown forever if the source completes without a result.
        endWith<Partial<MaybeLoadingResult<TResult | TEmpty>>>({ isLoading: false }),
        scan<Partial<MaybeLoadingResult<TResult | TEmpty>>, MaybeLoadingResult<TResult | TEmpty>>(
            (previous, current) => ({ ...previous, ...current }),
            { isLoading: true, result: emptyResultValue }
        ),
        share()
    )
    return merge(
        // `undefined` is used here as opposed to `emptyResultValue` to distinguish between "no result" and the time
        // between invocation and when a loader is shown.
        // See for example "DEFERRED HOVER OVERLAY PINNING" in hoverifier.ts
        [undefined],
        // Show a loader if the provider is loading, has no result yet and hasn't emitted after LOADER_DELAY.
        // combineLatest() is used here to block on the loader delay.
        combineLatest([
            sharedSource.pipe(
                // Consider the provider loading initially.
                startWith({ isLoading: true, result: emptyResultValue })
            ),
            // Make sure LOADER_DELAY has passed since this token has been hovered
            // (no matter if the source has emitted already)
            of(null).pipe(delay(loaderDelay)),
        ]).pipe(
            // Show the loader when the provider is loading and has no result yet
            filter(([{ isLoading, result }]) => isLoading && isEqual(result, emptyResultValue)),
            mapTo(LOADING)
        ),
        // Show the provider results (and no more loader) once the source emitted the first result
        sharedSource.pipe(
            filter(({ isLoading, result }) => !isLoading || !isEqual(result, emptyResultValue)),
            map(({ result }) => result)
        )
    )
}
