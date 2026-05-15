import { FACADE_REDACTION_METADATA } from "./supervibe-output-redaction.mjs";

export {
  DEFAULT_PUBLIC_FIELD_ALLOWLIST,
  DEFAULT_REDACTION_PATTERNS,
  classifyRedactionRisk,
  redactFacadePayload,
  redactSensitiveValue,
} from "./supervibe-output-redaction.mjs";

export const SUPERVIBE_FACADE_SCHEMA_VERSION = 1;
export const SUPERVIBE_FACADE_REDACTION = FACADE_REDACTION_METADATA;

export const FACADE_OPERATION_IDS = Object.freeze([
  "status",
  "nextAction",
  "searchMemory",
  "searchCode",
  "queryGraph",
  "explainCommand",
  "receipts",
  "verify",
  "repair",
]);

const JSON_SCHEMA_DRAFT = "https://json-schema.org/draft/2020-12/schema";

const NON_MUTATING = Object.freeze({
  mutatesWorkspace: false,
  requiresExplicitApproval: false,
  allowedEffects: Object.freeze(["read-local-files", "read-local-indexes", "print-output"]),
});

const GUARDED_MUTATION = Object.freeze({
  mutatesWorkspace: true,
  requiresExplicitApproval: true,
  allowedEffects: Object.freeze(["read-local-files", "write-supervibe-managed-files", "print-output"]),
});

