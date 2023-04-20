#!/usr/bin/env -S node --no-warnings
import { execa } from "execa";
import { program } from "commander";
import chalk from "chalk";
import pkg from "../package.json" assert { type: "json" };
import { applyPatch } from "fast-json-patch/index.mjs";
import { StringContentEntry } from "content-entry";
import { generateBranchName, asArray } from "repository-provider";
import {
  initializeRepositoryProvider,
  initializeCommandLine
} from "./setup-provider.mjs";

const properties = {};

initializeCommandLine(program);

program
  .description(pkg.description)
  .version(pkg.version)
  .option("--dry", "do not create branch/pull request")
  .option("--trace", "log level trace")
  .option("--debug", "log level debug")
  .option("--parallel", "execute branches in parallel")
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

      const patches = [];
      for await (const branch of provider.branches(branches)) {
        if (branch.isWritable) {
          const p = patch(branch, exec, args, options);
          if (options.parallel) {
            patches.push(p);
          } else {
            await p;
          }
        } else {
          if(options.debug || options.trace) {
            console.log(chalk.gray(`${branch}: not writable - skip`));
          }
        }
      }

      if (patches.length) {
        await Promise.all(patches);
      }
    } catch (err) {
      console.error(err);
      process.exit(-1);
    }
  })
  .parse(process.argv);

async function patch(branch, exec, args, options) {
  try {
    const toBeCommited = [];
    let numberOfEntries = 0;

    for await (const entry of branch.entries(options.entries)) {
      numberOfEntries++;

      if (entry.isBlob) {
        const originalString = await entry.string;
        const originalLastChar = originalString[originalString.length - 1];

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

        if (!(await entry.equalsContent(modified))) {
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
          title: options.title === undefined ? options.message : options.title,
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
            numberOfEntries === 0 ? "no matching entries" : "nothing changed"
          }`
        )
      );
    }
  } catch (err) {
    console.error(err);
  }
}
