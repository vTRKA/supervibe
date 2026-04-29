# Autonomous Loop Production Readiness

Production-intent work may be prepared autonomously, but production mutation is
approval-gated. A completed production-ready report must include requirements,
implementation evidence, tests, supply-chain checks, CI or local equivalent,
security/privacy review, deploy or packaging evidence, rollback, smoke checks,
observability, documentation, and approval boundaries.

The loop must stop before production deploy, destructive migration, credential
mutation, remote server mutation, DNS, account, billing, or access-control
changes unless an explicit approval lease covers that exact action.