const OPERATION_DEFINITIONS = [
  {
    id: "status",
    description: "Return local Supervibe health, active workflow, index, memory, and command readiness without changing project state.",
    cliEquivalent: "npm run supervibe:status",
    input: {
      rootDir: stringSchema("Project root. Defaults to the current working directory."),
      format: enumSchema(["text", "json"], "Preferred output format."),
      includeDetails: booleanSchema("Include expanded health details when available."),
    },
    output: {
      schemaVersion: constSchema(SUPERVIBE_FACADE_SCHEMA_VERSION),
      ok: booleanSchema("Whether core local status checks completed."),
      status: enumSchema(["ready", "degraded", "blocked", "unknown"], "Overall local readiness."),
      activeWorkflow: nullableStringSchema("Active workflow or graph id when detected."),
      checks: arraySchema(objectSchema({ id: stringSchema("Check id."), status: enumSchema(["pass", "warn", "fail", "skipped"], "Check result."), message: stringSchema("Human-readable status message.") })),
      degraded: booleanSchema("True when fallback or partial status was used."),
    },
    outputRequired: ["schemaVersion", "ok", "status", "checks", "degraded"],
    privacyBoundary: "Local repository metadata only. Must not transmit source, memory, receipts, environment variables, or user files outside the machine.",
    degradedMode: "If indexes or workflow state are missing, return partial filesystem status with status=degraded and explicit skipped checks.",
    riskClass: "read-only",
    mutationPolicy: NON_MUTATING,
  },
  {
    id: "nextAction",
    description: "Compute the canonical next action for the active workflow from local graph, state, and safe-repair primitives.",
    cliEquivalent: "node scripts/supervibe-next-action.mjs --json",
    input: { rootDir: stringSchema("Project root. Defaults to the current working directory."), workflowId: stringSchema("Optional workflow or graph id to inspect."), taskId: stringSchema("Optional task id to focus the recommendation.") },
    output: { schemaVersion: constSchema(SUPERVIBE_FACADE_SCHEMA_VERSION), actionId: stringSchema("Stable action id."), label: stringSchema("Short action label."), reason: stringSchema("Why this action is next."), blocked: booleanSchema("Whether progress is blocked."), blockers: arraySchema(stringSchema("Blocking condition.")), source: stringSchema("Local state source used to compute the action."), degraded: booleanSchema("True when only partial state was available.") },
    outputRequired: ["schemaVersion", "actionId", "label", "reason", "blocked", "blockers", "source", "degraded"],
    privacyBoundary: "Reads local workflow state and managed Supervibe memory only. Outputs summaries and ids, not raw private memory content unless already part of workflow state.",
    degradedMode: "If graph or next-action state is unavailable, return blocked=true with a diagnostic action that points to status or repair.",
    riskClass: "read-only",
    mutationPolicy: NON_MUTATING,
  },
  {
    id: "searchMemory",
    description: "Search local project memory for prior decisions, incidents, artifacts, and workflow evidence relevant to a query.",
    cliEquivalent: "node scripts/search-memory.mjs --query <query> --limit <limit>",
    input: { query: stringSchema("Search query.", 1), limit: integerSchema("Maximum results to return.", 1, 50), rootDir: stringSchema("Project root. Defaults to the current working directory."), includeSnippets: booleanSchema("Include bounded excerpts from matched memory records.") },
    inputRequired: ["query"],
    output: { schemaVersion: constSchema(SUPERVIBE_FACADE_SCHEMA_VERSION), query: stringSchema("Normalized query."), results: arraySchema(objectSchema({ id: stringSchema("Memory record id."), title: stringSchema("Memory title or derived label."), path: stringSchema("Repository-relative memory path."), score: numberSchema("Relevance score."), snippet: nullableStringSchema("Bounded local excerpt when requested.") })), degraded: booleanSchema("True when memory search used filesystem fallback or returned partial evidence.") },
    outputRequired: ["schemaVersion", "query", "results", "degraded"],
    privacyBoundary: "Local .supervibe memory only. Redact secrets and keep excerpts bounded; never upload memory records or embeddings.",
    degradedMode: "If the memory index is unavailable, fall back to deterministic filename and text scan with degraded=true.",
    riskClass: "read-only-sensitive",
    mutationPolicy: NON_MUTATING,
  },
  {
    id: "searchCode",
    description: "Search local source code through Code RAG or deterministic source fallback for task-relevant files and symbols.",
    cliEquivalent: "node scripts/search-code.mjs --query <query> --limit <limit>",
    input: { query: stringSchema("Code search query.", 1), limit: integerSchema("Maximum results to return.", 1, 50), rootDir: stringSchema("Project root. Defaults to the current working directory."), language: stringSchema("Optional language filter."), includeContext: booleanSchema("Include bounded code context when available.") },
    inputRequired: ["query"],
    output: { schemaVersion: constSchema(SUPERVIBE_FACADE_SCHEMA_VERSION), query: stringSchema("Normalized query."), results: arraySchema(objectSchema({ path: stringSchema("Repository-relative source path."), line: integerSchema("Best matching line number.", 1), symbol: nullableStringSchema("Matched symbol when available."), score: numberSchema("Relevance score."), snippet: nullableStringSchema("Bounded code excerpt when requested.") })), indexMode: enumSchema(["rag", "fts", "filesystem", "unavailable"], "Search backend used."), degraded: booleanSchema("True when full Code RAG was unavailable.") },
    outputRequired: ["schemaVersion", "query", "results", "indexMode", "degraded"],
    privacyBoundary: "Local source files and local indexes only. Return repository-relative paths and bounded snippets; never send code to external services.",
    degradedMode: "If Code RAG or embeddings are unavailable, use exact text or filename search and mark indexMode accordingly.",
    riskClass: "read-only-sensitive",
    mutationPolicy: NON_MUTATING,
  },
  {
    id: "queryGraph",
    description: "Query local CodeGraph relationships such as callers, callees, neighbors, impact, or top symbols.",
    cliEquivalent: "node scripts/search-code.mjs --callers <symbol> | --callees <symbol> | --neighbors <symbol> --depth <depth>",
    input: { symbol: stringSchema("Symbol or graph node id.", 1), mode: enumSchema(["callers", "callees", "neighbors", "impact", "topSymbols"], "Graph query mode."), depth: integerSchema("Traversal depth for neighborhood or impact queries.", 1, 3), limit: integerSchema("Maximum graph rows to return.", 1, 100), rootDir: stringSchema("Project root. Defaults to the current working directory.") },
    inputRequired: ["mode"],
    output: { schemaVersion: constSchema(SUPERVIBE_FACADE_SCHEMA_VERSION), mode: enumSchema(["callers", "callees", "neighbors", "impact", "topSymbols"], "Graph query mode."), nodes: arraySchema(objectSchema({ id: stringSchema("Graph node id."), name: stringSchema("Symbol name."), kind: nullableStringSchema("Symbol kind."), path: nullableStringSchema("Repository-relative path."), line: nullableIntegerSchema("Source line when available.") })), edges: arraySchema(objectSchema({ from: stringSchema("Source node id."), to: stringSchema("Target node id."), kind: nullableStringSchema("Relationship kind.") })), graphQuality: enumSchema(["healthy", "partial", "missing"], "Graph evidence quality."), degraded: booleanSchema("True when graph data was partial or missing.") },
    outputRequired: ["schemaVersion", "mode", "nodes", "edges", "graphQuality", "degraded"],
    privacyBoundary: "Local graph index only. Expose structural metadata and paths; include code snippets only through searchCode.",
    degradedMode: "If graph data is missing or stale, return graphQuality=missing or partial with no inferred relationships.",
    riskClass: "read-only-sensitive",
    mutationPolicy: NON_MUTATING,
  },
  {
    id: "explainCommand",
    description: "Route and explain a Supervibe command-like request without emulating missing or blocked commands.",
    cliEquivalent: "node scripts/supervibe-commands.mjs --match <request>",
    input: { request: stringSchema("User command-like request.", 1), rootDir: stringSchema("Project root. Defaults to the current working directory."), locale: stringSchema("Optional locale hint.") },
    inputRequired: ["request"],
    output: { schemaVersion: constSchema(SUPERVIBE_FACADE_SCHEMA_VERSION), intent: stringSchema("Matched intent."), command: nullableStringSchema("Canonical command when available."), hardStop: booleanSchema("Whether routing requires stopping instead of emulation."), explanation: stringSchema("Concise route explanation."), cliEquivalent: nullableStringSchema("Command to run when allowed."), degraded: booleanSchema("True when command catalog was incomplete or fallback routing was used.") },
    outputRequired: ["schemaVersion", "intent", "hardStop", "explanation", "degraded"],
    privacyBoundary: "Uses the local command catalog and request text only. Do not inspect unrelated source to emulate blocked command behavior.",
    degradedMode: "If the router is unavailable, return intent=unknown, hardStop=true, and tell the caller to run status or repair.",
    riskClass: "read-only",
    mutationPolicy: NON_MUTATING,
  },
  {
    id: "receipts",
    description: "Inspect or issue runtime workflow receipts for real producer, worker, reviewer, validator, or tool invocations.",
    cliEquivalent: "node scripts/workflow-receipt.mjs status | issue --help",
    input: { action: enumSchema(["status", "issue", "verify", "rebuildLedger", "pruneStale"], "Receipt operation."), workflowId: stringSchema("Workflow id for scoped receipt operations."), taskId: stringSchema("Task id for scoped receipt operations."), receiptKind: stringSchema("Receipt kind when issuing a receipt."), dryRun: booleanSchema("Preview mutation without writing when supported."), rootDir: stringSchema("Project root. Defaults to the current working directory.") },
    inputRequired: ["action"],
    output: { schemaVersion: constSchema(SUPERVIBE_FACADE_SCHEMA_VERSION), action: enumSchema(["status", "issue", "verify", "rebuildLedger", "pruneStale"], "Receipt operation."), ok: booleanSchema("Whether the receipt operation succeeded."), receiptIds: arraySchema(stringSchema("Receipt id affected or inspected.")), ledgerStatus: enumSchema(["valid", "invalid", "rebuilt", "not-checked", "degraded"], "Ledger status."), degraded: booleanSchema("True when receipt state was partially unavailable.") },
    outputRequired: ["schemaVersion", "action", "ok", "receiptIds", "ledgerStatus", "degraded"],
    privacyBoundary: "Local workflow receipt metadata only. Receipt payloads may contain task evidence; redact secrets and avoid exposing unrelated user content.",
    degradedMode: "If receipt state cannot be loaded, return ok=false with ledgerStatus=degraded and do not synthesize receipts.",
    riskClass: "guarded-mutation",
    mutationPolicy: Object.freeze({ ...GUARDED_MUTATION, mutationRequiresAction: Object.freeze(["issue", "rebuildLedger", "pruneStale"]), readOnlyActions: Object.freeze(["status", "verify"]) }),
  },
  {
    id: "verify",
    description: "Run or describe scoped verification commands and return evidence without broad release-gate validation unless requested by the workflow gate.",
    cliEquivalent: "node --check <file> | node --test tests/<name>.test.mjs | npm run check",
    input: { command: stringSchema("Verification command to run or record.", 1), scope: enumSchema(["syntax", "targeted", "release"], "Verification scope."), rootDir: stringSchema("Project root. Defaults to the current working directory."), expectedExitCode: integerSchema("Expected exit code.", 0, 255) },
    inputRequired: ["command", "scope"],
    output: { schemaVersion: constSchema(SUPERVIBE_FACADE_SCHEMA_VERSION), command: stringSchema("Verification command."), exitCode: nullableIntegerSchema("Observed exit code, or null when not run."), verdict: enumSchema(["pass", "fail", "not-run", "blocked"], "Verification verdict."), outputSummary: stringSchema("Bounded stdout/stderr summary."), degraded: booleanSchema("True when verification could not run normally.") },
    outputRequired: ["schemaVersion", "command", "verdict", "outputSummary", "degraded"],
    privacyBoundary: "Local command output only. Summaries must redact secrets and avoid uploading logs or artifacts.",
    degradedMode: "If execution is disallowed or unavailable, return verdict=not-run or blocked with the exact reason and expected command.",
    riskClass: "controlled-execution",
    mutationPolicy: Object.freeze({ mutatesWorkspace: false, requiresExplicitApproval: false, allowedEffects: Object.freeze(["read-local-files", "execute-local-verification", "print-output"]), forbiddenDuringDevelopmentForWorkflowKinds: Object.freeze(["plan", "graph", "task"]) }),
  },
  {
    id: "repair",
    description: "Run safe local repair primitives for Supervibe-managed state when canonical status or next-action state disagrees.",
    cliEquivalent: "node scripts/supervibe-safe-repair.mjs --dry-run | --apply",
    input: { target: enumSchema(["nextAction", "receipts", "ledger", "workflowState", "indexes"], "Repair target."), apply: booleanSchema("Apply the repair. False means diagnostic dry run."), reason: stringSchema("Reason repair is being requested.", 1), rootDir: stringSchema("Project root. Defaults to the current working directory.") },
    inputRequired: ["target", "reason"],
    output: { schemaVersion: constSchema(SUPERVIBE_FACADE_SCHEMA_VERSION), target: enumSchema(["nextAction", "receipts", "ledger", "workflowState", "indexes"], "Repair target."), applied: booleanSchema("Whether a mutation was applied."), ok: booleanSchema("Whether the repair completed successfully."), changes: arraySchema(stringSchema("Bounded description of each change.")), degraded: booleanSchema("True when repair could only diagnose or partially apply.") },
    outputRequired: ["schemaVersion", "target", "applied", "ok", "changes", "degraded"],
    privacyBoundary: "Local Supervibe-managed state only. Must not modify user-owned source files, host runtime configs, or unrelated workflow artifacts.",
    degradedMode: "If safe repair cannot prove ownership or consistency, do not apply changes; return diagnostic changes with degraded=true.",
    riskClass: "guarded-mutation",
    mutationPolicy: Object.freeze({ ...GUARDED_MUTATION, dryRunDefault: true, allowedTargets: Object.freeze(["nextAction", "receipts", "ledger", "workflowState", "indexes"]), forbiddenTargets: Object.freeze(["source", "host-runtime-config", "user-owned-instructions"]) }),
  },
];

