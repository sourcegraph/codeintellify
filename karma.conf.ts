import { Config, ConfigOptions } from 'karma'
import webpackConfig from './webpack.test.config'

export default (config: Config): void => {
    config.set({
        frameworks: ['mocha', 'chai', 'sinon'],

        files: [
            {
                pattern: 'src/**/*.ts',
                watched: false,
                included: true,
                served: true,
            },
            {
                pattern: 'src/**/*.tsx',
                watched: false,
                included: true,
                served: true,
            },
        ],
        preprocessors: {
            'src/**/*.ts?(x)': ['webpack', 'sourcemap'],
        },

        // Ignore the npm package entry point
        exclude: ['src/index.ts'],

        // karma-webpack doesn't change the file extensions so we just need to tell karma what these extensions mean.
        mime: {
            'text/x-typescript': ['ts', 'tsx'],
        },

        webpack: webpackConfig,

        webpackMiddleware: {
            stats: 'errors-only',
            bail: true,
        },

        browsers: ['Chrome', 'Firefox'],
        customLaunchers: {
            ChromeHeadlessNoSandbox: {
                base: 'ChromeHeadless',
                // CI runs as root so we need to disable sandbox
                flags: ['--no-sandbox', '--disable-setuid-sandbox'],
            },
        },

        reporters: ['mocha', 'coverage-istanbul'],
        mochaReporter: {
            showDiff: true,
        },
        coverageIstanbulReporter: {
            reports: ['json'],
            fixWebpackSourcePaths: true,
        },
    } as ConfigOptions)
}
