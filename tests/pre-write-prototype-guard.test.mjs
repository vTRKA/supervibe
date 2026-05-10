import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { REQUIRED_DESIGN_SYSTEM_SECTIONS } from "../scripts/lib/design-flow-state.mjs";

const hookPath = join(process.cwd(), "scripts", "hooks", "pre-write-prototype-guard.mjs");

async function fixture({
  approved = true,
  status = "approved",
  tokensState = undefined,
  flowStatus = status,
  approvedSections = REQUIRED_DESIGN_SYSTEM_SECTIONS,
  writeFlowState = true,
  capabilityPlan = false,
  builderTransaction = false,
} = {}) {
  const root = await mkdtemp(join(tmpdir(), "supervibe-prototype-guard-"));
  await mkdir(join(root, ".supervibe", "artifacts", "prototypes", "checkout"), { recursive: true });
  await writeFile(join(root, ".supervibe", "artifacts", "prototypes", "checkout", "config.json"), "{}");
  if (capabilityPlan) {
    const decisionsDir = join(root, ".supervibe", "artifacts", "prototypes", "checkout", "decisions");
    await mkdir(decisionsDir, { recursive: true });
    await writeFile(join(decisionsDir, "prototype-capability-plan.md"), [
      "# Prototype Capability Plan",
      "Mode: bundled-dependency",
      "## Libraries / APIs",
      "- Three.js",
      "## Rejected Native Alternative",
      "SVG could not prove the 3D interaction.",
      "## License / Security",
      "Local bundle only; no CDN.",
      "## Bundle / Performance",
      "Lazy-load scene.",
      "## Accessibility Fallback",
      "Adjacent semantic DOM table.",
      "## Reduced-Motion Fallback",
      "Static scene pose.",
      "## Verification Commands",
      "npm run validate:design-capability-plan",
    ].join("\n"));
  }
  if (builderTransaction) {
    await writeFile(join(root, ".supervibe", "artifacts", "prototypes", "checkout", ".prototype-builder-transaction.json"), JSON.stringify({
      status: "active",
      subjectId: "prototype-builder",
      stage: "stage-5-prototype-build",
    }, null, 2));
  }
  if (approved) {
    const systemDir = join(root, ".supervibe", "artifacts", "prototypes", "_design-system");
    await mkdir(systemDir, { recursive: true });
    await writeFile(join(root, ".supervibe", "artifacts", "prototypes", "_design-system", "manifest.json"), JSON.stringify({
      status,
      ...(tokensState ? { tokensState } : {}),
      sections: Object.fromEntries(REQUIRED_DESIGN_SYSTEM_SECTIONS.map((section) => [section, status])),
    }));
    if (writeFlowState) {
      await writeFile(join(systemDir, "design-flow-state.json"), JSON.stringify({
        creative_direction: { status: "selected" },
        design_system: {
          status: flowStatus,
          approved_sections: approvedSections,
          approved_at: flowStatus === "approved" ? "2026-05-03T00:00:00.000Z" : null,
          approved_by: flowStatus === "approved" ? "test-user" : null,
          feedback_hash: flowStatus === "approved" ? "sha256:test" : null,
        },
      }));
    }
  }
  return root;
}

async function runHook(projectRoot, event) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [hookPath], {
      env: { ...process.env, SUPERVIBE_PROJECT_DIR: projectRoot },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(event));
  });
}