const OPERATIONS = Object.freeze(OPERATION_DEFINITIONS.map((definition) => freezeOperation({
  id: definition.id,
  description: definition.description,
  cliEquivalent: definition.cliEquivalent,
  inputSchema: objectSchema(definition.input, definition.inputRequired || []),
  outputSchema: objectSchema(definition.output, definition.outputRequired || []),
  privacyBoundary: definition.privacyBoundary,
  degradedMode: definition.degradedMode,
  riskClass: definition.riskClass,
  mutationPolicy: definition.mutationPolicy,
})));

export const SUPERVIBE_FACADE_OPERATIONS = Object.freeze(Object.fromEntries(OPERATIONS.map((operation) => [operation.id, operation])));

export function listFacadeOperations() {
  return OPERATIONS.map(cloneOperation);
}

export function getFacadeOperation(id) {
  const operation = SUPERVIBE_FACADE_OPERATIONS[String(id || "")];
  return operation ? cloneOperation(operation) : null;
}

export function validateFacadeOperationContract(contract = {}) {
  const issues = [];
  const id = typeof contract.id === "string" ? contract.id : "unknown";
  requireField(contract, "id", "string", issues);
  if (typeof contract.id === "string" && !FACADE_OPERATION_IDS.includes(contract.id)) issues.push(issue("unknown-operation-id", "id", `Unknown facade operation id: ${contract.id}`));
  requireField(contract, "schemaVersion", "number", issues);
  if (contract.schemaVersion !== SUPERVIBE_FACADE_SCHEMA_VERSION) issues.push(issue("schema-version", id, `schemaVersion must be ${SUPERVIBE_FACADE_SCHEMA_VERSION}`));
  for (const field of ["description", "cliEquivalent", "privacyBoundary", "degradedMode", "riskClass"]) requireStrongString(contract, field, issues);
  validateJsonSchema(contract.inputSchema, "inputSchema", issues);
  validateJsonSchema(contract.outputSchema, "outputSchema", issues);
  validateMutationPolicy(contract.mutationPolicy, issues);
  return { schemaVersion: SUPERVIBE_FACADE_SCHEMA_VERSION, pass: issues.length === 0, operationId: id, issues };
}

