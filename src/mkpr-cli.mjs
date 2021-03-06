#!/usr/bin/env node

import { readFileSync } from "fs";
import execa from "execa";
import program from "commander";
import { applyPatch } from "fast-json-patch/index.mjs";
import { StringContentEntry } from "content-entry";
import AggregationProvider from "aggregation-repository-provider";
import { generateBranchName, asArray } from "repository-provider";

process.on("uncaughtException", err => console.error(err));
process.on("unhandledRejection", reason => console.error(reason));

const { version, description } = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url).pathname, {
    encoding: "utf8"
  })
);

const properties = {};

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
  .option(
    "-e, --entries <entries>",
    "glob to select entries in the repo",
    "**/*"
  )
  .option("--regex", "interpret exec as regular expression")
  .option(
    "--jsonpatch",
    "interpret exec as json patch to be applied to selected files"
  )
  .option("--message <commit message>", /.+/, "mkpr")
  .option("--title <pr title>")
  .arguments(
    "transformation with args % [branches...]",
    "command to be applied to the branches"
  )
  .action(async repos => {
    try {
      const options = program.opts();
      const provider = await AggregationProvider.initialize(
        [],
        properties,
        process.env
      );

      if (options.listProviders) {
        console.log(
          [
            ...provider.providers.map(
              p => `${p.name}: ${JSON.stringify(p.toJSON())}`
            )
          ].join("\n")
        );

        return;
      }

      let args;

      let exec = repos.shift();
      const si = repos.indexOf("%");

      if (si >= 0) {
        args = repos.splice(0, si);
        repos.shift();
      } else {
        [exec, ...args] = exec.split(/\s+/);
      }

      for await (const branch of provider.branches(repos)) {
        if (!branch.isWritable) {
          console.log(`Skip ${branch} as it is not writable`);
          continue;
        }

        const toBeCommited = [];
        let numberOfEntries = 0;

        for await (const entry of branch.entries(options.entries)) {
          numberOfEntries++;

          if (entry.isBlob) {
            const originalString = await entry.getString();
            const originalLastChar = originalString[originalString.length - 1];

            let modified, newContent;
            if (options.regex) {
              const p = exec.split(/\//);
              //console.log(p);
              const regex = new RegExp(p[1], "g");
              newContent = originalString.replace(regex, p[2]);
            } else if (options.jsonpatch) {
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
          const pr = await branch.commitIntoPullRequest(
            { message: options.message, entries: toBeCommited },
            {
              dry: options.dry,
              pullRequestBranch: await generateBranchName(
                branch.repository,
                options.prbranch
              ),
              title:
                options.title === undefined ? options.message : options.title,
              body: `Applied mkpr on ${options.files}
\`\`\`${options.jsonpatch ? "json" : "sh"}
${exec} ${args}
\`\`\`
`
            }
          );

          console.log(`${pr.identifier}: ${pr.title}`);
        } else {
          console.log(
            `${branch.identifier}: ${
              numberOfEntries === 0 ? "no matching entries" : "nothing changed"
            }`
          );
        }
      }
    } catch (err) {
      console.log(err);
      process.exit(-1);
    }
  })
  .parse(process.argv);
