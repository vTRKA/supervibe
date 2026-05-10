import assert from "node:assert/strict";
import test from "node:test";

import {
  DESIGN_AGENT_MATURITY_DIMENSIONS,
  buildDesignAgentMaturityReport,
  formatDesignAgentMaturityReport,
  scoreDesignAgentMaturity,
} from "../scripts/lib/design-agent-maturity.mjs";

const PASSING_CHECKS = Object.freeze({
  owner: {
    agentExists: true,
    agentInRoster: true,
    staleReferences: 0,
  },
  intelligence: {
    sourceCoverage: { pass: true },
    expertKnowledge: { pass: true },
    referenceQuality: { pass: true },
    domains: 44,
    rows: 4165,
    manifestHasPrecedence: true,
  },
  workflow: {
    readiness: { pass: true },
    flowGates: { pass: true },
    artifactWriteGates: { pass: true },
    styleboardQa: { pass: true },
    dynamicQuestions: { pass: true },
    variantSetValidator: true,
    variantSetScript: true,
  },
  creative: {
    creativeDirectorHasEmotion: true,
    creativeDirectorHasDistinctiveness: true,
    competitiveHasTrendRefresh: true,
    competitiveHasDifferentiation: true,
    regulatedTrustEvidence: true,
    creativeQaScore: true,
    creativeReferencePacks: true,
    diversityBenchmark: true,
  },
  system: {
    brandbookProducer: true,
    candidateManager: true,
    componentBridge: true,
    tokensExport: true,
    governance: true,
    prototypeTransfer: true,
    componentCoverage: true,
    tokenLeakageChecks: true,
    visualRegressionGate: true,
  },
  memory: {
    writerExists: true,
    writerTestsExist: true,
    intelligenceWritebackRules: true,
    ownerWritebackReady: true,
    effectivenessTelemetryTerms: true,
  },
  release: {
    agentContent: { pass: true },
    designTestFiles: 28,
    hasCli: true,
    packageScript: true,
    changelogMentionsDesignMaturity: true,
  },
});

test("design-agent maturity dimensions sum to 10", () => {
  assert.equal(DESIGN_AGENT_MATURITY_DIMENSIONS.reduce((sum, item) => sum + item.max, 0), 10);
});

test("design-agent maturity reaches 10 only when every design dimension passes", () => {
  const report = scoreDesignAgentMaturity({ checks: PASSING_CHECKS });

  assert.equal(report.pass, true);
  assert.equal(report.score, 10);
  assert.equal(report.blockers.length, 0);
  assert.match(formatDesignAgentMaturityReport(report), /design-system-owner: 1\.5\/1\.5 pass=true/);
});

test("design-agent maturity blocks 10/10 when the design-system owner is missing", () => {
  const report = scoreDesignAgentMaturity({
    checks: {
      ...PASSING_CHECKS,
      owner: {
        agentExists: false,
        agentInRoster: false,
        staleReferences: 7,
      },
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.score < 10);
  assert.ok(report.blockers.some((blocker) => blocker.id === "design-system-owner"));
});

test("design-agent maturity blocks 10/10 when reference quality is missing", () => {
  const report = scoreDesignAgentMaturity({
    checks: {
      ...PASSING_CHECKS,
      intelligence: {
        ...PASSING_CHECKS.intelligence,
        referenceQuality: { pass: false },
      },
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.score < 10);
  assert.ok(report.blockers.some((blocker) => blocker.id === "design-intelligence-resources"));
});

test("design-agent maturity blocks 10/10 when variant-set validation is missing", () => {
  const report = scoreDesignAgentMaturity({
    checks: {
      ...PASSING_CHECKS,
      workflow: {
        ...PASSING_CHECKS.workflow,
        variantSetValidator: false,
      },
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.score < 10);
  assert.ok(report.blockers.some((blocker) => blocker.id === "design-workflow-gates"));
});

test("design-agent maturity blocks 10/10 when creative reference packs are missing", () => {
  const report = scoreDesignAgentMaturity({
    checks: {
      ...PASSING_CHECKS,
      creative: {
        ...PASSING_CHECKS.creative,
        creativeReferencePacks: false,
      },
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.score < 10);
  assert.ok(report.blockers.some((blocker) => blocker.id === "creative-empathy-and-trends"));
});

test("design-agent maturity blocks 10/10 when design diversity benchmark is missing", () => {
  const report = scoreDesignAgentMaturity({
    checks: {
      ...PASSING_CHECKS,
      creative: {
        ...PASSING_CHECKS.creative,
        diversityBenchmark: false,
      },
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.score < 10);
  assert.ok(report.blockers.some((blocker) => blocker.id === "creative-empathy-and-trends"));
});

test("design-agent maturity blocks 10/10 when candidate manager is missing", () => {
  const report = scoreDesignAgentMaturity({
    checks: {
      ...PASSING_CHECKS,
      system: {
        ...PASSING_CHECKS.system,
        candidateManager: false,
      },
    },
  });

  assert.equal(report.pass, false);
  assert.ok(report.score < 10);
  assert.ok(report.blockers.some((blocker) => blocker.id === "design-system-implementation"));
});

test("current repository design-agent maturity is 10/10", () => {
  const report = buildDesignAgentMaturityReport(process.cwd());

  assert.equal(report.pass, true, formatDesignAgentMaturityReport(report));
  assert.equal(report.score, 10, formatDesignAgentMaturityReport(report));
});
