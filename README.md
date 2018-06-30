# CodeIntellify

[![build](https://badge.buildkite.com/da1855cc6c9b02ddfa1df69599aacecd1317db8f6765edfa8b.svg?branch=master)](https://buildkite.com/sourcegraph/codeintellify)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

> Adds code intelligence to code views on the web

## API

Use in React TODO

Use with native DOM TODO

## Development

```shell
npm i
npm test
```

Development is done by running tests. [Karma](https://github.com/karma-runner/karma) is used to run
[Mocha](https://github.com/mochajs/mocha) tests in the browser. You can debug by opening http://localhost:9876/debug.html in
a browser while the test running is active.

All tests are ran against DOM that is generated to match the DOM used by the supported code hosts.
