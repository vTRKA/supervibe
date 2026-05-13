# Source Driven Official Doc Cache

Use cached docs only as a speed optimization, never as final proof.

- Cache entries must record origin URL, retrieval time, product/library version, and validator command.
- Stale, undated, or version-mismatched entries must be revalidated at origin before implementation.
- Security, legal, payment, provider-config, and release facts require primary-source confirmation.
- If local code and docs disagree, record the local evidence, the doc evidence, and the chosen compatibility decision.
