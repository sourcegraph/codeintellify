import * as path from 'path'
import { Configuration, SourceMapDevToolPlugin } from 'webpack'

const config: Configuration = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
    devtool: 'inline-source-map',
    module: {
        rules: [
            {
                test: /\.html$/,
                use: { loader: 'raw-loader' },
                exclude: /node_modules/,
            },
            {
                test: /\.tsx?$/,
                use: 'awesome-typescript-loader',
                exclude: /node_modules/,
            },
            {
                test: /src\/.*\.tsx?$/,
                exclude: /(node_modules|\.test\.tsx?$|\.d.ts$)/,
                loader: 'istanbul-instrumenter-loader',
                include: path.resolve(__dirname, 'src'),
                enforce: 'post',
                options: {
                    esModules: true,
                },
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js', '.html'],
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
        library: ['react-annotator', '[name]'],
        libraryTarget: 'umd',
    },
    plugins: [
        new SourceMapDevToolPlugin({
            filename: null,
            test: /\.(ts|js)($|\?)/i,
        }),
    ],
}

export default config
