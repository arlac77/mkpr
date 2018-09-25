import { version, engines } from "../package.json";
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
        console.log(repo);
      }
    } catch (err) {
      logger.error(err);
    }
  });

if (!satisfies(process.versions.node, engines.node)) {
  console.error(`require node ${engines.node} (not ${process.versions.node})`);
  process.exit(-1);
}

program.parse(process.argv);
