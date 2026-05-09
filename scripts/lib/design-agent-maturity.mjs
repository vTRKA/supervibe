import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import {
  validateAgentContentQuality,
} from "../validate-agent-content-quality.mjs";
import {
  validateDesignArtifactWriteGates,
} from "../validate-design-artifact-write-gates.mjs";
import {
  validateDesignExpertKnowledge,
} from "../validate-design-expert-knowledge.mjs";
import {
  validateDesignFlowGates,
} from "../validate-design-flow-gates.mjs";
import {
  validateDesignReferenceQuality,
} from "../validate-design-reference-quality.mjs";
import {
  validateDesignDiversityBenchmark,
} from "../validate-design-diversity-benchmark.mjs";
import {
  validateDesignReadiness,
} from "../validate-design-readiness.mjs";
import {
  validateDesignSourceCoverage,
} from "../validate-design-source-coverage.mjs";
import {
  validateDesignStyleboardQa,
} from "../validate-design-styleboard-qa.mjs";
import {
  validateDynamicQuestionSystems,
} from "../validate-dynamic-question-systems.mjs";
import {
  validateCreativeReferencePacks,
} from "../validate-creative-reference-packs.mjs";

export const DESIGN_AGENT_MATURITY_DIMENSIONS = Object.freeze([
  { id: "design-system-owner", max: 1.5 },
  { id: "design-intelligence-resources", max: 1.5 },
  { id: "design-workflow-gates", max: 1.5 },
  { id: "creative-empathy-and-trends", max: 1.5 },
  { id: "design-system-implementation", max: 1.5 },
  { id: "design-memory-and-effectiveness", max: 1.0 },
  { id: "design-regression-and-release", max: 1.5 },
]);

export function buildDesignAgentMaturityReport(rootDir = process.cwd()) {
  const checks = collectDesignAgentMaturityChecks(rootDir);
  return scoreDesignAgentMaturity({ checks });
}

