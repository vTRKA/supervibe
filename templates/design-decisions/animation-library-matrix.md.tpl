# Animation Library Decision — <prototype-slug>

> Generated: <ISO-date>
> Decided by: creative-director
> Applies to: <viewport list>

## Context
<one paragraph: what motion problem are we solving — page enter, micro-interactions, hero, transitions, scroll-driven, shared-element?>

## Options Considered

| Option | Bundle (gzip) | API ergonomics | Performance ceiling | Reduced-motion | When to choose |
|---|---|---|---|---|---|
| Native CSS / WAAPI | 0 KB | medium | 60fps composited | trivial via media query | declarative, ≤3 properties, well-known easing |
| Motion One | 4 KB | high | 60fps composited | manual | timeline orchestration, springs, simple SVG morph |
| GSAP (free) | 24 KB | very high | 120fps possible | manual | complex sequences, ScrollTrigger, MorphSVG, SplitText |
| Anime.js | 6 KB | medium | 60fps composited | manual | SVG line-drawing, staggered patterns |
| Framer Motion | 35 KB | very high (React-only) | 60fps | built-in | layout animations, gestures (React only) |
| Three.js / r3f | 150+ KB | low (3D) | GPU-bound | n/a | actual 3D, particles, WebGL shaders |
| Lottie-web | 60 KB | declarative JSON | depends on JSON complexity | trivial | designer-authored complex sequences via AE → bodymovin |

## Decision
**Chosen:** <library-name>

## Rationale
- Why this option: <one sentence>
- Why not alternative A: <one sentence>
- Why not alternative B: <one sentence>

## Performance Budget
- Total motion library bundle: <KB>
- Per-frame work target: <ms>
- Animated properties allowed: transform, opacity (compositor) — anything else needs justification
- Reduced-motion strategy: <CSS media query | per-animation guard | full disable>

## Audit triggers (when to revisit)
- Bundle exceeds <KB>
- 60fps target missed on <device>
- New motion need outside chosen lib's strengths
