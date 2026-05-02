---
name: privacy-pii
description: >-
  PII classification (direct/quasi/sensitive), retention policies, GDPR/CCPA
  compliance, data minimization principle. Triggers: 'PII', 'GDPR',
  'персональные данные'.
applies-to:
  - any
mandatory: false
version: 1
last-verified: 2026-04-27T00:00:00.000Z
related-rules:
  - observability
  - operational-safety
---

# Privacy & PII

## Why this rule exists

Personal data leaks cost companies (GDPR fines up to 4% of revenue, CCPA fines, lost customer trust). The legal requirements are detailed; following defaults keeps you safe.

## When this rule applies

- Any system processing user data
- Especially: EU users (GDPR), California users (CCPA), healthcare (HIPAA), payment (PCI DSS)

## What to do

### Classification

- **Direct identifiers**: name, email, phone, SSN, account number, IP
- **Quasi-identifiers**: birthdate + ZIP + gender (uniquely identifies in combination)
- **Sensitive**: health, race, religion, sexual orientation, political opinion (extra protection)

### Principles

1. **Data minimization**: only collect what you need for stated purpose
2. **Purpose limitation**: use only for the stated purpose; new use needs new consent
3. **Storage limitation**: delete when purpose achieved (retention policy)
4. **Right to erasure**: support data deletion requests
5. **Right to portability**: support data export

### Logging

- NEVER log direct identifiers at info+ level
- Hash IDs if needed (`sha256(user_id)[:8]`)
- Scrub at logger level (not depend on developer remembering)

### Storage

- Encrypt at rest (database TDE / column-level encryption for sensitive)
- Encrypt in transit (TLS everywhere)
- Backups encrypted
- Access logs for sensitive tables

### Consent

- Explicit opt-in for marketing
- Granular (per category, not all-or-nothing)
- Easy withdrawal
- Recorded with timestamp + version of policy

### Data subject requests

- Erasure request: implementable in <30 days
- Export request: implementable in <30 days
- Maintain audit trail of requests

## Examples

### Bad

```python
logger.info(f"User {user.email} purchased {product}")  # email is PII
```

### Good

```python
logger.info("purchase", extra={
  "user_id_hash": hash_user_id(user.id),
  "product_sku": product.sku,
  # email NOT included
})
```

### Bad

```python
# Storing forever, no purpose limit
all_signups.save(user)
# 5 years later: user complaint, can't delete
```

### Good

```python
# Retention policy enforced
@scheduled_task(daily=True)
def purge_inactive():
  cutoff = now() - timedelta(days=730)  # 2y retention per policy
  inactive_users = users.where(last_active_at__lt=cutoff)
  for user in inactive_users:
    anonymize(user)
```

## Enforcement

- Logger middleware scrubs PII patterns
- Schema includes `pii: true` flag per column; CI checks usage
- Privacy Impact Assessment (PIA) for new data flows
- Periodic audit (annual)

## Related rules

- `observability` — logs must be PII-clean
- `security-auditor` agent reviews for PII exposure

## See also

- GDPR Articles 5-22
- CCPA / CPRA
- Privacy by Design (Cavoukian)
