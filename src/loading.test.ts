import { TestScheduler } from 'rxjs/testing'
import { emitLoading, LOADING, MaybeLoadingResult } from './loading'

const inputAlphabet: Record<'l' | 'e' | 'r', MaybeLoadingResult<number | null>> = {
    // loading
    l: { isLoading: true, result: null },
    // empty
    e: { isLoading: false, result: null },
    // result
    r: { isLoading: false, result: 1 },
}

const outputAlphabet = {
    // undefined
    u: undefined,
    // empty
    e: null,
    // loading
    l: LOADING,
    // result
    r: inputAlphabet.r.result,
}

describe('emitLoading()', () => {
    it('emits an empty result if the source emits an empty result before the loader delay', () => {
        const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))
        scheduler.run(({ cold, expectObservable }) => {
            const source = cold('l 10ms e', inputAlphabet)
            expectObservable(source.pipe(emitLoading(300, null))).toBe('u 10ms e', outputAlphabet)
        })
    })
    it('emits a loader if the source has not emitted after the loader delay', () => {
        const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))
        scheduler.run(({ cold, expectObservable }) => {
            const source = cold('400ms r', inputAlphabet)
            expectObservable(source.pipe(emitLoading(300, null))).toBe('u 299ms l 99ms r', outputAlphabet)
        })
    })
    it('emits a loader if the source has not emitted a result after the loader delay', () => {
        const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))
        scheduler.run(({ cold, expectObservable }) => {
            const source = cold('l 400ms r', inputAlphabet)
            expectObservable(source.pipe(emitLoading(300, null))).toBe('u 299ms l 100ms r', outputAlphabet)
        })
    })
    it('emits a loader if the source first emits an empty result, but then starts loading again', () => {
        const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))
        scheduler.run(({ cold, expectObservable }) => {
            const source = cold('e 10ms l 400ms r', inputAlphabet)
            expectObservable(source.pipe(emitLoading(300, null))).toBe('(ue) 296ms l 111ms r', outputAlphabet)
        })
    })
    it('emits a loader if the source first emits an empty result, but then starts loading again after the loader delay already passed', () => {
        const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))
        scheduler.run(({ cold, expectObservable }) => {
            const source = cold('e 400ms l 400ms r', inputAlphabet)
            expectObservable(source.pipe(emitLoading(300, null))).toBe('(ue) 397ms l 400ms r', outputAlphabet)
        })
    })
    it('hides the loader when the source emits an empty result', () => {
        const scheduler = new TestScheduler((a, b) => chai.assert.deepEqual(a, b))
        scheduler.run(({ cold, expectObservable }) => {
            const source = cold('l 400ms e', inputAlphabet)
            expectObservable(source.pipe(emitLoading(300, null))).toBe('u 299ms l 100ms e', outputAlphabet)
        })
    })
})