test("prototype guard blocks raw design values after design system approval", async () => {
  const root = await fixture();
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, ".supervibe", "artifacts", "prototypes", "checkout", "style.css"),
        content: "<style>.btn{color:#ff00aa;padding:18px}</style>",
      },
    });

    assert.equal(result.code, 2);
    assert.match(result.stdout, /Raw color #ff00aa detected/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype guard allows tokenized prototype values after design system approval", async () => {
  const root = await fixture();
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, ".supervibe", "artifacts", "prototypes", "checkout", "style.css"),
        content: "<style>.btn{color:var(--color-primary-500);padding:var(--space-4)}</style>",
      },
    });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /"allow"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype guard blocks durable index writes without prototype-builder transaction or receipt", async () => {
  const root = await fixture();
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, ".supervibe", "artifacts", "prototypes", "checkout", "index.html"),
        content: "<style>.btn{color:var(--color-primary-500);padding:var(--space-4)}</style>",
      },
    });

    assert.equal(result.code, 2);
    assert.match(result.stdout, /prototype index writes require an active prototype-builder transaction/);
    assert.match(result.stdout, /stage-5-prototype-build receipt/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype guard blocks prototype writes after candidate design system exists", async () => {
  const root = await fixture({ status: "candidate", tokensState: "candidate" });
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, ".supervibe", "artifacts", "prototypes", "checkout", "index.html"),
        content: "<style>.btn{color:var(--color-primary-500);padding:var(--space-4)}</style>",
      },
    });

    assert.equal(result.code, 2);
    assert.match(result.stdout, /design_system\.status === approved/);
    assert.match(result.stdout, /Current status: candidate/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype guard blocks creative direction selected to prototype requested transition", async () => {
  const root = await fixture({
    status: "candidate",
    tokensState: "candidate",
    flowStatus: "candidate",
    approvedSections: [],
  });
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, ".supervibe", "artifacts", "prototypes", "checkout", "index.html"),
        content: "<style>.btn{color:var(--color-primary-500);padding:var(--space-4)}</style>",
      },
    });

    assert.equal(result.code, 2);
    assert.match(result.stdout, /Prototype phase is blocked/);
    assert.match(result.stdout, /Current status: candidate/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype guard blocks approved design system with missing required sections", async () => {
  const root = await fixture({ approvedSections: ["palette", "typography"] });
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, ".supervibe", "artifacts", "prototypes", "checkout", "index.html"),
        content: "<style>.btn{color:var(--color-primary-500);padding:var(--space-4)}</style>",
      },
    });

    assert.equal(result.code, 2);
    assert.match(result.stdout, /required design-system sections are approved/);
    assert.match(result.stdout, /spacing-density/);
    assert.match(result.stdout, /accessibility-platform/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype guard allows prototype-builder transaction after all design-system sections are approved", async () => {
  const root = await fixture({ builderTransaction: true });
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, ".supervibe", "artifacts", "prototypes", "checkout", "index.html"),
        content: "<style>.btn{color:var(--color-primary-500);padding:var(--space-4)}</style>",
      },
    });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /"allow"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype guard blocks dependency imports without capability plan", async () => {
  const root = await fixture();
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, ".supervibe", "artifacts", "prototypes", "checkout", "scripts", "scene.js"),
        content: "import * as THREE from 'three';\nconsole.log(THREE);",
      },
    });

    assert.equal(result.code, 2);
    assert.match(result.stdout, /Unapproved dependency coupling detected/);
    assert.match(result.stdout, /prototype-capability-plan\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype guard blocks canvas or 3D writes without capability plan", async () => {
  const root = await fixture();
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, ".supervibe", "artifacts", "prototypes", "checkout", "scripts", "scene.js"),
        content: "const canvas = document.querySelector('canvas');\nconst ctx = canvas.getContext('webgl');\n",
      },
    });

    assert.equal(result.code, 2);
    assert.match(result.stdout, /Advanced visual\/canvas\/3D capability detected/);
    assert.match(result.stdout, /prototype-capability-plan\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype guard allows dependency imports with capability plan", async () => {
  const root = await fixture({ capabilityPlan: true });
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, ".supervibe", "artifacts", "prototypes", "checkout", "scripts", "scene.js"),
        content: "import * as THREE from 'three';\nconsole.log(THREE);",
      },
    });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /"allow"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project artifact root guard blocks legacy root prototype writes", async () => {
  const root = await fixture({ approved: false });
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, "prototypes", "checkout", "index.html"),
        content: "<html></html>",
      },
    });

    assert.equal(result.code, 2);
    assert.match(result.stdout, /outside \.supervibe/);
    assert.match(result.stdout, /\.supervibe\/artifacts\/prototypes\/checkout\/index\.html/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("project artifact root guard blocks legacy root plan writes", async () => {
  const root = await fixture({ approved: false });
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, "docs", "plans", "checkout.md"),
        content: "# Plan\n",
      },
    });

    assert.equal(result.code, 2);
    assert.match(result.stdout, /outside \.supervibe/);
    assert.match(result.stdout, /\.supervibe\/artifacts\/plans\/checkout\.md/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design-system guard blocks raw visual values in production UI source", async () => {
  const root = await fixture();
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, "src", "components", "Button.tsx"),
        content: "export function Button(){ return <button style={{ color: '#123456', padding: '20px' }}>Save</button>; }",
      },
    });

    assert.equal(result.code, 2);
    assert.match(result.stdout, /Raw color #123456 detected/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("design-system guard allows tokenized production UI source", async () => {
  const root = await fixture();
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, "src", "components", "Button.tsx"),
        content: "export function Button(){ return <button className=\"bg-[var(--color-primary-500)] p-[var(--space-4)]\">Save</button>; }",
      },
    });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /"allow"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
