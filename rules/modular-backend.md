---
name: modular-backend
description: "Backend organized by bounded contexts (modules) with explicit boundaries, internal-only dependencies, public contract per module"
applies-to: [laravel, django, rails, spring-boot, fastapi, nestjs]
mandatory: false
version: 1.0
last-verified: 2026-04-27
related-rules: [fsd, no-dead-code]
---

# Modular Backend

## Why this rule exists

Backend monoliths grow until everything imports everything. Refactoring becomes risky. Splitting into microservices prematurely adds operational pain. Modular monolith is the middle path: ship as one process, organize as separate modules.

## When this rule applies

- Backend projects with ≥3 distinct domains (e.g., billing + auth + catalog + inventory)
- Projects expecting team growth beyond 5 engineers

This rule does NOT apply when: single-domain CRUD app, throwaway prototype, microservice (already split).

## What to do

### Module structure

Each module owns:
- **Public API** — events, commands, queries it exposes
- **Domain models** — internal aggregates
- **Repository / data access** — module's tables only
- **Service layer** — orchestration
- **HTTP / event handlers** — boundary

```
app/Modules/
├── Billing/
│   ├── Domain/         # entities, value objects
│   ├── Application/    # services, commands, queries
│   ├── Infrastructure/ # repositories, external integrations
│   └── PublicApi.php   # only exported surface
├── Catalog/
└── Auth/
```

### Boundaries

- Modules CAN call each other ONLY via PublicApi
- Modules CANNOT directly access another module's DB tables
- Cross-module data needs query through PublicApi or async event subscription

### Events for cross-module flows

- `BillingPaymentSucceeded` event published by Billing
- Catalog subscribes to update inventory
- No direct call from Billing → Catalog

## Examples

### Bad

```php
// In Billing module
$order = Order::find($id);  // Order belongs to Catalog
$order->status = 'paid';
$order->save();  // Billing reaching across boundary
```

### Good

```php
// Billing module publishes event
event(new PaymentSucceeded($orderId));

// Catalog module subscribes
class UpdateOrderStatus {
  public function handle(PaymentSucceeded $event) {
    $order = Order::find($event->orderId);
    $order->markPaid();
  }
}
```

## Enforcement

- Linter: deptrac (PHP), depgraph (Python), arch-unit (Java), or custom CI script
- Code review enforces module boundaries
- ADR for any new cross-module dependency

## Related rules

- `fsd` — frontend equivalent
- `no-dead-code` — module boundaries reveal unused exports

## See also

- "Modular Monoliths" by Simon Brown
- DDD strategic patterns
