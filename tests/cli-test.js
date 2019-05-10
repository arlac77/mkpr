import test from "ava";
import execa from "execa";
import { join } from "path";
import { GithubProvider } from "github-repository-provider";

test("cli", async t => {
  const p = await execa(join(__dirname, "..", "bin", "mkpr"), [
    "--files",
    "package.json",
    "sed s/8.11/8.12/",
    "arlac77/sync-test-repository"
  ]);
  t.is(p.code, 0);

  console.log(p.stdout);

  const m = p.stdout.match(/(\d+):/);
  //console.log(m);

  if (m) {
    const provider = new GithubProvider(
      GithubProvider.optionsFromEnvironment(process.env)
    );
    const repo = await provider.repository("arlac77/sync-test-repository");
    await repo.deletePullRequest(m[1]);
  }
});
