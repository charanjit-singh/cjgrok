const path = require("path");
const CopyPlugin = require("copy-webpack-plugin");
const Dotenv = require("dotenv-webpack");

module.exports = {
  mode: process.env.NODE_ENV === "production" ? "production" : "development",
  watch: process.env.NODE_ENV !== "production",
  devtool: process.env.NODE_ENV === "production" ? false : "inline-source-map",
  watchOptions: {
    ignored: /node_modules|dist/,
  },
  entry: {
    inject: path.resolve(__dirname, "..", "src", "inject.ts"),
    background: path.resolve(__dirname, "..", "src", "background.ts"),
  },
  output: {
    path: path.join(__dirname, "../dist"),
    filename: "[name].js",
  },
  resolve: {
    extensions: [".ts", ".js"],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: "ts-loader",
        exclude: /node_modules/,
      },
      {
        test: /\.css$/i,
        include: path.resolve(__dirname, "..", "src"),
        use: ["style-loader", "css-loader", "postcss-loader"],
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: ".", to: ".", context: "public" }],
    }),
    new Dotenv(),
  ],
};
