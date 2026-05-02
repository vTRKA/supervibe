# Graphics Medium Decision — <prototype-slug>

> Generated: <ISO-date>
> Decided by: creative-director

## Surface(s) covered
<which hero / illustration / data-viz / decorative / icon — list each>

## Per-surface decisions

### Surface: <name>
| Medium | Pixel scaling | File size | Authoring | Performance | A11y | When |
|---|---|---|---|---|---|---|
| SVG (inline) | infinite | small | code or Figma export | composited | semantic + aria | logos, icons, geometric illustrations |
| SVG (sprite) | infinite | small | tooling | cached | same | icon sets >5 icons |
| Canvas 2D | DPR-aware | medium | code | CPU | needs aria-label | data-viz, particles ≤500 |
| WebGL / regl | DPR-aware | medium-large | code | GPU | needs canvas alt | shaders, particles >500, 3D |
| WebGPU | DPR-aware | medium | code (modern) | GPU | needs canvas alt | compute-heavy, future-proof |
| Lottie JSON | infinite (vector) | small-medium | AE designer | CPU intensive on mobile | needs aria-hidden | hero illustrations with motion |
| PNG/JPG (with srcset) | needs DPR variants | large | export | cached | alt text | photo, complex artwork |
| AVIF/WebP | needs DPR variants | smaller | export | cached | alt text | modern photo (with PNG fallback) |

**Chosen for surface "<name>":** <medium>
**Why:** <one sentence>
**Why not alternatives:** <list>

## Asset pipeline
- Source format: <e.g. AE composition, Figma component, raw photo>
- Build step: <e.g. bodymovin export, svgo optimization, sharp resize>
- Output path: <.supervibe/artifacts/prototypes/<slug>/assets/...>

## Performance ceiling
- Total visual asset budget: <KB on first paint>
- Largest single asset: <KB>
- Largest contentful paint target: <ms>
