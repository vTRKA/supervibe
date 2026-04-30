import assert from "node:assert/strict";
import test from "node:test";
import {
  auditDependencyProvenance,
  auditDependencyProvenanceData,
  collectDirectDependencies,
  collectLicenseInventory,
  findUnpinnedExecutableDownloadUrls,
  renderThirdPartyLicenseInventory,
} from "../scripts/lib/supervibe-dependency-provenance.mjs";

test("dependency provenance audit passes current lockfile and records direct dependency evidence", async () => {
  const audit = await auditDependencyProvenance({ rootDir: process.cwd() });

  assert.equal(audit.pass, true);
  assert.equal(audit.score, 10);
  assert.ok(audit.directDependencies.some((dep) => dep.name === "chokidar" && dep.integrity && dep.license === "MIT"));
  assert.ok(audit.licenseInventory.length > audit.directDependencies.length);
});

test("dependency provenance flags lockfile drift, missing integrity, unsupported engines, and mutable installer URLs", () => {
  const packageJson = {
    version: "1.0.0",
    engines: { node: ">=20" },
    dependencies: { bad: "^1.0.0" },
  };
  const packageLock = {
    packages: {
      "": { version: "0.9.0", dependencies: { bad: "^0.9.0" } },
      "node_modules/bad": {
        version: "1.0.0",
        resolved: "https://registry.npmjs.org/bad/-/bad-1.0.0.tgz",
        license: "GPL-3.0",
        engines: { node: ">=22" },
      },
    },
  };

  const audit = auditDependencyProvenanceData({
    packageJson,
    packageLock,
    scripts: { installSh: 'REF="${SUPERVIBE_REF:-master}"\ncurl https://raw.githubusercontent.com/o/r/main/install.sh' },
  });

  assert.equal(audit.pass, false);
  assert.ok(audit.issues.some((issue) => issue.code === "lockfile-version-drift"));
  assert.ok(audit.issues.some((issue) => issue.code === "dependency-spec-drift"));
  assert.ok(audit.issues.some((issue) => issue.code === "dependency-integrity-missing"));
  assert.ok(audit.issues.some((issue) => issue.code === "dependency-license-incompatible"));
  assert.ok(audit.issues.some((issue) => issue.code === "dependency-engine-unsupported"));
  assert.ok(audit.issues.some((issue) => issue.code === "unpinned-executable-download"));
});

test("license inventory renderer is deterministic and includes direct dependency rows", () => {
  const packageJson = {
    dependencies: { a: "^1.0.0" },
    devDependencies: { b: "^2.0.0" },
  };
  const packageLock = {
    packages: {
      "": { dependencies: packageJson.dependencies, devDependencies: packageJson.devDependencies },
      "node_modules/a": { version: "1.0.1", integrity: "sha512-a", license: "MIT" },
      "node_modules/b": { version: "2.0.1", integrity: "sha512-b", license: "ISC", dev: true },
    },
  };
  const audit = auditDependencyProvenanceData({ packageJson, packageLock });
  const inventory = renderThirdPartyLicenseInventory(audit, { packageName: "pkg", packageVersion: "1.0.0" });

  assert.deepEqual(collectDirectDependencies(packageJson, packageLock).map((dep) => dep.name), ["a", "b"]);
  assert.deepEqual(collectLicenseInventory(packageLock).map((dep) => dep.license), ["MIT", "ISC"]);
  assert.match(inventory, /\| a \| dependencies \| 1\.0\.1 \| MIT \| yes \|/);
  assert.match(inventory, /\| b \| devDependencies \| 2\.0\.1 \| ISC \| yes \|/);
});

test("unpinned executable URL detector catches mutable refs only", () => {
  assert.deepEqual(findUnpinnedExecutableDownloadUrls({ installSh: "https://raw.githubusercontent.com/o/r/v1.2.3/install.sh" }), []);
  assert.deepEqual(findUnpinnedExecutableDownloadUrls({ installSh: "https://raw.githubusercontent.com/vTRKA/supervibe/main/install.sh" }), []);
  assert.equal(findUnpinnedExecutableDownloadUrls({ installSh: "https://raw.githubusercontent.com/o/r/master/install.sh" }).length, 1);
});
