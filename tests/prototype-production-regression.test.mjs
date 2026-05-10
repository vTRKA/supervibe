import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  validatePrototypeProductionRegression,
} from "../scripts/lib/prototype-production-regression.mjs";

async function writeUtf8(root, relPath, content) {
  const absPath = join(root, ...relPath.split("/"));
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, content, "utf8");
}

test("prototype-production regression passes matching section, text, counts, canonical URL, and overflow evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-proto-prod-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/landing/index.html", `<!doctype html>
<link rel="canonical" href="https://example.test/">
<main>
  <section id="hero"><h1>Build Trust Faster</h1><a href="/demo">Book demo</a></section>
  <section id="proof"><h2>Case outcomes</h2><button>See proof</button></section>
</main>
`);
    await writeUtf8(root, "frontend/src/app/page.tsx", `export const metadata = { alternates: { canonical: "https://example.test/" } };
export default function Page() {
  return <main>
    <section id="hero"><h1>Build Trust Faster</h1><a href="/demo">Book demo</a></section>
    <section id="proof"><h2>Case outcomes</h2><button>See proof</button></section>
  </main>;
}
`);
    await writeUtf8(root, ".supervibe/artifacts/prototypes/landing/_verification/overflow.md", "375 no overflow\n1440 no overflow\n1920 no overflow\n");

    const result = validatePrototypeProductionRegression(root, {
      slug: "landing",
      productionPath: "frontend/src/app/page.tsx",
    });

    assert.equal(result.pass, true);
    assert.equal(result.issues.length, 0);
    assert.equal(result.overflowEvidence.pass, true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype-production regression flags production drift", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-proto-prod-drift-"));
  try {
    await writeUtf8(root, ".supervibe/artifacts/prototypes/landing/index.html", `<!doctype html>
<main>
  <section id="hero"><h1>Build Trust Faster</h1><button>Book demo</button></section>
  <section id="proof"><h2>Case outcomes</h2></section>
</main>
`);
    await writeUtf8(root, "frontend/src/app/page.tsx", `export default function Page() {
  return <main>
    <section id="proof"><h2>Case outcomes</h2></section>
    <section id="hero"><h1>Different headline</h1></section>
  </main>;
}
`);

    const result = validatePrototypeProductionRegression(root, {
      slug: "landing",
      productionPath: "frontend/src/app/page.tsx",
    });

    assert.equal(result.pass, false);
    assert.ok(result.issues.some((issue) => issue.code === "section-order-drift"));
    assert.ok(result.issues.some((issue) => issue.code === "key-text-missing"));
    assert.ok(result.issues.some((issue) => issue.code === "component-count-regression"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype-production strict mode fails when the pair paths are missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-proto-prod-strict-missing-pair-"));
  try {
    const result = validatePrototypeProductionRegression(root, {
      slug: "",
      requirePair: true,
    });

    assert.equal(result.pass, false);
    assert.equal(result.status, "missing-pair-path");
    assert.ok(result.issues.some((issue) => issue.code === "missing-pair-path"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("prototype-production strict mode fails when declared pair files are absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "supervibe-proto-prod-strict-absent-files-"));
  try {
    const result = validatePrototypeProductionRegression(root, {
      prototypePath: ".supervibe/artifacts/prototypes/landing/index.html",
      productionPath: "frontend/src/app/page.tsx",
      requirePair: true,
    });

    assert.equal(result.pass, false);
    assert.equal(result.status, "pair-not-found");
    assert.ok(result.issues.some((issue) => issue.code === "pair-not-found"));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
