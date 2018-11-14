import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import executable from "rollup-plugin-executable";
import cleanup from "rollup-plugin-cleanup";
import json from "rollup-plugin-json";
import pkg from "./package.json";

export default Object.keys(pkg.bin).map(name => {
  return {
    input: `src/${name}-cli.mjs`,
    output: {
      file: pkg.bin[name],
      format: "cjs",
      banner:
        '#!/bin/sh\n":" //# comment; exec /usr/bin/env node --experimental-modules --experimental-worker "$0" "$@"',
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
      "child_process",
      "caporal",
      "repository-provider",
      "github-repository-provider",
      "local-repository-provider",
      "aggregation-repository-provider",
      "semver",
      "execa"
    ],
    plugins: [
      commonjs(),
      json({
        include: "package.json",
        preferConst: true,
        compact: true
      }),
      cleanup(),
      executable()
    ]
  };
});
