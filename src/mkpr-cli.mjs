import { version, engines, description } from "../package.json";
import { StringContentEntry } from "content-entry";
import { GithubProvider } from "github-repository-provider";
import { LocalProvider } from "local-repository-provider";
import { AggregationProvider } from "aggregation-repository-provider";
import { satisfies } from "semver";
import execa from "execa";
import program from "commander";
import { applyPatch } from "fast-json-patch";

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
  .option("-f, --files <files>", "glob to select files in the repo", "**/*")
  .option(
    "--jsonpatch",
    "interpret exec as json patch to be applied to selected files"
  )
  .option("--message <message>", /.+/, "a commit message")
  .command("exec repo [repos...]", "command to be applied to the repositories")
  .action(async (exec, ...repos) => {
    repos.pop(); // skip command itself

    try {
      const logLevel = program.debug ? "debug" : "info";

      const providers = [];

      const logOptions = {
        logger: (...args) => {
          console.log(...args);
        },
        logLevel
      };

      [GithubProvider, LocalProvider].forEach(provider => {
        const options = Object.assign(
          {},
          logOptions,
          properties[provider.name],
          provider.optionsFromEnvironment(process.env)
        );
        providers.push(new provider(options));
      });

      const aggregationProvider = new AggregationProvider(
        providers,
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

              const newContent = JSON.stringify(
                applyPatch(JSON.parse(os), JSON.parse(exec)).newDocument,
                undefined,
                2
              );

              const lastChar = newContent[newContent.length - 1];

              // keep trailing newline
              if (originalLastChar === "\n" && lastChar === "}") {
                newContent += "\n";
              }

              modified = new StringContentEntry(entry.name, newContent);
            } else {
              const [pe, ...pa] = exec.split(/\s+/);

              console.log(
                `${pe} ${pa.map(x => `'${x}'`).join(" ")} ${branch} ${
                  entry.name
                }`
              );

              const output = await execa.stdout(pe, pa, {
                input: await original.getString()
              });

              modified = new StringContentEntry(entry.name, output);
            }
            const isEqual = await original.equalsContent(modified);

            if (!isEqual) {
              changedFiles.push(modified);
            }
          }
        }

        if (changedFiles.length > 0) {
          const prBranch = await branch.createBranch("mkpr-1");

          await prBranch.commit(program.message, changedFiles);

          const pullRequest = await branch.createPullRequest(prBranch, {
            title: `mkpr ${program.files} ${exec}`
          });

          console.log(pullRequest);
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
