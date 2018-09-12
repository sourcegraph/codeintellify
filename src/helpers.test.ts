// Bring in all languages for testing
import 'highlight.js'

import assert from 'assert'
import { highlightCodeSafe, renderMarkdown } from './helpers'

describe('helpers', () => {
    describe('highlightCodeSafe()', () => {
        it('escapes HTML and does not attempt to highlight plaintext', () => {
            assert.strictEqual(highlightCodeSafe('foo<"bar>', 'plaintext'), 'foo&lt;"bar&gt;')
        })
    })
    describe('renderMarkdown()', () => {
        it('renders markdown and sanitizes dangerous elements', () => {
            const markdown = 'You have been <script>alert("Pwned!")</script>'
            const rendered = renderMarkdown(markdown)
            assert.strictEqual(rendered, '<p>You have been </p>\n')
        })
        it('renders markdown without sanitizing syntax highlighting away', () => {
            const markdown = ['Example:', '```javascript', 'const foo = 123', '```'].join('\n')
            const rendered = renderMarkdown(markdown)
            assert.strictEqual(
                rendered,
                '<p>Example:</p>\n<pre><code class="language-javascript"><span class="hljs-keyword">const</span> foo = <span class="hljs-number">123</span></code></pre>\n'
            )
        })
    })
})
