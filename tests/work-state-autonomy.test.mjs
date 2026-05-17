import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveSupervibeKillSwitches,
} from "../scripts/lib/supervibe-work-state.mjs";

test("local workflow autonomy enables bounded index autorepair by default", () => {
  const result = resolveSupervibeKillSwitches({ env: {}, argv: [] });

  assert.equal(result.switches.SUPERVIBE_INDEX_AUTOREPAIR.enabled, true);
  assert.equal(result.switches.SUPERVIBE_INDEX_AUTOREPAIR.source, "default");
});

test("CI and explicit no-auto-repair still fail closed for index autorepair", () => {
  const ci = resolveSupervibeKillSwitches({ env: { CI: "true" }, argv: [] });
  const disabled = resolveSupervibeKillSwitches({ env: {}, argv: ["--no-auto-repair"] });

  assert.equal(ci.switches.SUPERVIBE_INDEX_AUTOREPAIR.enabled, false);
  assert.equal(ci.switches.SUPERVIBE_INDEX_AUTOREPAIR.source, "ci-default");
  assert.equal(disabled.switches.SUPERVIBE_INDEX_AUTOREPAIR.enabled, false);
  assert.equal(disabled.switches.SUPERVIBE_INDEX_AUTOREPAIR.source, "cli-flag");
});
