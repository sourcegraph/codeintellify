import assert from 'assert'
import { highlightCodeSafe } from './helpers'

describe('helpers', () => {
    describe('highlightCodeSafe()', () => {
        it('escapes HTML and does not attempt to highlight plaintext', () => {
            assert.strictEqual(highlightCodeSafe('foo<"bar>', 'plaintext'), 'foo&lt;"bar&gt;')
        })
    })
})
