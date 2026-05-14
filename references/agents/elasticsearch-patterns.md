# Elasticsearch Patterns

Reusable search architecture decision depth relocated from `elasticsearch-architect`.

## Slicing Contract

- Agent files keep persona, invocation boundary, procedure, output contract, skills, verification, dialogue discipline, and anti-patterns.
- This reference holds reusable depth: decision trees, workflow matrices, detailed examples, and output templates.
- Load this file only when the current task needs the deeper pattern; otherwise use the concise agent contract.
- Treat copied source sections as reference patterns, not mandatory steps for every task.

## Elasticsearch Architect: Decision Tree

Source agent: `agents/stacks/elasticsearch/elasticsearch-architect.md`
Moved content type: index, shard, analyzer, lifecycle, search, and fork routing tree

## Decision tree

```
mapping-types
  - exact match, filter, aggregate, sort? -> keyword
  - full-text search, scored relevance? -> text
  - need both? -> multi-field: text with .keyword sub-field (default for dynamic strings, but make it explicit)
  - integer / long / double? -> numeric type matching the range; never store numbers as keyword unless they're identifiers
  - date? -> date with explicit format; never trust dynamic date detection on user-supplied data
  - object (nested doc, accessed as a unit)? -> object (default)
  - array of objects with cross-field queries? -> nested (mandatory; default object flattens arrays and breaks per-element queries)
  - identifier-only field, never tokenized? -> keyword with normalizer if needed (lowercase)
  - geo? -> geo_point for points, geo_shape for polygons
  - sparse, optional, mostly absent? -> still pin the type; sparse is a property of data not mapping

analyzer-selection
  - English-only, simple? -> standard analyzer (default; fine for many cases)
  - English with stemming, stopwords? -> english analyzer
  - multi-language, known per-doc? -> per-language analyzer per multi-field (title.en, title.ru, title.zh) or per-index
  - multi-language, unknown per-doc? -> language detector ingest processor + routing to per-language index
  - CJK? -> language-specific (kuromoji for Japanese, smartcn for Chinese, nori for Korean) or icu_tokenizer + cjk_bigram
  - Thai? -> thai analyzer (uses ICU); never standard
  - identifiers / SKUs / phone numbers? -> keyword + custom normalizer (lowercase, possibly trim/strip-special)
  - autocomplete? -> edge_ngram tokenizer with min/max gram width; index-time analyzer differs from search-time analyzer
  - fuzzy / typo-tolerant? -> standard analyzer + match query with fuzziness=AUTO; consider phonetic for names

sharding-strategy
  - log/time-series workload? -> 1 primary per 30-50GB target shard size; rolling indices via ILM rollover
  - search workload (relatively static, search-heavy)? -> 1 primary per 10-30GB; pin replica count to read scale
  - tiny indices (<1GB total)? -> 1 primary, 1 replica; over-sharding here is the most common mistake
  - heavy aggregation, high cardinality? -> shard count tuned for parallelism but capped at node count
  - need to change later? -> reindex via aliases (always); never plan to live with a wrong shard count

ilm-design
  - hot phase: ingest + recent reads -> default tier, daily/weekly rollover by size or time
  - warm phase: read-mostly, force-merged, replicas reduced -> warm tier (cheaper SSD or HDD)
  - cold phase: rare reads, searchable snapshots -> cold tier (HDD or S3-backed searchable snapshot)
  - delete phase: tombstone -> delete after retention SLA
  - rollover trigger? -> max_size (50GB common) AND/OR max_age (1d common) AND/OR max_docs
  - rollover budget? -> ensure write alias and read alias are separate; ensure index template is in place; ensure rolled-from index doesn't break consumers

search-vs-aggregation
  - relevance-ranked search? -> match / multi_match / query_string / simple_query_string with analyzer-aware fields (text)
  - exact filtering? -> term / terms (keyword)
  - range filtering? -> range (numeric, date)
  - sort by score then field? -> default; supplement with rescore for expensive scoring
  - aggregations on keyword? -> terms aggregation (use doc_values, default on)
  - aggregations on text? -> WRONG — text fields don't have doc_values; use the .keyword multi-field
  - cardinality estimation? -> cardinality aggregation with precision_threshold tuned
  - large bucket counts? -> composite aggregation (paginated, scroll-friendly)

fork-awareness
  - Elasticsearch 8.x distribution? -> Elastic license; ML, SIEM, full Kibana feature set
  - OpenSearch 2.x distribution? -> Apache-2; some Elastic-only features absent (eg some ML), but anomaly detection, alerting, security plugins included
  - Elasticsearch client compatibility? -> 8.x clients to 8.x; cross-distribution clients (opensearch-py, opensearch-js) for OpenSearch
  - feature in Elastic but not OpenSearch? -> document the gap; offer migration path or alternative (eg `runtime_fields` -> scripted fields)
  - cluster running mixed clients? -> reject; pin to a distribution and a client matrix per service

cluster-topology
  - dev / single-node? -> 1 master+data; never trust durability claims
  - small prod (<100GB)? -> 3 master-eligible (often dual-role data) for quorum
  - medium prod? -> dedicated 3 master-only nodes + data-hot/warm tiers
  - large prod? -> dedicated masters + data tiers + ingest nodes + coordinating-only nodes; document the role split

reindex-orchestration
  - mapping change additive (new field, new analyzer on new field)? -> often no reindex needed; update template + add field + reindex selectively
  - mapping change destructive (type change, analyzer change on existing field)? -> reindex into new index + alias swap
  - reindex on live data? -> use _reindex API with throttle; or external Logstash/custom job for fine control
  - alias cutover? -> mandatory; never let consumers point at the old index name during cutover
  - rollback? -> keep old index for retention window; alias swap is reversible
```

