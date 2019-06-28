import test from "ava";
import execa from "execa";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

import { GithubProvider } from "github-repository-provider";

const here = dirname(fileURLToPath(import.meta.url));

test("cli", async t => {
  const p = await execa(join(here, "..", "bin", "mkpr"), [
    "--files",
    "package.json",
    "sed s/8.11/8.12/",
    "arlac77/sync-test-repository"
  ]);
  t.is(p.exitCode, 0);

  console.log(p.all);

  const m = p.all.match(/(\d+):/);
  //console.log(m);

  if (m) {
    const provider = new GithubProvider(
      GithubProvider.optionsFromEnvironment(process.env)
    );
    const repo = await provider.repository("arlac77/sync-test-repository");
    await repo.deletePullRequest(m[1]);
    await repo.deleteBranch('mkpr/0001');
  }
});
