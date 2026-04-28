---
name: infrastructure-patterns
description: "Catalogs HA/replication/cache/queue patterns (Redis Sentinel, Postgres streaming, Kafka topics, etc.) with decision criteria per scale tier. RU: Sentinel/Cluster decision, репликация, queue topology с критериями выбора по масштабу. Trigger phrases: 'redis topology', 'replication', 'инфраструктура'."
applies-to: [any]
mandatory: false
version: 1.0
last-verified: 2026-04-27
related-rules: [observability]
---

# Infrastructure Patterns

## Why this rule exists

Infrastructure choices have order-of-magnitude consequences. Single-Redis vs Sentinel vs Cluster, single-Postgres vs streaming-replica vs Citus — each fits a different scale tier. Choosing wrong = either over-engineering (wasting money) or under-engineering (outages).

This rule documents the decision criteria so teams pick deliberately, not by cargo culting.

## When this rule applies

- New infrastructure component selection
- Scaling event triggering re-architecture
- Migration between tiers

## What to do

### Redis tiers

| Tier | When | Components | RTO |
|------|------|------------|-----|
| **Single instance** | Dev, low-traffic prod (<100 RPS, can tolerate cache miss for minutes) | 1 Redis | manual |
| **Sentinel** | HA needed, single dataset fits one server (≤200GB, ≤500k QPS) | 1 primary + 2+ replicas + 3 sentinels (quorum) | <30s automatic |
| **Cluster** | Sharding needed (>200GB, >500k QPS) | 6+ nodes, hash-slot sharding | <30s + slot migration |

### Postgres tiers

| Tier | When | Components | RTO |
|------|------|------------|-----|
| **Single primary** | Dev, low-traffic | 1 instance | manual restore |
| **Streaming replica** | HA + read scale (read-heavy) | 1 primary + 1+ replicas | seconds (manual failover) or auto with patroni |
| **Logical replication** | Multi-region or version migration | varies | varies |
| **Citus / sharding** | Single primary maxed (typically >100TB or >100k TPS) | coordinator + workers | complex |

### Queue tiers

| Tier | When | Components |
|------|------|------------|
| **In-process** | Single worker, ephemeral jobs | none |
| **Redis-backed** (Bull/Sidekiq/Horizon) | Cross-process, persistent jobs, single broker | Redis |
| **Broker** (RabbitMQ/Kafka) | Multi-team, high throughput, ordered partitions | dedicated cluster |

### Cache tiers

| Tier | When | Components |
|------|------|------------|
| **App-memory** (LRU, ttl) | Hot path, single instance | none |
| **Redis** | Shared across instances | shared Redis |
| **Reverse proxy** (nginx/varnish) | Static-ish responses | proxy tier |
| **CDN** | Edge / static assets / generated pages | Cloudflare / Fastly / etc. |

## Decision tree

```
Need HA? (uptime SLO ≥99.9%)
├─ NO → simplest tier (single instance)
└─ YES:
    ├─ Reads scale OK with replicas? → primary-replica streaming
    ├─ Writes saturate single primary? → consider sharding (last resort)
    └─ Geo-distribution? → multi-region with logical replication
```

## Examples

### Bad

```
"We need scale" → adopt Kafka + Citus + Cluster Redis from day 1
```

Why this is bad: pre-scale; complexity without users; ops burden destroys velocity.

### Good

```
"We have 100 users, 5 RPS" → single Postgres + single Redis + in-memory cache
"Hit 10k users, 500 RPS" → Postgres + streaming replica, Redis Sentinel, app-memory + Redis cache
"Hit 1M users, 50k RPS" → consider Postgres logical replication for read regions, Redis Cluster, CDN edge cache
```

Why this is good: each tier matched to actual scale.

## Enforcement

- `infrastructure-architect` agent owns selection
- `supervibe:adr` records decision with rationale
- `infra-pattern-researcher` keeps this rule current

## Related rules

- `observability` — every tier needs corresponding monitoring

## See also

- Redis docs: https://redis.io/docs/management/sentinel/
- Postgres replication docs
- `agents/_ops/infrastructure-architect.md`
