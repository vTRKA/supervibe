# <Feature> Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use supervibe:subagent-driven-development (recommended) or supervibe:executing-plans.

**Goal:** <one sentence>

**Architecture:** <2-3 sentences>

**Tech Stack:** <key libraries>

**Constraints:** <hard rules>

---

## AI/Data Boundary

| Area | Allowed | Redaction | Approval gate |
|------|---------|-----------|---------------|
| Local source reads | yes/no | <paths/fields> | <when> |
| Local writes | yes/no | <paths> | <when> |
| MCP/browser automation | yes/no/tools | <selectors/regions> | <when> |
| Figma/design source | yes/no/file/node | <hidden layers/assets> | <writeback approval> |
| External network/API | yes/no/targets | <request/response fields> | <approval receipt> |
| PII/secrets | references only/no access | <fields> | <approver> |

**Blocked without exact approval:** production mutation, destructive migration,
credential changes, billing/account/DNS/access-control changes, Figma writeback,
and screenshots containing private data.

---

## File Structure

### Created
```
<directory tree of new files>
```

### Modified
- `path/to/file.ext` - <what changes>

---

## Critical Path

`T1 -> T3 -> T5 -> T8 -> T-FINAL` (sequential)

Off-path: T2 || T4; T6 || T7

---

## Task N: <Component>

**Files:**
- Create: `path/file.ext`
- Modify: `path/existing.ext:NN-MM`
- Test: `tests/path/test.mjs`

**Estimated time:** 15min (confidence: high)
**Rollback:** `git revert <sha>`
**Risks:** R1: <desc>; mitigation: <how>

- [ ] **Step 1: Write failing test**
```javascript
// test code
```

- [ ] **Step 2: Run test, verify fail**

- [ ] **Step 3: Minimal impl**

- [ ] **Step 4: Run test, verify pass**

- [ ] **Step 5: Commit**

---

## REVIEW GATE 1 (after Phase A)

Before Phase B:
- [ ] All Phase A committed and tests green
- [ ] No regressions
- [ ] User approved

---

## Self-Review

### Spec coverage
| Requirement | Task |

### Placeholder scan
- No TBD found

### Type consistency
- All types match

---

## Execution Handoff

**Subagent-Driven batches:** ...
**Inline batches:** ...

Which approach?
