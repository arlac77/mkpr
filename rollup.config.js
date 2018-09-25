import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import executable from "rollup-plugin-executable";
import cleanup from "rollup-plugin-cleanup";
import json from "rollup-plugin-json";
import pkg from "./package.json";

export default Object.keys(pkg.bin).map(name => {
  return {
    input: `src/${name}.js`,
    output: {
      file: pkg.bin[name],
      format: "cjs",
      banner:
        "#!/usr/bin/env -S node --experimental-modules --experimental-worker",
      interop: false
    },
    external: [
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
    plugins: [resolve(), commonjs(), json(), cleanup(), executable()]
  };
});
