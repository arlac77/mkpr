#!/usr/bin/env node

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import execa from "execa";
import program from "commander";
import satisfies from "semver/functions/satisfies.js";
import { applyPatch } from "fast-json-patch/index.mjs";
import { StringContentEntry } from "content-entry";
import GithubProvider from "github-repository-provider";
import BitbucketProvider from "bitbucket-repository-provider";
import LocalProvider from "local-repository-provider";
import AggregationProvider from "aggregation-repository-provider";
import { generateBranchName } from "repository-provider";

process.on("uncaughtException", err => console.error(err));
process.on("unhandledRejection", reason => console.error(reason));

const { version, description, engines } = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
    { endoding: "utf8" }
  )
);

const properties = {};

if (!satisfies(process.versions.node, engines.node)) {
  console.error(`require node ${engines.node} (not ${process.versions.node})`);
  process.exit(-1);
}

program
  .description(description)
  .version(version)
  .option("--dry", "do not create branch/pull request")
  .option("--trace", "log level trace")
  .option("--debug", "log level debug")
  .option("-d, --define <key=value>", "set option", values =>
    asArray(values).forEach(value => {
      const [k, v] = value.split(/=/);
      setProperty(properties, k, v);
    })
  )
  .option("--prbranch <name>", "name of the pull request branch", "mkpr/*")
  .option("-f, --files <files>", "glob to select files in the repo", "**/*")
  .option(
    "--jsonpatch",
    "interpret exec as json patch to be applied to selected files"
  )
  .option("--message <commit message>", /.+/, "mkpr")
  .option("--title <pr title>", /.+/, "mkpr")
  .command(
    "transformation with args % [branches...]",
    "command to be applied to the branches"
  )
  .action(async (commander, repos) => {
    try {
      const logLevel = program.trace
        ? "trace"
        : program.debug
        ? "debug"
        : "info";

      const aggregationProvider = AggregationProvider.initialize(
        [GithubProvider, BitbucketProvider, LocalProvider],
        properties,
        process.env
      );

      let args;

      let exec = repos.shift();
      const si = repos.indexOf("%");

      if (si >= 0) {
        args = repos.splice(0, si);
        repos.shift();
      } else {
        [exec, ...args] = exec.split(/\s+/);
      }

      for await (const branch of aggregationProvider.branches(repos)) {
        const toBeCommited = [];
        let numberOfFiles = 0;

        if (!branch.isWritable) {
          console.log(`Skip ${branch} as it is not writable`);
          continue;
        }

        for await (const entry of branch.entries(program.files)) {
          numberOfFiles++;

          if (entry.isBlob) {
            const originalString = await entry.getString();
            const originalLastChar = originalString[originalString.length - 1];

            let modified, newContent;
            if (program.jsonpatch) {
              console.log(`jsonpatch ${exec} ${branch} ${entry.name}`);

              try {
                const patch = asArray(JSON.parse(exec));

                newContent = JSON.stringify(
                  applyPatch(JSON.parse(originalString), patch).newDocument,
                  undefined,
                  2
                );
              } catch (e) {
                if (e.name === "TEST_OPERATION_FAILED") {
                  console.log("Skip: patch test not fullfilled", e.operation);
                } else {
                  console.error(e);
                }
                continue;
              }
            } else {
              console.log(
                `${exec} ${args.map(x => `'${x}'`).join(" ")} ${branch} ${
                  entry.name
                }`
              );

              const e = await execa(exec, args, {
                input: originalString
              });

              newContent = e.stdout;
            }

            const lastChar = newContent[newContent.length - 1];

            // keep trailing newline
            if (originalLastChar === "\n" && lastChar !== "\n") {
              newContent += "\n";
            }

            modified = new StringContentEntry(entry.name, newContent);

            const isEqual = await entry.equalsContent(modified);

            if (!isEqual) {
              toBeCommited.push(modified);
            }
          }
        }

        if (toBeCommited.length > 0) {
          if (program.dry) {
            console.log(
              "changed",
              toBeCommited.map(f => f.name)
            );
          } else {
            const pr = await branch.commitIntoPullRequest(
              program.message,
              toBeCommited,
              {
                pullRequestBranch: await generateBranchName(
                  branch.repository,
                  program.prbranch
                ),
                title: program.title,
                body: `Applied mkpr on ${program.files}
\`\`\`${program.jsonpatch ? "json" : "sh"}
${exec} ${args}
\`\`\`
`
              }
            );

            console.log(`${pr.identifier}: ${pr.title}`);
          }
        } else {
          console.log(
            branch +
              ": " +
              (numberOfFiles === 0 ? "no matching files" : "nothing changed")
          );
        }
      }
    } catch (err) {
      console.log(err);
      process.exit(-1);
    }
  })
  .parse(process.argv);

function asArray(obj) {
  return Array.isArray(obj) ? obj : obj === undefined ? [] : [obj];
}
