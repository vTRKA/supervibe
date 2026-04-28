---
name: routing
description: "URL conventions: REST resource patterns, RPC for actions, versioning via URL or header, no breaking changes without deprecation window. RU: REST / GraphQL / Server Actions конвенции, версионирование, deprecation window для breaking changes. Trigger phrases: 'routing', 'endpoint', 'API'."
applies-to: [any]
mandatory: false
version: 1.0
last-verified: 2026-04-27
related-rules: [api-contract-reviewer]
---

# Routing

## Why this rule exists

URL design outlives code. Once consumers depend on a URL, changing it = breaking everyone. Consistent patterns reduce learning curve and bugs.

## When this rule applies

- Public APIs (external consumers)
- Internal APIs serving multiple teams
- Web pages with bookmarkable URLs

## What to do

### REST conventions

- Plural nouns: `/users`, `/orders` (not `/user`, `/getOrder`)
- HTTP verbs:
  - GET = read, idempotent
  - POST = create
  - PUT = full replace, idempotent
  - PATCH = partial update
  - DELETE = remove, idempotent
- Nested resources for ownership: `/users/:id/orders`
- Avoid >2 levels of nesting (`/users/:id/orders/:id/items` is OK; `/.../items/:id/reviews` is too deep)

### Status codes

- 200 OK / 201 Created / 204 No Content
- 400 Bad Request (validation) / 401 Unauthorized / 403 Forbidden / 404 Not Found
- 409 Conflict (duplicate) / 422 Unprocessable Entity (semantic)
- 429 Too Many Requests / 500 Internal Server Error / 503 Service Unavailable

### Pagination

- Cursor-based for high-volume lists (`?cursor=<opaque>&limit=50`)
- Offset for low-volume (`?page=1&per_page=50`)
- Always include `has_more` / `next_cursor` in response

### Error envelope

```json
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Email is required",
    "details": [{ "field": "email", "message": "required" }]
  }
}
```

### Versioning

- URL: `/v1/users`, `/v2/users` (preferred for clarity)
- OR header: `Accept: application/vnd.app.v2+json`
- Never remove `v1` without 90+ day deprecation notice

### RPC for actions

- `/orders/:id/cancel` (action that doesn't fit CRUD)
- POST verb (state-changing)

### Web routes

- Lowercase, hyphenated (`/user-profile`, not `/userProfile` or `/user_profile`)
- Trailing slash policy consistent (always or never)

## Examples

### Bad

```
GET /getUserById?id=123    → use GET /users/123
POST /users/123/delete     → use DELETE /users/123
GET /api/users             → no version
```

### Good

```
GET /v1/users/123
DELETE /v1/users/123
POST /v1/orders/789/cancel
```

## Enforcement

- API design review by `api-contract-reviewer` agent
- OpenAPI / GraphQL SDL committed alongside changes
- Breaking change detection in CI

## Related rules

- `api-contract-reviewer` agent uses this rule

## See also

- RFC 7231 (HTTP semantics)
- https://restfulapi.net/
