// @ts-check

const path = require('path')
const webpack = require('webpack')

/**
 * @type {import('webpack').Configuration}
 */
const config = {
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
    new webpack.SourceMapDevToolPlugin({
      filename: null,
      test: /\.(ts|js)($|\?)/i,
    }),
  ],
}

module.exports = config
