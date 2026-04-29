import { LOOP_SCHEMA_VERSION, LOOP_COMMAND_VERSION, LOOP_RUBRIC_VERSION } from "./autonomous-loop-constants.mjs";

export function validateStateVersions(state) {
  const missing = ["schema_version", "command_version", "rubric_version"].filter((key) => !(key in state));
  if (missing.length > 0) return { ok: false, status: "state_migration_required", missing };
  if (state.schema_version > LOOP_SCHEMA_VERSION) return { ok: false, status: "state_version_unsupported", missing: [] };
  return { ok: true, status: "compatible", missing: [] };
}

export function migrateState(state) {
  const validation = validateStateVersions(state);
  if (validation.ok) return { migrated: false, state };
  if (validation.status === "state_version_unsupported") return { migrated: false, state, error: validation.status };

  return {
    migrated: true,
    state: {
      schema_version: state.schema_version || LOOP_SCHEMA_VERSION,
      command_version: state.command_version || LOOP_COMMAND_VERSION,
      rubric_version: state.rubric_version || LOOP_RUBRIC_VERSION,
      ...state,
      migration_snapshot_required: true,
    },
  };
}
