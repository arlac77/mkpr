import resolve from "rollup-plugin-node-resolve";
import commonjs from "rollup-plugin-commonjs";
import executable from "rollup-plugin-executable";
import cleanup from "rollup-plugin-cleanup";
import json from "rollup-plugin-json";
import pkg from "./package.json";

// require('module').builtinModules
const external = [
  "assert",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "dns",
  "domain",
  "events",
  "fs",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "string_decoder",
  "sys",
  "timers",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "v8",
  "vm",
  "zlib",

  "node-fetch"
];

export default Object.keys(pkg.bin).map(name => {
  return {
    input: `src/${name}-cli.mjs`,
    output: {
      file: pkg.bin[name],
      format: "cjs",
      banner:
        '#!/bin/sh\n":" //# comment; exec /usr/bin/env node --experimental-modules "$0" "$@"',
      interop: false
    },
    external,
    plugins: [
      resolve({ preferBuiltins: true }),
      commonjs(),
      json({
        preferConst: true,
        compact: true
      }),
      cleanup({
        exclude: [
          "node_modules/@octokit/plugin-throttling/lib/route-matcher.js"
        ]
      }),
      executable()
    ]
  };
});