function collectDesignAgentMaturityChecks(rootDir = process.cwd()) {
  const manifest = readJson(join(rootDir, "skills", "design-intelligence", "data", "manifest.json"), { domains: [] });
  const rows = (manifest.domains || []).reduce((sum, domain) => sum + Number(domain.rows || 0), 0);
  const domains = (manifest.domains || []).length;
  const designFiles = readDesignFiles(rootDir);
  const packageJson = readJson(join(rootDir, "package.json"), { scripts: {} });

  const sourceCoverage = validateDesignSourceCoverage(rootDir);
  const expertKnowledge = validateDesignExpertKnowledge(rootDir);
  const referenceQuality = validateDesignReferenceQuality(rootDir);
  const diversityBenchmark = validateDesignDiversityBenchmark(rootDir);
  const readiness = validateDesignReadiness(rootDir);
  const flowGates = validateDesignFlowGates(rootDir);
  const artifactWriteGates = validateDesignArtifactWriteGates(rootDir);
  const styleboardQa = validateDesignStyleboardQa(rootDir);
  const dynamicQuestions = validateDynamicQuestionSystems();
  const agentContent = validateAgentContentQuality(rootDir);
  const creativeReferencePacks = validateCreativeReferencePacks(rootDir);

  return {
    owner: inspectDesignSystemOwner(rootDir),
    intelligence: {
      sourceCoverage,
      expertKnowledge,
      referenceQuality,
      domains,
      rows,
      manifestHasPrecedence: Array.isArray(manifest.precedence)
        && manifest.precedence.join(" > ").includes("approved design system"),
    },
    workflow: {
      readiness,
      flowGates,
      artifactWriteGates,
      styleboardQa,
      dynamicQuestions,
    },
    creative: {
      creativeDirectorHasEmotion: /emotional anchors|feeling held in form|user's body/i.test(designFiles.creativeDirector),
      creativeDirectorHasDistinctiveness: /Distinctiveness|Novelty.*last|category-distinctiveness/i.test(designFiles.creativeDirector),
      competitiveHasTrendRefresh: /trend-tracking|capture date|dated|refresh-vs-reuse|outdated-references/i.test(designFiles.competitiveResearcher),
      competitiveHasDifferentiation: /differentiation|convention|emerging|idiosyncratic|anti-pattern/i.test(designFiles.competitiveResearcher),
      regulatedTrustEvidence: /Regulated Trust Domains|evidence before creative\s+defaults|Domain evidence/i.test(designFiles.designExpertKnowledge),
      creativeQaScore: /distinctiveness|emotional fit|user empathy|category fit|trend awareness|future-proof/i.test(designFiles.designSystemArchitect),
      creativeReferencePacks: creativeReferencePacks.pass === true,
      diversityBenchmark: diversityBenchmark.pass === true,
    },
    system: {
      brandbookProducer: /brandbook-producer\.mjs run|Executable producer boundary/i.test(designFiles.brandbook),
      candidateManager: existsSync(join(rootDir, "scripts", "design-system-candidate-manager.mjs"))
        && Boolean(packageJson.scripts?.["design:candidate-manager"])
        && /design-system-candidate-manager\.mjs/i.test(`${designFiles.brandbook}\n${designFiles.designSystemGovernance}`),
      componentBridge: /componentLibrary|bridgeDepth|library-bridge|token references/i.test(designFiles.componentLibraryIntegration),
      tokensExport: /Tailwind|MUI|CSS vars|Style Dictionary|tokens/i.test(designFiles.tokensExport),
      governance: /Design System Governance|Candidate tokens do not unlock prototypes|pre-write-prototype-guard/i.test(designFiles.designSystemGovernance),
      prototypeTransfer: /approved prototype \+ final tokens|drift threshold|Mock Data Contract/i.test(designFiles.prototypeToProduction),
      componentCoverage: /data table|command palette|chart shell|skeleton|pagination|settings shell/i.test(designFiles.designSystemArchitect),
      tokenLeakageChecks: /raw hex|magic px|library default|off-token|inline cubic-beziers/i.test(designFiles.designSystemArchitect),
      visualRegressionGate: /styleboard quality|contrast|overflow|focus-visible|text overlap|reduced motion/i.test(designFiles.designSystemArchitect),
    },
    memory: {
      writerExists: existsSync(join(rootDir, "scripts", "lib", "design-memory-writer.mjs")),
      writerTestsExist: existsSync(join(rootDir, "tests", "design-memory-writer.test.mjs")),
      intelligenceWritebackRules: /Memory Writeback Rules|Accepted decisions|Rejected alternatives/i.test(designFiles.designIntelligence),
      ownerWritebackReady: /design memory writeback|design-memory-writer|accepted and rejected/i.test(designFiles.designSystemArchitect),
      effectivenessTelemetryTerms: /first-pass acceptance|revision rounds|token drift|prototype-to-production drift|design-agent effectiveness|effectiveness/i.test(designFiles.designSystemArchitect),
    },
    release: {
      agentContent,
      designTestFiles: countDesignTestFiles(rootDir),
      hasCli: existsSync(join(rootDir, "scripts", "supervibe-design-maturity.mjs")),
      packageScript: Boolean(packageJson.scripts?.["supervibe:design-maturity"]),
      changelogMentionsDesignMaturity: /design-agent maturity|design maturity|design-system architect/i.test(readText(join(rootDir, "CHANGELOG.md"))),
    },
  };
}

