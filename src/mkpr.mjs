import { version, engines } from "../package.json";
import { Content } from "repository-provider";
import { GithubProvider } from "github-repository-provider";
import { LocalProvider } from "local-repository-provider";
import { AggregationProvider } from "aggregation-repository-provider";
import { satisfies } from "semver";
import execa from "execa";

const program = require("caporal");

process.on("uncaughtException", err => console.error(err));
process.on("unhandledRejection", reason => console.error(reason));

const properties = {};

program
  .description("Create pull request by streaming content through a filter")
  .version(version)
  .option("--dry", "do not create branch/pull request", program.BOOL, false)
  .option("-d --define <key=value>", "set provider option", values => {
    if (!Array.isArray(values)) {
      values = [values];
    }

    values.forEach(value => {
      const [k, v] = value.split(/=/);
      setProperty(properties, k, v);
    });
  })
  .option("--files", "files", /\S+/, "*.js")
  .option("--message", "message", /.+/, "a commit message")
  .argument("exec", "process to pipe content through")
  .argument("[repos...]", "repos to merge")
  .action(async (args, options, logger) => {
    try {
      const aggregationProvider = new AggregationProvider();

      [GithubProvider, LocalProvider].forEach(provider => {
        let options = provider.optionsFromEnvironment(process.env);

        if (options !== undefined || properties[provider.name] !== undefined) {
          options = Object.assign({}, options, properties[provider.name]);
          aggregationProvider.providers.push(new provider(options));
        }
      });

      for (const repo of args.repos) {
        const branch = await aggregationProvider.branch(repo);

        if (branch === undefined) {
          logger.info("no such branch `${repo}`");
        } else {
          const changedFiles = [];

          for await (const entry of branch.list([options.files])) {
            const [pe, ...pa] = args.exec.split(/\s+/);
            console.log(
              `${pe} ${pa.map(x => `'${x}'`).join(" ")} ${repo} ${entry.path}`
            );

            const original = await branch.content(entry.path);
            const output = await execa.stdout(pe, pa, {
              input: original.content
            });

            const modified = new Content(entry.path, output);

            if (!original.equals(modified)) {
              changedFiles.push(modified);
            }
          }

          if (changedFiles.length > 0) {
            const prBranch = await branch.createBranch("mkpr-1");

            await prBranch.commit(options.message, changedFiles);

            const pullRequest = await branch.createPullRequest(prBranch, {
              title: `mkpr ${options.filePattern} ${args.exec}`
            });

            logger.info(pullRequest);
          } else {
            logger.info("no matching files");

            process.exit(1);
          }
        }
      }
    } catch (err) {
      logger.info(err);
      process.exit(-1);
    }
  });

if (!satisfies(process.versions.node, engines.node)) {
  console.error(`require node ${engines.node} (not ${process.versions.node})`);
  process.exit(-1);
}

program.parse(process.argv);
