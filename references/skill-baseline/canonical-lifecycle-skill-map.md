# Canonical Lifecycle Skill Map

Source validation task: T029 subtask 4, canonical skill coverage validation and routing checks.

This file is the canonical created-versus-mapped skill manifest. It keeps baseline skill ideas local and maps them to existing Supervibe skills before any new skill is proposed. The embedded JSON block is parsed by `tests/canonical-lifecycle-skill-coverage.test.mjs`; keep it valid JSON and use repository-relative, forward-slash paths only.

Policy:

- Prefer existing local skills over creating duplicates.
- Every required skill must exist under `skills/` and have at least one agent owner.
- Coverage expectations are short stable identifiers so gaps are machine-checkable.
- Legacy lifecycle shortcuts are not represented here; this manifest is about skill coverage only.
- Owner capability rows group baseline skills by local owner task so coverage stays machine-checkable without a shortcut taxonomy.

```json canonical-lifecycle-skill-map
{
  "schemaVersion": 1,
  "kind": "canonical-lifecycle-skill-map",
  "sourceTaskRef": "T029.sub2",
  "ownerCapabilityTaskRef": "T029.sub3",
  "validationTaskRef": "T029.sub4",
  "skillCreationPolicy": {
    "mode": "map-existing-first",
    "createdSkills": [],
    "duplicateSkillPolicy": "forbidden-without-explicit-gap-and-owner",
    "aliasRequirement": "baseline skill coverage must name owner task, rationale, explicit gap, and local skill coverage"
  },
  "routingValidationPolicy": {
    "mode": "match-none-for-legacy-shortcuts",
    "matcher": "scripts/supervibe-commands.mjs",
    "inputSetSource": "legacy-shortcut-names-derived-in-test",
    "expectedDisposition": "match-none",
    "rationale": "Legacy lifecycle shortcut inputs must not route as product commands; canonical lifecycle coverage stays in local skills and owner expectations."
  },
  "coveragePolicy": {
    "requiredSkillPrefix": "supervibe:",
    "minimumRequiredSkillsPerSet": 4,
    "minimumCoverageExpectationsPerBaselineSkill": 3,
    "coverageExpectations": [
      "acceptanceCriteria",
      "apiDataContract",
      "atomicCommits",
      "behaviorPreservation",
      "branchHygiene",
      "browserRuntimeEvidence",
      "callerChecks",
      "changelogDecision",
      "communicationPlan",
      "compatibilityPlan",
      "complexityReduction",
      "contextPacking",
      "contractFirstBoundaries",
      "decisionRecord",
      "docsVerification",
      "errorSemantics",
      "failureFeedback",
      "featureFlags",
      "hostNeutralAliases",
      "hyrumRisk",
      "inlineCommentPolicy",
      "mcpUsage",
      "measurementFirst",
      "memoryRagCodeGraphPreflight",
      "monitoringEvidence",
      "noUnrelatedReverts",
      "nonGoals",
      "ownerCoverage",
      "performanceBudgets",
      "pipelineEvidence",
      "productionReadiness",
      "profilingEvidence",
      "promptSlicing",
      "protectedBlocks",
      "publicApiDocs",
      "publicInterfaceValidation",
      "qualityGates",
      "receiptGate",
      "redGreenRefactor",
      "regressionProof",
      "releaseTags",
      "removalEvidence",
      "residualRisk",
      "retrievalEvidence",
      "reviewerSeparation",
      "rollbackPlan",
      "scopeBoundary",
      "secretSafety",
      "securityPrivacyImpact",
      "sourceEvidence",
      "stagedRollout",
      "staleContextRecovery",
      "supportOwner",
      "targetedVerification",
      "taskBreakdown",
      "thinVerticalSlice",
      "userOutcome",
      "verificationEvidence",
      "versioning"
    ]
  },
  "skillCoverageSets": [
    {
      "coverageSetId": "discover-define",
      "label": "Discover and define",
      "baselineSkills": [
        "context-engineering",
        "idea-refine",
        "source-driven-development",
        "spec-driven-development"
      ],
      "requiredSkills": [
        "supervibe:requirements-intake",
        "supervibe:prd",
        "supervibe:brainstorming",
        "supervibe:explore-alternatives",
        "supervibe:project-memory",
        "supervibe:code-search",
        "supervibe:source-driven-development",
        "supervibe:verification"
      ],
      "coverageExpectations": [
        "userOutcome",
        "scopeBoundary",
        "nonGoals",
        "sourceEvidence",
        "retrievalEvidence",
        "memoryRagCodeGraphPreflight",
        "contextPacking",
        "targetedVerification"
      ],
      "ownerExpectation": "Discovery owners must prove user outcome, scope boundary, source evidence, and prior memory before planning or implementation.",
      "rationale": "Spec-driven and idea-refinement skills map to Supervibe intake, PRD, brainstorming, alternatives, and retrieval discipline."
    },
    {
      "coverageSetId": "plan-breakdown",
      "label": "Plan and break down work",
      "baselineSkills": [
        "context-engineering",
        "documentation-and-adrs",
        "planning-and-task-breakdown"
      ],
      "requiredSkills": [
        "supervibe:writing-plans",
        "supervibe:executing-plans",
        "supervibe:project-memory",
        "supervibe:code-search",
        "supervibe:source-driven-development",
        "supervibe:confidence-scoring",
        "supervibe:verification",
        "supervibe:using-supervibe-skills"
      ],
      "coverageExpectations": [
        "acceptanceCriteria",
        "taskBreakdown",
        "decisionRecord",
        "scopeBoundary",
        "receiptGate",
        "targetedVerification",
        "rollbackPlan",
        "ownerCoverage"
      ],
      "ownerExpectation": "Planning owners must encode acceptance criteria, verification, rollback, and owner expectations before durable work starts.",
      "rationale": "Planning and documentation skills map to Supervibe writing, execution, source, and skill-routing policies."
    },
    {
      "coverageSetId": "build-implement",
      "label": "Build and implement",
      "baselineSkills": [
        "ci-cd-and-automation",
        "git-workflow-and-versioning",
        "incremental-implementation",
        "test-driven-development"
      ],
      "requiredSkills": [
        "supervibe:new-feature",
        "supervibe:executing-plans",
        "supervibe:tdd",
        "supervibe:test-strategy",
        "supervibe:using-git-worktrees",
        "supervibe:feature-flag-rollout",
        "supervibe:code-search",
        "supervibe:verification"
      ],
      "coverageExpectations": [
        "thinVerticalSlice",
        "redGreenRefactor",
        "acceptanceCriteria",
        "atomicCommits",
        "branchHygiene",
        "qualityGates",
        "failureFeedback",
        "targetedVerification",
        "rollbackPlan"
      ],
      "ownerExpectation": "Implementation owners must keep work sliced, tested, reversible, and isolated from unrelated changes.",
      "rationale": "Implementation skills map to Supervibe plan execution, loop work items, TDD, test strategy, worktree safety, feature flags, and verification."
    },
    {
      "coverageSetId": "interface-ui-contracts",
      "label": "Design interfaces and UI contracts",
      "baselineSkills": [
        "api-and-interface-design",
        "browser-testing-with-devtools",
        "frontend-ui-engineering"
      ],
      "requiredSkills": [
        "supervibe:error-envelope-design",
        "supervibe:auth-flow-design",
        "supervibe:mock-data-contract",
        "supervibe:interaction-design-patterns",
        "supervibe:component-library-integration",
        "supervibe:ui-review-and-polish",
        "supervibe:browser-runtime-verification",
        "supervibe:browser-feedback",
        "supervibe:preview-server",
        "supervibe:verification"
      ],
      "coverageExpectations": [
        "contractFirstBoundaries",
        "hyrumRisk",
        "errorSemantics",
        "versioning",
        "publicInterfaceValidation",
        "apiDataContract",
        "browserRuntimeEvidence",
        "targetedVerification"
      ],
      "ownerExpectation": "Interface owners must encode API, data, auth, error, and UI behavior contracts before claiming implementation coverage.",
      "rationale": "Baseline API and frontend skills are split locally across interface contracts, UI patterns, component integration, browser evidence, and preview feedback."
    },
    {
      "coverageSetId": "test-verify",
      "label": "Test and verify",
      "baselineSkills": [
        "browser-testing-with-devtools",
        "doubt-driven-development",
        "performance-optimization",
        "test-driven-development"
      ],
      "requiredSkills": [
        "supervibe:tdd",
        "supervibe:test-strategy",
        "supervibe:verification",
        "supervibe:browser-runtime-verification",
        "supervibe:browser-feedback",
        "supervibe:preview-server",
        "supervibe:doubt-driven-development",
        "supervibe:confidence-scoring"
      ],
      "coverageExpectations": [
        "redGreenRefactor",
        "targetedVerification",
        "browserRuntimeEvidence",
        "measurementFirst",
        "performanceBudgets",
        "profilingEvidence",
        "regressionProof",
        "residualRisk"
      ],
      "ownerExpectation": "Verification owners must prove behavior with targeted tests, browser/runtime evidence when applicable, and residual risk when proof is incomplete.",
      "rationale": "Testing and performance skills are covered through TDD, test strategy, runtime verification, browser feedback, and scoring."
    },
    {
      "coverageSetId": "review-strengthen",
      "label": "Review, simplify, and harden",
      "baselineSkills": [
        "code-review-and-quality",
        "code-simplification",
        "doubt-driven-development",
        "security-and-hardening"
      ],
      "requiredSkills": [
        "supervibe:requesting-code-review",
        "supervibe:receiving-code-review",
        "supervibe:code-review",
        "supervibe:pre-pr-check",
        "supervibe:strengthen",
        "supervibe:rule-audit",
        "supervibe:incident-response",
        "supervibe:auth-flow-design",
        "supervibe:doubt-driven-development",
        "supervibe:verification"
      ],
      "coverageExpectations": [
        "reviewerSeparation",
        "behaviorPreservation",
        "protectedBlocks",
        "complexityReduction",
        "callerChecks",
        "securityPrivacyImpact",
        "secretSafety",
        "qualityGates",
        "targetedVerification",
        "residualRisk"
      ],
      "ownerExpectation": "Review owners must keep reviewer and worker evidence separate, preserve behavior, and surface security or policy risk.",
      "rationale": "Review, simplification, and hardening skills map to Supervibe review request/receive, strengthen, rule audit, incident response, auth, and verification skills."
    },
    {
      "coverageSetId": "release-ship",
      "label": "Release and ship",
      "baselineSkills": [
        "ci-cd-and-automation",
        "deprecation-and-migration",
        "git-workflow-and-versioning",
        "shipping-and-launch"
      ],
      "requiredSkills": [
        "supervibe:finishing-a-development-branch",
        "supervibe:feature-flag-rollout",
        "supervibe:pre-pr-check",
        "supervibe:using-git-worktrees",
        "supervibe:verification",
        "supervibe:confidence-scoring",
        "supervibe:incident-response"
      ],
      "coverageExpectations": [
        "stagedRollout",
        "monitoringEvidence",
        "rollbackPlan",
        "supportOwner",
        "productionReadiness",
        "compatibilityPlan",
        "communicationPlan",
        "releaseTags",
        "changelogDecision",
        "noUnrelatedReverts",
        "qualityGates"
      ],
      "ownerExpectation": "Release owners must prove staged rollout, support ownership, rollback, and no unrelated reverts before claiming release readiness.",
      "rationale": "Launch skills map to Supervibe update/status guidance, branch finishing, feature flags, pre-PR checks, worktree safety, incident response, and verification."
    },
    {
      "coverageSetId": "maintain-adapt",
      "label": "Maintain, adapt, and recover",
      "baselineSkills": [
        "debugging-and-error-recovery",
        "deprecation-and-migration",
        "documentation-and-adrs",
        "source-driven-development"
      ],
      "requiredSkills": [
        "supervibe:adapt",
        "supervibe:systematic-debugging",
        "supervibe:trigger-diagnostics",
        "supervibe:source-driven-development",
        "supervibe:rule-audit",
        "supervibe:sync-rules",
        "supervibe:project-memory",
        "supervibe:code-search",
        "supervibe:verification",
        "supervibe:incident-response"
      ],
      "coverageExpectations": [
        "staleContextRecovery",
        "compatibilityPlan",
        "communicationPlan",
        "docsVerification",
        "decisionRecord",
        "sourceEvidence",
        "rollbackPlan",
        "failureFeedback",
        "targetedVerification"
      ],
      "ownerExpectation": "Maintenance owners must preserve compatibility, record decisions, recover from stale context, and verify repairs.",
      "rationale": "Baseline debugging, migration, documentation, and source-driven work map to Supervibe adapt, diagnostics, rule sync, source evidence, and incident recovery."
    },
    {
      "coverageSetId": "operate-orchestrate",
      "label": "Operate and orchestrate",
      "baselineSkills": [
        "context-engineering",
        "planning-and-task-breakdown",
        "using-agent-skills"
      ],
      "requiredSkills": [
        "supervibe:autonomous-agent-loop",
        "supervibe:subagent-driven-development",
        "supervibe:dispatching-parallel-agents",
        "supervibe:using-supervibe-skills",
        "supervibe:project-memory",
        "supervibe:code-search",
        "supervibe:verification",
        "supervibe:confidence-scoring",
        "supervibe:mcp-discovery"
      ],
      "coverageExpectations": [
        "hostNeutralAliases",
        "receiptGate",
        "ownerCoverage",
        "memoryRagCodeGraphPreflight",
        "contextPacking",
        "mcpUsage",
        "promptSlicing",
        "targetedVerification"
      ],
      "ownerExpectation": "Orchestration owners must keep host-neutral aliases, callable specialists, receipts, and retrieval evidence aligned.",
      "rationale": "Baseline skill usage and planning behavior map to Supervibe loop orchestration, parallel specialists, project memory, code search, verification, and MCP discovery."
    }
  ],
  "ownerCapabilityMap": [
    {
      "owner": "T002",
      "capabilityArea": "Plan breakdown and execution ownership",
      "baselineSkills": [
        "planning-and-task-breakdown"
      ],
      "localEquivalentSkills": [
        "supervibe:writing-plans",
        "supervibe:executing-plans"
      ],
      "coverageExpectations": [
        "taskBreakdown",
        "acceptanceCriteria",
        "ownerCoverage",
        "targetedVerification"
      ],
      "ownerRationale": "Planning ownership stays on local plan writing and execution skills, with acceptance criteria and owner coverage required before durable work.",
      "verificationFocus": "Plan artifacts must retain task breakdown, acceptance criteria, owner coverage, and targeted verification."
    },
    {
      "owner": "T004",
      "capabilityArea": "Discovery, API contracts, and UI capability ownership",
      "baselineSkills": [
        "api-and-interface-design",
        "frontend-ui-engineering",
        "idea-refine"
      ],
      "localEquivalentSkills": [
        "supervibe:error-envelope-design",
        "supervibe:auth-flow-design",
        "supervibe:interaction-design-patterns",
        "supervibe:component-library-integration",
        "supervibe:ui-review-and-polish",
        "supervibe:brainstorming",
        "supervibe:explore-alternatives"
      ],
      "coverageExpectations": [
        "userOutcome",
        "scopeBoundary",
        "nonGoals",
        "contractFirstBoundaries",
        "hyrumRisk",
        "errorSemantics",
        "versioning",
        "publicInterfaceValidation",
        "apiDataContract",
        "browserRuntimeEvidence"
      ],
      "ownerRationale": "Discovery and interface coverage is split across local intake, API contract, interaction, component, and polish skills instead of creating duplicate baseline skills.",
      "verificationFocus": "Owner evidence must connect user outcome, API/data boundaries, UI behavior, and browser/runtime proof when interface behavior is affected."
    },
    {
      "owner": "T005",
      "capabilityArea": "Doubt-driven verification ownership",
      "baselineSkills": [
        "doubt-driven-development"
      ],
      "localEquivalentSkills": [
        "supervibe:doubt-driven-development"
      ],
      "coverageExpectations": [
        "residualRisk",
        "targetedVerification",
        "reviewerSeparation"
      ],
      "ownerRationale": "The baseline doubt-driven behavior has a direct local skill and must keep residual risk explicit.",
      "verificationFocus": "Verification must name the doubt, targeted proof, and residual risk."
    },
    {
      "owner": "T006",
      "capabilityArea": "Browser runtime evidence ownership",
      "baselineSkills": [
        "browser-testing-with-devtools"
      ],
      "localEquivalentSkills": [
        "supervibe:browser-runtime-verification",
        "supervibe:browser-feedback",
        "supervibe:preview-server"
      ],
      "coverageExpectations": [
        "browserRuntimeEvidence",
        "targetedVerification",
        "regressionProof"
      ],
      "ownerRationale": "Browser testing maps to local runtime verification, preview, and feedback skills without importing baseline host hooks.",
      "verificationFocus": "Browser evidence must include runtime proof, targeted checks, and regression evidence."
    },
    {
      "owner": "T007",
      "capabilityArea": "Source evidence ownership",
      "baselineSkills": [
        "source-driven-development"
      ],
      "localEquivalentSkills": [
        "supervibe:source-driven-development"
      ],
      "coverageExpectations": [
        "sourceEvidence",
        "publicApiDocs",
        "docsVerification"
      ],
      "ownerRationale": "The baseline source-driven behavior has a direct local skill that anchors official source evidence.",
      "verificationFocus": "Source-driven outputs must cite current sources and verify docs or public API claims."
    },
    {
      "owner": "T008",
      "capabilityArea": "TDD and regression proof ownership",
      "baselineSkills": [
        "test-driven-development"
      ],
      "localEquivalentSkills": [
        "supervibe:tdd",
        "supervibe:test-strategy",
        "supervibe:verification"
      ],
      "coverageExpectations": [
        "redGreenRefactor",
        "targetedVerification",
        "regressionProof"
      ],
      "ownerRationale": "The local TDD, test strategy, and verification skills cover the baseline test-driven behavior.",
      "verificationFocus": "Evidence must preserve red/green/refactor flow, targeted verification, and regression proof."
    },
    {
      "owner": "T009",
      "capabilityArea": "Debugging and recovery ownership",
      "baselineSkills": [
        "debugging-and-error-recovery"
      ],
      "localEquivalentSkills": [
        "supervibe:systematic-debugging",
        "supervibe:trigger-diagnostics"
      ],
      "coverageExpectations": [
        "failureFeedback",
        "staleContextRecovery",
        "rollbackPlan"
      ],
      "ownerRationale": "Debugging coverage stays with local systematic debugging and diagnostics skills.",
      "verificationFocus": "Repairs must capture failure feedback, stale-context recovery, rollback path, and targeted proof."
    },
    {
      "owner": "T010",
      "capabilityArea": "Security and hardening ownership",
      "baselineSkills": [
        "security-and-hardening"
      ],
      "localEquivalentSkills": [
        "supervibe:incident-response",
        "supervibe:auth-flow-design",
        "supervibe:rule-audit"
      ],
      "coverageExpectations": [
        "securityPrivacyImpact",
        "secretSafety",
        "qualityGates"
      ],
      "ownerRationale": "Security behavior is covered through incident response, auth flow design, rule audit, and security-focused agents.",
      "verificationFocus": "Hardening evidence must include privacy/security impact, secret safety, and quality gates."
    },
    {
      "owner": "T011",
      "capabilityArea": "Implementation, automation, git, and launch ownership",
      "baselineSkills": [
        "ci-cd-and-automation",
        "git-workflow-and-versioning",
        "incremental-implementation",
        "shipping-and-launch"
      ],
      "localEquivalentSkills": [
        "supervibe:feature-flag-rollout",
        "supervibe:finishing-a-development-branch",
        "supervibe:verification",
        "supervibe:using-git-worktrees",
        "supervibe:new-feature",
        "supervibe:executing-plans"
      ],
      "coverageExpectations": [
        "qualityGates",
        "failureFeedback",
        "secretSafety",
        "featureFlags",
        "pipelineEvidence",
        "atomicCommits",
        "branchHygiene",
        "releaseTags",
        "changelogDecision",
        "noUnrelatedReverts",
        "thinVerticalSlice",
        "acceptanceCriteria",
        "targetedVerification",
        "rollbackPlan",
        "stagedRollout",
        "monitoringEvidence",
        "supportOwner",
        "productionReadiness"
      ],
      "ownerRationale": "Implementation and launch coverage maps to local feature, execution, worktree, flag, branch finish, and verification skills.",
      "verificationFocus": "Owner evidence must show sliced implementation, branch hygiene, quality gates, rollout controls, rollback, and no unrelated reverts."
    },
    {
      "owner": "T012",
      "capabilityArea": "Review and simplification ownership",
      "baselineSkills": [
        "code-review-and-quality",
        "code-simplification"
      ],
      "localEquivalentSkills": [
        "supervibe:requesting-code-review",
        "supervibe:receiving-code-review",
        "supervibe:code-review",
        "supervibe:pre-pr-check",
        "supervibe:strengthen",
        "supervibe:rule-audit"
      ],
      "coverageExpectations": [
        "reviewerSeparation",
        "qualityGates",
        "targetedVerification",
        "behaviorPreservation",
        "protectedBlocks",
        "complexityReduction",
        "callerChecks",
        "verificationEvidence"
      ],
      "ownerRationale": "Review and simplification stay split across local review request/receive, pre-PR, strengthen, and rule audit skills.",
      "verificationFocus": "Review evidence must separate worker and reviewer roles while proving behavior preservation and simplification safety."
    },
    {
      "owner": "T016",
      "capabilityArea": "Requirements and PRD ownership",
      "baselineSkills": [
        "spec-driven-development"
      ],
      "localEquivalentSkills": [
        "supervibe:requirements-intake",
        "supervibe:prd"
      ],
      "coverageExpectations": [
        "userOutcome",
        "scopeBoundary",
        "acceptanceCriteria"
      ],
      "ownerRationale": "Spec-driven behavior maps to local requirements intake and PRD artifacts.",
      "verificationFocus": "Requirements evidence must record outcome, scope boundary, and acceptance criteria."
    },
    {
      "owner": "T021",
      "capabilityArea": "Context and retrieval ownership",
      "baselineSkills": [
        "context-engineering"
      ],
      "localEquivalentSkills": [
        "supervibe:project-memory",
        "supervibe:code-search",
        "supervibe:using-supervibe-skills",
        "supervibe:mcp-discovery"
      ],
      "coverageExpectations": [
        "contextPacking",
        "retrievalEvidence",
        "promptSlicing",
        "mcpUsage",
        "staleContextRecovery"
      ],
      "ownerRationale": "Context behavior is local memory, Code RAG, CodeGraph, skill routing, and MCP discovery discipline.",
      "verificationFocus": "Context evidence must include retrieval, compact context, MCP usage where relevant, and stale-context recovery."
    },
    {
      "owner": "T022",
      "capabilityArea": "Migration, documentation, and performance support ownership",
      "baselineSkills": [
        "deprecation-and-migration",
        "documentation-and-adrs",
        "performance-optimization"
      ],
      "localEquivalentSkills": [
        "supervibe:feature-flag-rollout",
        "supervibe:finishing-a-development-branch",
        "supervibe:source-driven-development",
        "supervibe:writing-plans",
        "supervibe:prd",
        "supervibe:verification",
        "supervibe:browser-runtime-verification"
      ],
      "coverageExpectations": [
        "compatibilityPlan",
        "communicationPlan",
        "stagedRollout",
        "rollbackPlan",
        "removalEvidence",
        "decisionRecord",
        "publicApiDocs",
        "inlineCommentPolicy",
        "docsVerification",
        "measurementFirst",
        "performanceBudgets",
        "profilingEvidence",
        "regressionProof",
        "residualRisk"
      ],
      "ownerRationale": "Migration, docs, and performance remain mapped to existing release, source, planning, verification, and browser evidence skills until a dedicated local skill is justified.",
      "verificationFocus": "Owner evidence must cover compatibility, communication, decision records, measurement-first performance proof, and residual risk."
    },
    {
      "owner": "T030",
      "capabilityArea": "Skill routing ownership",
      "baselineSkills": [
        "using-agent-skills"
      ],
      "localEquivalentSkills": [
        "supervibe:using-supervibe-skills"
      ],
      "coverageExpectations": [
        "hostNeutralAliases",
        "receiptGate",
        "ownerCoverage"
      ],
      "ownerRationale": "Baseline skill usage maps to host-neutral Supervibe skill routing.",
      "verificationFocus": "Routing evidence must keep host-neutral aliases, receipt gates, and owner coverage aligned."
    }
  ],
  "baselineSkillCoverage": [
    {
      "baselineSkill": "api-and-interface-design",
      "coverageSetIds": [
        "interface-ui-contracts"
      ],
      "localEquivalent": [
        "supervibe:error-envelope-design",
        "supervibe:auth-flow-design"
      ],
      "gap": "Baseline is general API boundary design; local coverage is split into error envelopes and auth flow contracts.",
      "action": "map",
      "owner": "T004",
      "coverageExpectations": [
        "contractFirstBoundaries",
        "hyrumRisk",
        "errorSemantics",
        "versioning",
        "publicInterfaceValidation",
        "apiDataContract"
      ],
      "rationale": "API behavior is split across error envelope and auth flow contract skills."
    },
    {
      "baselineSkill": "browser-testing-with-devtools",
      "coverageSetIds": [
        "interface-ui-contracts",
        "test-verify"
      ],
      "localEquivalent": [
        "supervibe:browser-runtime-verification",
        "supervibe:browser-feedback",
        "supervibe:preview-server"
      ],
      "gap": "Local browser skills exist but must retain runtime evidence and DevTools-like diagnostics.",
      "action": "deepen",
      "owner": "T006",
      "coverageExpectations": [
        "browserRuntimeEvidence",
        "targetedVerification",
        "regressionProof"
      ],
      "rationale": "Browser evidence is local runtime proof through preview and feedback rather than copied DevTools hooks."
    },
    {
      "baselineSkill": "ci-cd-and-automation",
      "coverageSetIds": [
        "build-implement",
        "release-ship"
      ],
      "localEquivalent": [
        "supervibe:feature-flag-rollout",
        "supervibe:finishing-a-development-branch",
        "supervibe:verification"
      ],
      "gap": "Local release skills cover gates and flags but CI/CD automation needs lifecycle mapping.",
      "action": "map",
      "owner": "T011",
      "coverageExpectations": [
        "qualityGates",
        "failureFeedback",
        "secretSafety",
        "featureFlags",
        "pipelineEvidence"
      ],
      "rationale": "Automation coverage is through flags, branch finish gates, and verification evidence."
    },
    {
      "baselineSkill": "code-review-and-quality",
      "coverageSetIds": [
        "review-strengthen"
      ],
      "localEquivalent": [
        "supervibe:requesting-code-review",
        "supervibe:receiving-code-review",
        "supervibe:code-review",
        "supervibe:pre-pr-check"
      ],
      "gap": "Local review flow is split across request/receive/pre-PR and reviewer agents.",
      "action": "map",
      "owner": "T012",
      "coverageExpectations": [
        "reviewerSeparation",
        "qualityGates",
        "targetedVerification"
      ],
      "rationale": "Code review is split into request, receive, review, and pre-PR gates."
    },
    {
      "baselineSkill": "code-simplification",
      "coverageSetIds": [
        "review-strengthen"
      ],
      "localEquivalent": [
        "supervibe:strengthen",
        "supervibe:code-review",
        "supervibe:rule-audit"
      ],
      "gap": "No exact simplification skill; local behavior is distributed across strengthen, review, and rule audit.",
      "action": "deepen",
      "owner": "T012",
      "coverageExpectations": [
        "behaviorPreservation",
        "protectedBlocks",
        "complexityReduction",
        "callerChecks",
        "verificationEvidence"
      ],
      "rationale": "Simplification is allowed only through strengthen, review, and rule-audit evidence that preserves behavior."
    },
    {
      "baselineSkill": "context-engineering",
      "coverageSetIds": [
        "discover-define",
        "plan-breakdown",
        "operate-orchestrate"
      ],
      "localEquivalent": [
        "supervibe:project-memory",
        "supervibe:code-search",
        "supervibe:using-supervibe-skills",
        "supervibe:mcp-discovery"
      ],
      "gap": "Local context model is stronger through memory/RAG/CodeGraph but needs concise anatomy docs.",
      "action": "fixed",
      "owner": "T021",
      "coverageExpectations": [
        "contextPacking",
        "retrievalEvidence",
        "promptSlicing",
        "mcpUsage",
        "staleContextRecovery"
      ],
      "rationale": "Context engineering is local memory, Code RAG, CodeGraph, skill routing, and MCP discovery discipline."
    },
    {
      "baselineSkill": "debugging-and-error-recovery",
      "coverageSetIds": [
        "maintain-adapt"
      ],
      "localEquivalent": [
        "supervibe:systematic-debugging",
        "supervibe:trigger-diagnostics"
      ],
      "gap": "Local debugging exists and should keep stop-the-line and recovery evidence explicit.",
      "action": "deepen",
      "owner": "T009",
      "coverageExpectations": [
        "failureFeedback",
        "staleContextRecovery",
        "rollbackPlan"
      ],
      "rationale": "Debugging maps to systematic debugging plus trigger diagnostics and recovery proof."
    },
    {
      "baselineSkill": "deprecation-and-migration",
      "coverageSetIds": [
        "release-ship",
        "maintain-adapt"
      ],
      "localEquivalent": [
        "supervibe:feature-flag-rollout",
        "supervibe:finishing-a-development-branch"
      ],
      "gap": "Migration/deprecation is not a first-class skill yet; template coverage planned.",
      "action": "split",
      "owner": "T022",
      "coverageExpectations": [
        "compatibilityPlan",
        "communicationPlan",
        "stagedRollout",
        "rollbackPlan",
        "removalEvidence"
      ],
      "rationale": "Migration behavior is split across feature flags and release branch finish evidence."
    },
    {
      "baselineSkill": "documentation-and-adrs",
      "coverageSetIds": [
        "plan-breakdown",
        "maintain-adapt"
      ],
      "localEquivalent": [
        "supervibe:source-driven-development",
        "supervibe:writing-plans",
        "supervibe:prd"
      ],
      "gap": "Docs/ADR behavior exists across planning/source skills, not one canonical skill.",
      "action": "map",
      "owner": "T022",
      "coverageExpectations": [
        "decisionRecord",
        "publicApiDocs",
        "inlineCommentPolicy",
        "docsVerification"
      ],
      "rationale": "Documentation and ADR behavior is represented through source-driven evidence, plans, and PRD artifacts."
    },
    {
      "baselineSkill": "doubt-driven-development",
      "coverageSetIds": [
        "test-verify",
        "review-strengthen"
      ],
      "localEquivalent": [
        "supervibe:doubt-driven-development"
      ],
      "gap": "Direct local equivalent exists.",
      "action": "fixed",
      "owner": "T005",
      "coverageExpectations": [
        "residualRisk",
        "targetedVerification",
        "reviewerSeparation"
      ],
      "rationale": "A direct local doubt-driven skill exists and is used by verification and review sets."
    },
    {
      "baselineSkill": "frontend-ui-engineering",
      "coverageSetIds": [
        "interface-ui-contracts"
      ],
      "localEquivalent": [
        "supervibe:interaction-design-patterns",
        "supervibe:component-library-integration",
        "supervibe:ui-review-and-polish"
      ],
      "gap": "Local UI work is split into interaction, component integration, and review polish.",
      "action": "deepen",
      "owner": "T004",
      "coverageExpectations": [
        "publicInterfaceValidation",
        "browserRuntimeEvidence",
        "apiDataContract"
      ],
      "rationale": "Frontend work is split across interaction, component integration, and UI polish skills."
    },
    {
      "baselineSkill": "git-workflow-and-versioning",
      "coverageSetIds": [
        "build-implement",
        "release-ship"
      ],
      "localEquivalent": [
        "supervibe:using-git-worktrees",
        "supervibe:finishing-a-development-branch"
      ],
      "gap": "Local git behavior focuses on worktrees and branch finish; versioning language is thinner.",
      "action": "deepen",
      "owner": "T011",
      "coverageExpectations": [
        "atomicCommits",
        "branchHygiene",
        "releaseTags",
        "changelogDecision",
        "noUnrelatedReverts"
      ],
      "rationale": "Git workflow is local worktree hygiene plus branch finish and release evidence."
    },
    {
      "baselineSkill": "idea-refine",
      "coverageSetIds": [
        "discover-define"
      ],
      "localEquivalent": [
        "supervibe:brainstorming",
        "supervibe:explore-alternatives"
      ],
      "gap": "Local ideation is split between divergent brainstorming and alternative exploration.",
      "action": "map",
      "owner": "T004",
      "coverageExpectations": [
        "userOutcome",
        "scopeBoundary",
        "nonGoals"
      ],
      "rationale": "Idea refinement maps to brainstorming and alternative exploration before planning."
    },
    {
      "baselineSkill": "incremental-implementation",
      "coverageSetIds": [
        "build-implement"
      ],
      "localEquivalent": [
        "supervibe:new-feature",
        "supervibe:executing-plans"
      ],
      "gap": "Local execution covers plan-driven implementation but needs explicit thin-slice anatomy.",
      "action": "deepen",
      "owner": "T011",
      "coverageExpectations": [
        "thinVerticalSlice",
        "acceptanceCriteria",
        "targetedVerification",
        "rollbackPlan"
      ],
      "rationale": "Incremental implementation maps to new-feature and executing-plans skill contracts."
    },
    {
      "baselineSkill": "performance-optimization",
      "coverageSetIds": [
        "test-verify"
      ],
      "localEquivalent": [
        "supervibe:verification",
        "supervibe:browser-runtime-verification"
      ],
      "gap": "Performance is mostly handled by reviewer agents and verification, not a dedicated skill.",
      "action": "support-skill-exception",
      "owner": "T022",
      "coverageExpectations": [
        "measurementFirst",
        "performanceBudgets",
        "profilingEvidence",
        "regressionProof",
        "residualRisk"
      ],
      "exceptionRationale": "Performance remains a support-skill mapping until a dedicated local skill is created; measurement and regression proof are enforced through verification and browser runtime evidence.",
      "rationale": "Performance proof is measurement-first verification plus runtime browser evidence."
    },
    {
      "baselineSkill": "planning-and-task-breakdown",
      "coverageSetIds": [
        "plan-breakdown",
        "operate-orchestrate"
      ],
      "localEquivalent": [
        "supervibe:writing-plans",
        "supervibe:executing-plans"
      ],
      "gap": "Local planning is represented by writing-plans and executing-plans.",
      "action": "fixed",
      "owner": "T002",
      "coverageExpectations": [
        "taskBreakdown",
        "acceptanceCriteria",
        "ownerCoverage"
      ],
      "rationale": "Planning maps directly to writing and executing plans."
    },
    {
      "baselineSkill": "security-and-hardening",
      "coverageSetIds": [
        "review-strengthen"
      ],
      "localEquivalent": [
        "supervibe:incident-response",
        "supervibe:auth-flow-design",
        "supervibe:rule-audit"
      ],
      "gap": "Security behavior exists across incident/auth/rule skills and security agents.",
      "action": "deepen",
      "owner": "T010",
      "coverageExpectations": [
        "securityPrivacyImpact",
        "secretSafety",
        "qualityGates"
      ],
      "rationale": "Security hardening is covered by incident response, auth flow design, and rule audit."
    },
    {
      "baselineSkill": "shipping-and-launch",
      "coverageSetIds": [
        "release-ship"
      ],
      "localEquivalent": [
        "supervibe:feature-flag-rollout",
        "supervibe:finishing-a-development-branch"
      ],
      "gap": "Local launch flow needs release-readiness template alignment.",
      "action": "deepen",
      "owner": "T011",
      "coverageExpectations": [
        "stagedRollout",
        "monitoringEvidence",
        "rollbackPlan",
        "supportOwner",
        "productionReadiness"
      ],
      "rationale": "Launch coverage is feature-flag rollout plus release branch finish evidence."
    },
    {
      "baselineSkill": "source-driven-development",
      "coverageSetIds": [
        "discover-define",
        "maintain-adapt"
      ],
      "localEquivalent": [
        "supervibe:source-driven-development"
      ],
      "gap": "Direct local equivalent exists.",
      "action": "fixed",
      "owner": "T007",
      "coverageExpectations": [
        "sourceEvidence",
        "publicApiDocs",
        "docsVerification"
      ],
      "rationale": "A direct local source-driven skill exists and anchors source evidence."
    },
    {
      "baselineSkill": "spec-driven-development",
      "coverageSetIds": [
        "discover-define"
      ],
      "localEquivalent": [
        "supervibe:requirements-intake",
        "supervibe:prd"
      ],
      "gap": "Local spec flow is split into requirements intake and PRD artifacts.",
      "action": "map",
      "owner": "T016",
      "coverageExpectations": [
        "userOutcome",
        "scopeBoundary",
        "acceptanceCriteria"
      ],
      "rationale": "Spec-driven work maps to requirements intake and PRD artifacts."
    },
    {
      "baselineSkill": "test-driven-development",
      "coverageSetIds": [
        "build-implement",
        "test-verify"
      ],
      "localEquivalent": [
        "supervibe:tdd",
        "supervibe:test-strategy",
        "supervibe:verification"
      ],
      "gap": "Direct TDD and test strategy equivalents exist but must preserve red/green/prove-it gates.",
      "action": "fixed",
      "owner": "T008",
      "coverageExpectations": [
        "redGreenRefactor",
        "targetedVerification",
        "regressionProof"
      ],
      "rationale": "TDD maps directly to local TDD, test strategy, and verification."
    },
    {
      "baselineSkill": "using-agent-skills",
      "coverageSetIds": [
        "operate-orchestrate"
      ],
      "localEquivalent": [
        "supervibe:using-supervibe-skills"
      ],
      "gap": "Direct meta-skill equivalent exists; routing map must stay host-neutral.",
      "action": "fixed",
      "owner": "T030",
      "coverageExpectations": [
        "hostNeutralAliases",
        "receiptGate",
        "ownerCoverage"
      ],
      "rationale": "Baseline skill usage maps to host-neutral Supervibe skill routing."
    }
  ],
  "baselineEvidence": {
    "capturedRevision": "2026-05-13-localized",
    "refreshedAt": "2026-05-13",
    "fixture": "tests/fixtures/skill-anatomy-baseline.json",
    "equivalenceDoc": "references/skill-baseline/skill-equivalence-map.md"
  },
  "legacyShortcutPolicy": {
    "mode": "not-represented",
    "lifecycleSurface": "supervibe-skills-only",
    "rationale": "Legacy short lifecycle aliases are not skills; local lifecycle coverage is expressed through Supervibe skills, owner expectations, and coverage identifiers."
  }
}
```
