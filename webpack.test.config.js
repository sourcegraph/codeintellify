const path = require('path')
const { CheckerPlugin } = require('awesome-typescript-loader')

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
        test: /\.(ts|tsx)$/,
        use: 'awesome-typescript-loader',
        exclude: /node_modules/,
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
  plugins: [new CheckerPlugin()],
}

module.exports = config