export function scoreDesignAgentMaturity({ checks = {} } = {}) {
  const dimensions = [];
  const add = (id, max, pass, evidence, nextAction) => {
    dimensions.push({
      id,
      max,
      score: pass ? max : 0,
      pass,
      evidence,
      nextAction,
    });
  };

  const ownerPass = checks.owner?.agentExists === true
    && checks.owner?.agentInRoster === true
    && checks.owner?.staleReferences === 0;
  add(
    "design-system-owner",
    1.5,
    ownerPass,
    `agentExists=${checks.owner?.agentExists === true}, agentInRoster=${checks.owner?.agentInRoster === true}, staleReferences=${checks.owner?.staleReferences ?? "unknown"}`,
    "Add agents/_design/design-system-architect.md and route stale references to supervibe:_design:design-system-architect.",
  );

  const intelligencePass = checks.intelligence?.sourceCoverage?.pass === true
    && checks.intelligence?.expertKnowledge?.pass === true
    && checks.intelligence?.referenceQuality?.pass === true
    && Number(checks.intelligence?.domains || 0) >= 44
    && Number(checks.intelligence?.rows || 0) >= 4165
    && checks.intelligence?.manifestHasPrecedence === true;
  add(
    "design-intelligence-resources",
    1.5,
    intelligencePass,
    `sourceCoverage=${checks.intelligence?.sourceCoverage?.pass === true}, expertKnowledge=${checks.intelligence?.expertKnowledge?.pass === true}, referenceQuality=${checks.intelligence?.referenceQuality?.pass === true}, domains=${checks.intelligence?.domains || 0}, rows=${checks.intelligence?.rows || 0}, precedence=${checks.intelligence?.manifestHasPrecedence === true}`,
    "Restore the local design intelligence manifest, reference cards, design expert knowledge coverage, and reference-quality gate.",
  );

  const workflowPass = checks.workflow?.readiness?.pass === true
    && checks.workflow?.flowGates?.pass === true
    && checks.workflow?.artifactWriteGates?.pass === true
    && checks.workflow?.styleboardQa?.pass === true
    && checks.workflow?.dynamicQuestions?.pass === true;
  add(
    "design-workflow-gates",
    1.5,
    workflowPass,
    `readiness=${checks.workflow?.readiness?.pass === true}, flow=${checks.workflow?.flowGates?.pass === true}, writeGates=${checks.workflow?.artifactWriteGates?.pass === true}, styleboardQa=${checks.workflow?.styleboardQa?.pass === true}, dynamicQuestions=${checks.workflow?.dynamicQuestions?.pass === true}`,
    "Run and fix design readiness, flow, artifact write, styleboard QA, and dynamic question validators.",
  );

  const creativePass = Object.values(checks.creative || {}).every(Boolean);
  add(
    "creative-empathy-and-trends",
    1.5,
    creativePass,
    `emotion=${checks.creative?.creativeDirectorHasEmotion === true}, distinctiveness=${checks.creative?.creativeDirectorHasDistinctiveness === true}, trendRefresh=${checks.creative?.competitiveHasTrendRefresh === true}, differentiation=${checks.creative?.competitiveHasDifferentiation === true}, regulatedTrust=${checks.creative?.regulatedTrustEvidence === true}, creativeQa=${checks.creative?.creativeQaScore === true}, creativePacks=${checks.creative?.creativeReferencePacks === true}, diversityBenchmark=${checks.creative?.diversityBenchmark === true}`,
    "Strengthen creative director, competitive design research, regulated-trust evidence, creative reference packs, design diversity benchmark, and creative QA scoring.",
  );

  const systemPass = Object.values(checks.system || {}).every(Boolean);
  add(
    "design-system-implementation",
    1.5,
    systemPass,
    `producer=${checks.system?.brandbookProducer === true}, candidateManager=${checks.system?.candidateManager === true}, bridge=${checks.system?.componentBridge === true}, tokensExport=${checks.system?.tokensExport === true}, governance=${checks.system?.governance === true}, transfer=${checks.system?.prototypeTransfer === true}, componentCoverage=${checks.system?.componentCoverage === true}, tokenLeakage=${checks.system?.tokenLeakageChecks === true}, visualGate=${checks.system?.visualRegressionGate === true}`,
    "Complete candidate manager, token/component coverage, library bridge, governance, visual QA, and drift checks.",
  );

  const memoryPass = Object.values(checks.memory || {}).every(Boolean);
  add(
    "design-memory-and-effectiveness",
    1.0,
    memoryPass,
    `writer=${checks.memory?.writerExists === true}, writerTests=${checks.memory?.writerTestsExist === true}, intelligenceRules=${checks.memory?.intelligenceWritebackRules === true}, ownerWriteback=${checks.memory?.ownerWritebackReady === true}, telemetryTerms=${checks.memory?.effectivenessTelemetryTerms === true}`,
    "Wire design memory writeback and design effectiveness telemetry terms into the owner workflow.",
  );

  const releasePass = checks.release?.agentContent?.pass === true
    && Number(checks.release?.designTestFiles || 0) >= 28
    && checks.release?.hasCli === true
    && checks.release?.packageScript === true
    && checks.release?.changelogMentionsDesignMaturity === true;
  add(
    "design-regression-and-release",
    1.5,
    releasePass,
    `agentContent=${checks.release?.agentContent?.pass === true}, designTests=${checks.release?.designTestFiles || 0}, cli=${checks.release?.hasCli === true}, packageScript=${checks.release?.packageScript === true}, changelog=${checks.release?.changelogMentionsDesignMaturity === true}`,
    "Add design maturity CLI/script, keep design tests above threshold, and document release hardening.",
  );

  const score = Number(dimensions.reduce((sum, item) => sum + item.score, 0).toFixed(2));
  return {
    schemaVersion: 1,
    score,
    maxScore: 10,
    pass: score >= 10,
    status: score >= 10 ? "design-10-of-10-ready" : score >= 9 ? "near-10-design-gaps" : "design-hardening-required",
    dimensions,
    blockers: dimensions.filter((item) => !item.pass).map((item) => ({
      id: item.id,
      evidence: item.evidence,
      nextAction: item.nextAction,
    })),
  };
}