## Elasticsearch Architect: Decision Template

Source agent: `agents/stacks/elasticsearch/elasticsearch-architect.md`
Moved content type: mapping, analyzer, shard, lifecycle, migration, and reference template

## Context
<what problem, what data shape, what query patterns, what scale, what SLOs>

## Decision
<chosen mapping / analyzer / shard plan / ILM policy, with example doc + JSON snippets>

## Alternatives Considered
- Alt A: <design> — rejected because <measurable reason>
- Alt B: <design> — rejected because <measurable reason>

## Mapping
```json
{ "mappings": { "properties": { ... } } }
```

## Analyzer
```json
{ "analysis": { "analyzer": { ... }, "tokenizer": { ... }, "filter": { ... } } }
```
- Test output for sample text: <token list>

## Shard Plan
- Primary count: N (rationale: target shard size G, expected total H)
- Replica count: M (rationale: read scale + DR)
- Allocation: hot tier (data: hot)

## ILM / ISM Policy
- Hot: rollover at <size>GB OR <age>d OR <docs>M
- Warm: after <X>d, force-merge to 1 segment, replicas reduced to N
- Cold: after <Y>d, allocate to data: cold (or searchable snapshot)
- Delete: after <Z>d

## Migration / Reindex Plan
- Source: <old-index-or-alias>
- Target: <new-index>
- Cutover: alias swap on <date>; old index retained <retention>d for rollback
- Reindex throttle: <docs/sec> or external job
- Consumer impact: <none / pause / dual-read window>

## Fork Awareness
- Distribution-specific features used: <list>
- Cross-distribution alternative: <option>

## Verification
- _analyze output captured for new analyzer (sample text)
- Mapping validated via index template simulation
- Relevance golden-query regression test (queries + expected top-K) — passing
- Aggregation circuit-breaker headroom check
- Reindex throughput + duration estimate
- Cluster state size delta estimate

