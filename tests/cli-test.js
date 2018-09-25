import test from "ava";
import execa from "execa";
import { join } from "path";

test("cli", async t => {
  const p = await execa(
    join(__dirname, "..", "bin", "mkpr", [
      "sed s/8.11/8.12/",
      "arlac77/template-sync-test"
    ])
  );
  t.is(p.exitCode, 0);
});
