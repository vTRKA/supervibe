import assert from "node:assert/strict";
import test from "node:test";
import { migrateState, validateStateVersions } from "../scripts/lib/autonomous-loop-state-migrations.mjs";

test("old state requires deterministic migration", () => {
  assert.equal(validateStateVersions({ run_id: "old" }).status, "state_migration_required");
  assert.equal(migrateState({ run_id: "old" }).migrated, true);
});