export function validateFacadeCatalog(operations = OPERATIONS) {
  const list = Array.isArray(operations) ? operations : Object.values(operations || {});
  const issues = [];
  const seen = new Set();
  for (const operation of list) {
    for (const item of validateFacadeOperationContract(operation).issues) issues.push(item);
    if (!operation?.id) continue;
    if (seen.has(operation.id)) issues.push(issue("duplicate-operation-id", operation.id, "Facade operation ids must be unique."));
    seen.add(operation.id);
  }
  for (const expectedId of FACADE_OPERATION_IDS) {
    if (!seen.has(expectedId)) issues.push(issue("missing-operation-id", expectedId, "Facade catalog is missing a required operation."));
  }
  return { schemaVersion: SUPERVIBE_FACADE_SCHEMA_VERSION, pass: issues.length === 0, operationCount: list.length, redaction: FACADE_REDACTION_METADATA, issues };
}

function freezeOperation(operation) {
  return deepFreeze({ schemaVersion: SUPERVIBE_FACADE_SCHEMA_VERSION, redaction: FACADE_REDACTION_METADATA, ...operation });
}

function objectSchema(properties = {}, required = []) {
  return { $schema: JSON_SCHEMA_DRAFT, type: "object", additionalProperties: false, properties, required };
}

function stringSchema(description, minLength = 0) {
  return cleanSchema({ type: "string", description, minLength });
}

