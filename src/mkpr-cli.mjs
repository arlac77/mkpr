import { version, engines, description } from "../package.json";
import execa from "execa";
import program from "commander";
import { satisfies } from "semver";
import { applyPatch } from "fast-json-patch";
import { StringContentEntry } from "content-entry";
import { GithubProvider } from "github-repository-provider";
import { LocalProvider } from "local-repository-provider";
import { AggregationProvider } from "aggregation-repository-provider";

process.on("uncaughtException", err => console.error(err));
process.on("unhandledRejection", reason => console.error(reason));

const properties = {};

if (!satisfies(process.versions.node, engines.node)) {
  console.error(`require node ${engines.node} (not ${process.versions.node})`);
  process.exit(-1);
}

program
  .description(description)
  .version(version)
  .option("--dry", "do not create branch/pull request")
  .option("--debug", "log level debug")
  .option("-d, --define <key=value>", "set provider option", values => {
    if (!Array.isArray(values)) {
      values = [values];
    }

    values.forEach(value => {
      const [k, v] = value.split(/=/);
      setProperty(properties, k, v);
    });
  })
  .option("--prbranch <name>", "name of the pull request branch", "mkpr/0001")
  .option("-f, --files <files>", "glob to select files in the repo", "**/*")
  .option(
    "--jsonpatch",
    "interpret exec as json patch to be applied to selected files"
  )
  .option("--message <message>", /.+/, "a commit message")
  .command("exec branch [branches...]", "command to be applied to the branches")
  .action(async (exec, ...repos) => {
    repos.pop(); // skip command itself

    try {
      const logLevel = program.debug ? "debug" : "info";

      const logOptions = {
        logger: (...args) => {
          console.log(...args);
        },
        logLevel
      };

      const aggregationProvider = new AggregationProvider(
        [GithubProvider, LocalProvider].map(
          provider =>
            provider.initialize({
              ...logOptions,
              ...properties[provider.name] },
              process.env
            )
        ),
        logOptions
      );

      for await (const branch of aggregationProvider.branches(repos)) {
        const changedFiles = [];

        for await (const entry of branch.entries(program.files)) {
          if (entry.isBlob) {
            const original = await branch.entry(entry.name);

            let modified;
            if (program.jsonpatch) {
              console.log(`jsonpatch ${exec} ${branch} ${entry.name}`);

              const os = await original.getString();
              const originalLastChar = os[original.length - 1];

              try {
                let patch = JSON.parse(exec);
                if (!Array.isArray(patch)) {
                  patch = [path];
                }

                const newContent = JSON.stringify(
                  applyPatch(JSON.parse(os), patch).newDocument,
                  undefined,
                  2
                );

                const lastChar = newContent[newContent.length - 1];

                // keep trailing newline
                if (originalLastChar === "\n" && lastChar === "}") {
                  newContent += "\n";
                }

                modified = new StringContentEntry(entry.name, newContent);
              } catch (e) {
                if (e.name === "TEST_OPERATION_FAILED") {
                  console.log("Skip patch test not fullfilled", e.operation);
                } else {
                  console.error(e);
                }
                continue;
              }
            } else {
              const [pe, ...pa] = exec.split(/\s+/);

              console.log(
                `${pe} ${pa.map(x => `'${x}'`).join(" ")} ${branch} ${
                  entry.name
                }`
              );

              const e = await execa(pe, pa, {
                input: await original.getString()
              });

              modified = new StringContentEntry(entry.name, e.stdout);
            }

            const isEqual = await original.equalsContent(modified);

            if (!isEqual) {
              changedFiles.push(modified);
            }
          }
        }

        if (changedFiles.length > 0) {
          const prBranch = await branch.createBranch(program.prbranch);

          await prBranch.commit(program.message, changedFiles);

          const pullRequest = await branch.createPullRequest(prBranch, {
            title: `mkpr ${program.files} ${exec}`
          });
          console.log(`${branch} ${pullRequest}`);
        } else {
          console.log(`${branch}: nothing changed / no matching files`);
        }
      }
    } catch (err) {
      console.log(err);
      process.exit(-1);
    }
  })
  .parse(process.argv);
