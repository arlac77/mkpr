import test from "ava";
import { execa } from "execa";
import { GithubProvider } from "github-repository-provider";

const REPO = "arlac77/sync-test-repository";

async function prAssert(t, p) {
  const m = p.all.match(/(\d+):/);

  if (m) {
    const prNumber = m[1];
    const provider = GithubProvider.initialize(undefined, process.env);
    const repo = await provider.repository(REPO);

    const pr = await repo.pullRequest(prNumber);

    t.log("PR", prNumber, pr, pr.source.name, pr.destination.name);

    t.is(pr.number, prNumber);
    t.is(pr.title, "mkpr");
    //  t.is(pr.body, "sed s/14.1.1/14.1.2/");
    t.is(pr.destination.name, "master");
    t.true(pr.source.name.startsWith("mkpr/"));

    //  await repo.deletePullRequest(prNumber);
    await repo.deleteBranch(pr.source.name);
  }
}

test("cli exec separator %", async t => {
  const p = await execa(
    "node",
    [
      new URL("../src/mkpr-cli.mjs", import.meta.url).pathname,
      "--entries",
      "package.json",
      "sed",
      "s/14.1.1/14.1.2/",
      "%",
      REPO
    ],
    { all: true }
  );

  t.is(p.exitCode, 0);
  await prAssert(t, p);
});
