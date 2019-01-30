import { version, engines, description } from "../package.json";
import { ReadableStreamContentEntry } from "content-entry";
import { GithubProvider } from "github-repository-provider";
import { LocalProvider } from "local-repository-provider";
import { AggregationProvider } from "aggregation-repository-provider";
import { satisfies } from "semver";
import execa from "execa";
import program from "commander";

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
  .option("-f, --files <files>")
  .option("--message <message>", /.+/, "a commit message")
  .command("exec repo [repos...]", "repos to merge")
  .action(async (exec, ...repos) => {
    const [pe, ...pa] = exec.split(/\s+/);

    repos.pop(); // TODO why

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

      for (const repo of repos) {
        const branch = await aggregationProvider.branch(repo);

        if (branch === undefined) {
          console.log("no such branch `${repo}`");
        } else {
          const changedFiles = [];

          for await (const entry of branch.entries(program.files)) {
            console.log(
              `${pe} ${pa.map(x => `'${x}'`).join(" ")} ${repo} ${entry.name}`
            );

            const original = await branch.entry(entry.name);
            const output = await execa.stdout(pe, pa, {
              input: await original.getString()
            });

            const modified = new ReadableStreamContentEntry(entry.name, output);

        //    if (!await original.equalsContent(modified)) {
              changedFiles.push(modified);
        //    }
          }

          if (changedFiles.length > 0) {
            const prBranch = await branch.createBranch("mkpr-1");

            await prBranch.commit(program.message, changedFiles);

            const pullRequest = await branch.createPullRequest(prBranch, {
              title: `mkpr ${program.files} ${exec}`
            });

            console.log(pullRequest);
          } else {
            console.log("no matching files");

            process.exit(1);
          }
        }
      }
    } catch (err) {
      console.log(err);
      process.exit(-1);
    }
  })
  .parse(process.argv);
