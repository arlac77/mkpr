#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import { program } from "commander";
import { applyPatch } from "fast-json-patch/index.mjs";
import { StringContentEntry } from "content-entry";
import { generateBranchName, asArray } from "repository-provider";
import { initializeRepositoryProvider } from "./setup-provider.mjs";
import chalk from "chalk";

process.on("uncaughtException", console.error);
process.on("unhandledRejection", console.error);

const { version, description } = JSON.parse(
  readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), {
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
  .option("--no-cache", "cache requests")
  .option("-d, --define <...key=value>", "set option", values =>
    asArray(values).forEach(value => {
      const [k, v] = value.split(/=/);
      properties[k] = v;
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
  .argument("[transformation]", "transformation")
  .argument("[branches...]", "branches whre to apply transformation")
  .action(async (exec, branches) => {
    try {
      const { provider, options } = await initializeRepositoryProvider(
        program,
        properties
      );
      let args;

      const si = branches.indexOf("%");

      if (si >= 0) {
        args = branches.splice(0, si);
        branches.shift();
      } else {
        [exec, ...args] = exec.split(/\s+/);
      }

      for await (const branch of provider.branches(branches)) {
        try {
          if (!branch.isWritable) {
            console.log(chalk.gray(`Skip ${branch} as it is not writable`));
            continue;
          }

          const toBeCommited = [];
          let numberOfEntries = 0;

          for await (const entry of branch.entries(options.entries)) {
            numberOfEntries++;

            if (entry.isBlob) {
              const originalString = await entry.string;
              const originalLastChar =
                originalString[originalString.length - 1];

              let modified, newContent;
              if (options.regex) {
                const p = exec.split(/\//);
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
                /*console.log(
                  `${exec} ${args.map(x => `'${x}'`).join(" ")} ${branch} ${
                    entry.name
                  }`
                );*/

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
                body: `Applied mkpr on ${options.entries}
\`\`\`${options.jsonpatch ? "json" : "sh"}
${exec} ${args}
\`\`\`
`
              }
            );

            console.log(chalk.green(`${pr.identifier}: ${pr.title}`));
          } else {
            console.log(
              chalk.gray(
                `${branch.identifier}: ${
                  numberOfEntries === 0
                    ? "no matching entries"
                    : "nothing changed"
                }`
              )
            );
          }
        } catch (err) {
          console.error(err);
        }
      }
    } catch (err) {
      console.error(err);
      process.exit(-1);
    }
  })
  .parse(process.argv);
