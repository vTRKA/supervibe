# Third-Party Licenses

Package: supervibe-framework v2.0.66
Source: package-lock.json
Scope: direct runtime and development dependencies plus lockfile license counts.

## Direct Dependency Inventory

| Package | Scope | Locked version | License | Integrity |
| --- | --- | --- | --- | --- |
| @huggingface/transformers | dependencies | 4.2.0 | Apache-2.0 | yes |
| chokidar | dependencies | 5.0.0 | MIT | yes |
| pptxgenjs | dependencies | 4.0.1 | MIT | yes |
| web-tree-sitter | dependencies | 0.26.8 | MIT | yes |
| ajv | devDependencies | 8.20.0 | MIT | yes |
| gray-matter | devDependencies | 4.0.3 | MIT | yes |
| husky | devDependencies | 9.1.7 | MIT | yes |
| knip | devDependencies | 5.88.1 | ISC | yes |
| yaml | devDependencies | 2.8.3 | ISC | yes |

## Bundled Design Intelligence Data

| Asset | Scope | Source commit | License | Runtime |
| --- | --- | --- | --- | --- |
| Adapted design intelligence CSV data pack | bundled data | b7e3af8 | MIT | Node-only lookup |

The data pack is documented in `docs/third-party-design-intelligence.md`. Original Python/CJS scripts, font binaries, screenshots, previews, CI workflows, and installer behavior are not bundled as runtime dependencies.

## Lockfile License Counts

| License | Packages |
| --- | ---: |
| (MIT AND Zlib) | 1 |
| (MIT OR CC0-1.0) | 1 |
| (MIT OR GPL-3.0-or-later) | 1 |
| 0BSD | 1 |
| Apache-2.0 | 17 |
| Apache-2.0 AND LGPL-3.0-or-later | 3 |
| Apache-2.0 AND LGPL-3.0-or-later AND MIT | 1 |
| BSD-2-Clause | 1 |
| BSD-3-Clause | 15 |
| ISC | 11 |
| LGPL-3.0-or-later | 10 |
| MIT | 101 |

## Release Rule

Direct dependencies and bundled release artifacts with unknown, missing, GPL-family, AGPL-family, LGPL-family, or proprietary licenses block release unless a reviewed exception with owner, expiry, rationale, and mitigation is recorded in the release-security evidence. Transitive copyleft counts stay visible here for review before any redistribution or bundling change.