function nullableStringSchema(description) {
  return { type: ["string", "null"], description };
}

function booleanSchema(description) {
  return { type: "boolean", description };
}

function numberSchema(description) {
  return { type: "number", description };
}

function integerSchema(description, minimum, maximum) {
  return cleanSchema({ type: "integer", description, minimum, maximum });
}

function nullableIntegerSchema(description) {
  return { type: ["integer", "null"], description };
}

function enumSchema(values, description) {
  return { type: "string", enum: values, description };
}

function constSchema(value) {
  return { const: value, description: `Must be ${value}.` };
}

function arraySchema(items) {
  return { type: "array", items };
}

function cleanSchema(schema) {
  return Object.fromEntries(Object.entries(schema).filter(([, value]) => value !== undefined && value !== null));
}

function cloneOperation(operation) {
  return JSON.parse(JSON.stringify(operation));
}

function validateJsonSchema(schema, field, issues) {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) {
    issues.push(issue("missing-json-schema", field, `${field} must be an object JSON schema.`));
    return;
  }
  if (schema.type !== "object") issues.push(issue("json-schema-type", field, `${field} must describe an object payload.`));
  if (!schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties)) issues.push(issue("json-schema-properties", field, `${field} must define properties.`));
  if (!Array.isArray(schema.required)) issues.push(issue("json-schema-required", field, `${field} must include a required array, even when empty.`));
}

function validateMutationPolicy(policy, issues) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    issues.push(issue("missing-mutation-policy", "mutationPolicy", "mutationPolicy must be an object."));
    return;
  }
  if (typeof policy.mutatesWorkspace !== "boolean") issues.push(issue("mutation-policy-mutates", "mutationPolicy.mutatesWorkspace", "mutatesWorkspace must be boolean."));
  if (typeof policy.requiresExplicitApproval !== "boolean") issues.push(issue("mutation-policy-approval", "mutationPolicy.requiresExplicitApproval", "requiresExplicitApproval must be boolean."));
  if (!Array.isArray(policy.allowedEffects) || policy.allowedEffects.length === 0) issues.push(issue("mutation-policy-effects", "mutationPolicy.allowedEffects", "allowedEffects must be a non-empty array."));
}

function requireField(contract, field, type, issues) {
  if (typeof contract[field] !== type) issues.push(issue("missing-field", field, `${field} must be a ${type}.`));
}

function requireStrongString(contract, field, issues) {
  if (typeof contract[field] !== "string" || contract[field].trim().length < 8) issues.push(issue("weak-field", field, `${field} must be a meaningful string.`));
}

function issue(code, field, message) {
  return { code, field, message };
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const nested of Object.values(value)) deepFreeze(nested);
  return value;
}
