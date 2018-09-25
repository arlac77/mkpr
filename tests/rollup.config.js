import multiEntry from "rollup-plugin-multi-entry";
import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import istanbul from "rollup-plugin-istanbul";
import base from "../rollup.config.js";

export default [
  ...base,
  {
    input: "tests/**/*-test.js",
    output: {
      file: "build/bundle-test.js",
      format: "cjs",
      sourcemap: true,
      interop: false
    },
    external: [
      "ava",
      "path",
      "os",
      "util",
      "url",
      "net",
      "tty",
      "https",
      "fs",
      "stream",
      "events",
      "assert",
      "os",
      "child_process"
    ],
    plugins: [
      multiEntry(),
      resolve(),
      commonjs(),
      istanbul({
        exclude: ["tests/**/*-test.js", "node_modules/**/*"]
      })
    ]
  }
];
