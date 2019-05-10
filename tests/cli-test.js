import test from "ava";
import execa from "execa";
import { join } from "path";

test("cli", async t => {
  const p = await execa(join(__dirname, "..", "bin", "mkpr"), [
    "--files",
    "package.json",
    "sed s/8.11/8.12/",
    "arlac77/sync-test-repository"
  ]);
  console.log(p.stdout);
  t.is(p.code, 0);
});
