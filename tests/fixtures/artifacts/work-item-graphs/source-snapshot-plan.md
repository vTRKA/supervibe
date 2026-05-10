# Source Snapshot Fixture Plan

## Task 1: Validate snapshot fixture
**Files:**
- Test: `tests/validate-work-item-graphs.test.mjs`
**Acceptance Criteria:**
- Strict source snapshot validation can compare an adjacent plan snapshot hash.
```bash
node --test tests/validate-work-item-graphs.test.mjs
```