## References
- Prior PRD decision sections: <list>
- Related index/template: <list>
- Fork release note / vendor doc: <link>
```

## Elasticsearch Architect: Common Workflows

Source agent: `agents/stacks/elasticsearch/elasticsearch-architect.md`
Moved content type: search architecture workflow matrix

## Common workflows

### New search index design
1. Read product spec; identify entity, query patterns (search vs filter vs aggregate), expected doc volume, expected query QPS
2. Choose distribution (Elasticsearch vs OpenSearch) per the active host instruction file; reject silent assumption
3. Pin every field type (`text` for search prose, `keyword` for filter/exact/aggregate, `numeric` for ranges, `date` with explicit format, `nested` for arrays-of-objects with per-element queries)
4. Choose analyzer per-language; declare multi-fields (eg `title.en`, `title.fr`); test via `_analyze`
5. Size shards: estimate full-life total size, divide by target shard size; usually 1-3 primaries for new search indices
6. Set replica count for read scale + DR (typically 1)
7. Write index template; ship via initial migration; create write/read aliases
8. Define golden-query relevance test set; baseline before adding production data
9. Write PRD decision section; link relevance test set

### Multilingual search rollout
1. Identify languages in scope; classify per expected volume
2. For each language, choose analyzer (built-in language analyzers cover 30+; custom for Thai, CJK as needed)
3. Decide per-doc-language strategy: (a) language field + per-language multi-fields, (b) per-language index + alias union, (c) language-detection ingest pipeline + routing
4. Test analyzer output on representative documents per language
5. Update mapping with per-language fields or routing; update queries to fan out to all language fields (multi_match) or rely on copy_to
6. Reindex existing data with the new mapping (analyzers run at index time)
7. Validate relevance golden-query test set per language

### ILM rollout for log workload
1. Estimate daily ingest GB and retention SLA (eg 30d hot, 60d warm, 365d cold, then delete)
2. Compute target rollover trigger: `max_primary_shard_size: 50gb` (Elasticsearch 7.13+) OR `max_size: <N * 50gb>` for older
3. Write ILM policy with hot/warm/cold/delete phases; force-merge in warm; reduce replicas in warm/cold; allocate to tier-specific node attributes
4. Set the policy as part of the index template
5. Create the initial index with the write alias: `<index>-000001` with `aliases: {<index>-write: {is_write_index: true}}`
6. Verify rollover via `_ilm/explain`; manually trigger first rollover to verify mechanics
7. Set up Kibana / OpenSearch Dashboards index pattern against the read alias

### Reindex with alias cutover
1. Identify destructive change (analyzer change, type change)
2. Build new index with new mapping: `<name>-v<n+1>`
3. Run `_reindex` from `<name>-v<n>` to `<name>-v<n+1>`; throttle via `requests_per_second` parameter
4. Run relevance golden-query regression on `<name>-v<n+1>`
5. Atomic alias swap: `POST _aliases { actions: [ {remove: {index: <name>-v<n>, alias: <name>-read}}, {add: {index: <name>-v<n+1>, alias: <name>-read}}, {remove: {index: <name>-v<n>, alias: <name>-write}}, {add: {index: <name>-v<n+1>, alias: <name>-write}} ] }`
6. Monitor for issues; keep `<name>-v<n>` for rollback window
7. After rollback window, delete `<name>-v<n>`

### Fork migration (Elasticsearch -> OpenSearch or reverse)
1. Inventory features in use: ML, SIEM, runtime_fields, security plugin, alerting, anomaly detection
2. Map each feature to the target distribution: native equivalent, plugin alternative, or gap
3. Update client libraries: `elasticsearch-py` <-> `opensearch-py`, `@elastic/elasticsearch` <-> `@opensearch-project/opensearch`
4. Verify mapping/template/ILM (Elasticsearch) <-> ISM (OpenSearch) translation
5. Test golden queries against new distribution; capture relevance deltas
6. Cutover via dual-write window or snapshot+restore; never trust "drop-in compatible" without testing
7. Document distribution-specific features and write fork-awareness section in the active host instruction file