export function formatDesignAgentMaturityReport(report = {}) {
  const lines = [
    "SUPERVIBE_DESIGN_AGENT_MATURITY",
    `PASS: ${report.pass === true}`,
    `SCORE: ${report.score || 0}/${report.maxScore || 10}`,
    `STATUS: ${report.status || "unknown"}`,
    "DIMENSIONS:",
  ];
  for (const item of report.dimensions || []) {
    lines.push(`- ${item.id}: ${item.score}/${item.max} pass=${item.pass} evidence="${item.evidence}"`);
  }
  lines.push(`BLOCKERS: ${(report.blockers || []).length}`);
  for (const blocker of report.blockers || []) {
    lines.push(`BLOCKER: ${blocker.id} - ${blocker.evidence}`);
    lines.push(`NEXT_ACTION: ${blocker.nextAction}`);
  }
  return lines.join("\n");
}

function inspectDesignSystemOwner(rootDir) {
  const relPath = "agents/_design/design-system-architect.md";
  const agentPath = join(rootDir, ...relPath.split("/"));
  const agentExists = existsSync(agentPath);
  const agentInRoster = readText(join(rootDir, "docs", "agent-roster.md")).includes("`design-system-architect`");
  const staleReferences = findStaleDesignSystemArchitectReferences(rootDir).length;
  return { agentExists, agentInRoster, staleReferences };
}

function findStaleDesignSystemArchitectReferences(rootDir) {
  const stale = [];
  for (const file of walkFiles(join(rootDir, "agents"), /\.md$/)) {
    const rel = normalizeRel(file.slice(rootDir.length + 1));
    if (rel === "agents/_design/design-system-architect.md") continue;
    const text = readText(file);
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      if (!/design-system-architect/i.test(line)) continue;
      if (/supervibe:_design:design-system-architect/.test(line)) continue;
      stale.push(`${rel}:${index + 1}`);
    }
  }
  return stale;
}

function readDesignFiles(rootDir) {
  return {
    brandbook: readText(join(rootDir, "skills", "brandbook", "SKILL.md")),
    componentLibraryIntegration: readText(join(rootDir, "skills", "component-library-integration", "SKILL.md")),
    creativeDirector: readText(join(rootDir, "agents", "_design", "creative-director.md")),
    competitiveResearcher: readText(join(rootDir, "agents", "_ops", "competitive-design-researcher.md")),
    designExpertKnowledge: readText(join(rootDir, "docs", "references", "design-expert-knowledge.md")),
    designIntelligence: readText(join(rootDir, "skills", "design-intelligence", "SKILL.md")),
    designSystemArchitect: readText(join(rootDir, "agents", "_design", "design-system-architect.md")),
    designSystemGovernance: readText(join(rootDir, "rules", "design-system-governance.md")),
    prototypeToProduction: readText(join(rootDir, "rules", "prototype-to-production.md")),
    tokensExport: readText(join(rootDir, "skills", "tokens-export", "SKILL.md")),
  };
}

function countDesignTestFiles(rootDir) {
  return walkFiles(join(rootDir, "tests"), /design.*\.test\.mjs$/).length;
}

function walkFiles(dir, pattern) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(path, pattern));
    else if (entry.isFile() && pattern.test(entry.name)) out.push(path);
  }
  return out;
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, "utf8") : "";
}

function readJson(path, fallback = {}) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeRel(path) {
  return String(path || "").replaceAll("\\", "/");
}
