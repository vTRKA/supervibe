import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const hookPath = join(process.cwd(), "scripts", "hooks", "pre-write-prototype-guard.mjs");

async function fixture({ approved = true, status = "approved", tokensState = undefined } = {}) {
  const root = await mkdtemp(join(tmpdir(), "supervibe-prototype-guard-"));
  await mkdir(join(root, "prototypes", "checkout"), { recursive: true });
  await writeFile(join(root, "prototypes", "checkout", "config.json"), "{}");
  if (approved) {
    await mkdir(join(root, "prototypes", "_design-system"), { recursive: true });
    await writeFile(join(root, "prototypes", "_design-system", "manifest.json"), JSON.stringify({
      status,
      ...(tokensState ? { tokensState } : {}),
      sections: { palette: status, spacing: status },
    }));
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
        file_path: join(root, "prototypes", "checkout", "index.html"),
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
        file_path: join(root, "prototypes", "checkout", "index.html"),
        content: "<style>.btn{color:var(--color-primary-500);padding:var(--space-4)}</style>",
      },
    });

    assert.equal(result.code, 0);
    assert.match(result.stdout, /"allow"/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype guard blocks raw design values after candidate design system exists", async () => {
  const root = await fixture({ status: "candidate", tokensState: "candidate" });
  try {
    const result = await runHook(root, {
      tool_name: "Write",
      tool_input: {
        file_path: join(root, "prototypes", "checkout", "index.html"),
        content: "<style>.btn{color:#ff00aa;padding:18px}</style>",
      },
    });

    assert.equal(result.code, 2);
    assert.match(result.stdout, /candidate or final design system exists/);
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
