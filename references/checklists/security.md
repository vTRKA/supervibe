# Security Reference Pack

Use this when work touches trust boundaries, data handling, execution, release
paths, credentials, or policy-bearing docs.

## Gates

- Identify the protected asset: user data, repo state, credentials, runtime
  authority, model/tool output, or release artifact.
- Check authentication, authorization, input validation, output encoding,
  secrets exposure, network boundaries, file-system writes, and destructive
  actions.
- Require deny-by-default behavior for ambiguous privilege, path, host, or
  adapter selection.
- Block completion when exploitability is plausible and no mitigation or
  documented owner decision exists.

## Evidence

- Record threat, impacted asset, trust boundary, exploit path, mitigation, and
  verification command or review artifact.
- Cite local rules or vendor/security standards used for the decision; prefer
  project policy over generic advice when they conflict.
- For secrets, record only the class, location pattern, and remediation status;
  never paste secret values.
- For host adapters, record whether behavior is shared or adapter-specific.

## Failure Modes

- Sanitizing display text while leaving command, path, or network sinks unsafe.
- Allowing prompt/tool output to choose files, commands, URLs, or permissions
  without validation.
- Copying provider-specific hook behavior into shared rules without an adapter
  contract.
- Treating absence of known incidents as evidence that a path is safe.

## Acceptance Check

- A concrete abuse case was considered for every changed boundary.
- Mitigations are implemented or the remaining risk is explicitly assigned to a
  documented owner/gate.
- Verification proves the mitigation, not just that the file still parses.
