---
name: interaction-design-patterns
namespace: process
description: "Use WHEN designing micro-interactions, animations, transitions, loading states to apply timing tiers, easing rules, and WOW-effect patterns from current 2026 design practice. RU: используется КОГДА проектируются микро-взаимодействия, анимации, переходы, loading-состояния — применяет timing tiers, easing-правила и WOW-паттерны из практики 2026. Trigger phrases: 'добавь анимацию', 'нужны переходы', 'микроинтеракция', 'оживи интерфейс'."
allowed-tools: [Read, Grep, Glob, Bash, Write, Edit]
phase: exec
prerequisites: []
emits-artifact: prototype
confidence-rubric: confidence-rubrics/prototype.yaml
gate-on-exit: true
version: 1.1
last-verified: 2026-04-28
---

# Interaction Design Patterns

## Design Intelligence Preflight

Before selecting interaction patterns, run project memory, code search, and internal `supervibe:design-intelligence` lookup for app-interface, UX, stack, accessibility, and performance guidance. Lookup is advisory and must respect approved motion tokens and reduced-motion rules.

## When to invoke

WHEN building UI that involves:
- Hover/click/focus state transitions
- Page/route transitions
- Loading states (skeletons, spinners, progress)
- Reveal animations (scroll-triggered, time-triggered)
- Drag/drop / gesture interactions
- Toast / notification appearance
- Modal/dialog enter/exit
- Hero/landing animations and graphics treatments
- "WOW moment" interactions (signature differentiators)
- Video, GIF, Lottie, storyboard, or animated hero decisions

NOT for: pure static layout, content-only screens.

## Step 0 — Read source of truth (required)

1. Read `.supervibe/artifacts/prototypes/_design-system/motion.css` for timing tiers + easing
2. Read `.supervibe/artifacts/prototypes/_design-system/components/` for component-specific transitions
3. Check `prefers-reduced-motion` policy (mandatory respect)
4. Check target browser matrix — modern features (View Transitions API, scroll-driven animations) need fallbacks for Safari < 17 / Firefox
5. Run `node "<resolved-supervibe-plugin-root>/scripts/detect-media-capabilities.mjs" --json` before promising video/GIF output. If video is unavailable, select CSS/WAAPI, SVG/Lottie spec, storyboard frames, or static poster alternatives.

## Decision tree — pattern selection

```
What kind of motion is this?
├─ Single property change between two states     → CSS transition
├─ Repeating idle / decorative motion            → CSS @keyframes
├─ Programmatic timing, dynamic values           → Web Animations API (element.animate)
├─ Scroll position drives progress               → Intersection Observer OR scroll-driven animations
├─ Layout change (DOM moved/reordered)           → FLIP technique
├─ Cross-route element morph                     → View Transitions API (or shared-element FLIP)
├─ Natural physics feel (drag-release, modal)    → Spring physics with rAF
├─ Stagger sequence of N children                → CSS animation-delay OR JS forEach + delay
└─ Hero with thousands of elements / shaders     → Canvas 2D OR WebGL/Three.js

What kind of interaction trigger?
├─ Hover/focus/active                            → CSS :hover/:focus-visible/:active + transition
├─ Click/tap with feedback                       → CSS :active + Web Animations API for richer feedback
├─ Pointer/touch gesture (drag, swipe)           → Pointer Events + rAF loop
├─ Scroll position                               → Intersection Observer (entry/exit) or scroll-timeline
├─ Time-driven (idle decorative)                 → CSS animation infinite OR rAF
└─ Intersection-driven (entrance reveal)         → Intersection Observer + class toggle

How heavy can the implementation be?
├─ ≤3 animated elements, simple state            → CSS-only (zero JS)
├─ Choreographed sequence, ≤200 lines logic     → Web Animations API (no library)
├─ Spring physics, drag, complex orchestration   → Library (Motion One / GSAP)
├─ 1000+ elements / custom rendering             → Canvas 2D
└─ 3D, shaders, particle counts > 5k            → WebGL / Three.js

Animation tier (purpose):
├─ Entrance     — element first appears             → ease-out, 250-450ms
├─ Exit         — element leaves                    → ease-in, 150-250ms (faster than entrance)
├─ Idle         — ambient decorative motion         → infinite, very subtle, low contrast
├─ Attention    — call user focus (error, new msg)  → 1-2 oscillations max, then settle
└─ State-change — toggle, hover, value change       → match tier 1-2 timing

prefers-reduced-motion?
├─ ALWAYS respect — provide instant fallback or short fade
└─ Test: emulate "reduce motion" in browser, confirm no large translation/scale runs
```

## Easing reference (copy-paste ready)

```css
/* === Standard easings === */
--ease-linear:        cubic-bezier(0, 0, 1, 1);            /* almost never correct */
--ease-out-quad:      cubic-bezier(0.25, 0.46, 0.45, 0.94); /* gentle deceleration; default for state changes */
--ease-in-out-quart:  cubic-bezier(0.77, 0, 0.175, 1);     /* dramatic balanced; modal open/close */
--ease-out-expo:      cubic-bezier(0.16, 1, 0.3, 1);       /* fast then slow; hero reveals, page transitions */
--ease-in-expo:       cubic-bezier(0.7, 0, 0.84, 0);       /* exit animations */
--ease-out-back:      cubic-bezier(0.34, 1.56, 0.64, 1);   /* slight overshoot; playful enters */
--ease-spring-soft:   cubic-bezier(0.5, 1.25, 0.5, 1);     /* approximate spring without rAF */
--ease-material:      cubic-bezier(0.4, 0, 0.2, 1);        /* Material standard; safe default */
```

WHEN to use each:
- `--ease-out-quad` — buttons, hovers, dropdowns; user expects quick acknowledgement, gentle settle
- `--ease-in-out-quart` — modals, drawers; symmetric importance on enter and exit
- `--ease-out-expo` — page transitions, hero entrances; dramatic but not bouncy
- `--ease-in-expo` — exits, fade-outs (fast departure feels responsive)
- `--ease-out-back` — playful brand moments, success confirmations (the slight overshoot reads as "joy")
- `--ease-spring-soft` — approximation when you can't afford a rAF spring loop
- `--ease-material` — when you don't know which to pick; safe default

WHY linear is almost always wrong: real-world motion has inertia. Linear motion reads as mechanical, robotic, "fake". Use linear ONLY for: progress bars (linear time), looping rotations (no perceptible end), gradient sweeps in idle decorations.

WHY ease-out beats ease-in for user-initiated transitions: when user clicks, they expect *immediate* response. ease-out starts fast (acknowledgement), slows down (graceful settle). ease-in starts slow → feels laggy and unresponsive.

Spring physics tuning (when using rAF spring or Motion One):
- `mass` (1.0 default) — higher = heavier, slower start; UI elements rarely > 1.5
- `tension` / `stiffness` (170-300 typical) — higher = snappier, faster oscillation
- `friction` / `damping` (20-40 typical) — higher = less wobble; for serious UI use damping ratio ≥ 0.7 (no overshoot)

## Timing tiers

| Tier | Duration | Use case | Default easing |
|------|----------|----------|----------------|
| **instant** | 0-100ms | hover state, focus ring, color shift | ease-out |
| **quick** | 150-250ms | button press, tooltip, dropdown, toast | ease-out-quad |
| **considered** | 250-450ms | modal, drawer, page section reveal, accordion | ease-in-out-quart |
| **deliberate** | 450-700ms | hero entrance, staged sequence, route transition | ease-out-expo |
| **narrative** | 700ms+ | onboarding, landing storytelling, scene change | custom per moment |

Rule of thumb: every 100ms of duration past 250ms must earn its place. Animation duration is *cost* paid by every user on every interaction — and they pay it forever.

## Animation approaches with copy-paste recipes

### 1. CSS keyframes — repeating / decorative idle motion

What: declarative keyframe-based animation, runs on compositor thread.
When: looping idle motion (pulsing dot, gentle float, gradient shimmer).
Performance: free if animating transform/opacity; expensive if animating layout properties.
Common bugs: forgetting `animation-fill-mode: both` causes flash on start; `infinite` loops with `alternate` direction skip the from-keyframe on reversal.

```css
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50%      { transform: translateY(-8px); }
}
.hero-card {
  animation: float 4s ease-in-out infinite;
  animation-fill-mode: both;
  will-change: transform;       /* hint, remove after animation if one-shot */
}
@media (prefers-reduced-motion: reduce) {
  .hero-card { animation: none; }
}
```

### 2. CSS transitions — state-change between two values

What: animate property changes triggered by class/state toggle.
When: hover/focus/active, class toggles for show/hide, theme switches.
Performance: ideal for transform, opacity, color, filter.
Common bugs: transitioning `display` doesn't work — use `visibility` + `opacity`; transitioning to `auto` height fails — use `max-height` or grid trick.

```css
.btn {
  background: hsl(220 90% 56%);
  transform: translateY(0);
  transition:
    background 150ms var(--ease-out-quad),
    transform 100ms var(--ease-out-quad),
    box-shadow 200ms var(--ease-out-quad);
}
.btn:hover  { background: hsl(220 90% 62%); transform: translateY(-1px); box-shadow: 0 6px 20px rgb(0 0 0 / 0.15); }
.btn:active { transform: translateY(0); transition-duration: 50ms; }
```

### 3. Web Animations API — programmatic timing without library

What: `element.animate(keyframes, options)` — JS-driven, returns Animation handle (pause/cancel/finished promise).
When: dynamic values from JS, sequential chaining via promise, animations triggered by data changes.
Performance: same compositor thread as CSS; equivalent perf.
Common bugs: `finished` promise rejects on cancel — wrap in `.catch()`; `composite: 'add'` not supported in all browsers.

```js
const card = document.querySelector('.card');
const anim = card.animate(
  [
    { transform: 'translateY(20px)', opacity: 0 },
    { transform: 'translateY(0)',    opacity: 1 },
  ],
  { duration: 350, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' }
);
await anim.finished.catch(() => {});
// chain next animation after this resolves
```

### 4. View Transitions API — same-document and cross-document transitions

What: browser snapshots before+after states, cross-fades or runs custom CSS animation between them. Modern Chrome/Edge (cross-document needs Chrome 126+), Safari 18+.
When: route transitions, list-to-detail morphs, large layout shifts.
Performance: snapshot costs paint once; the animation itself is GPU.
Common bugs: requires `view-transition-name` to be unique per concurrent transition; without fallback, Safari < 18 simply skips animation.

```js
function navigateWithTransition(url) {
  if (!document.startViewTransition) { location.href = url; return; }
  document.startViewTransition(async () => {
    const html = await fetch(url).then(r => r.text());
    document.querySelector('main').innerHTML =
      new DOMParser().parseFromString(html, 'text/html').querySelector('main').innerHTML;
  });
}
```

```css
::view-transition-old(root),
::view-transition-new(root) {
  animation-duration: 350ms;
  animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1);
}
.hero-image { view-transition-name: hero; }   /* persist this element across navigation */
```

### 5. Intersection Observer + CSS class toggle — scroll-driven reveals

What: observer fires when element enters viewport; toggle class triggers CSS animation.
When: scroll-triggered reveals, lazy animations, cards appearing as user scrolls.
Performance: no scroll handler — observer is browser-optimized.
Common bugs: forgetting `threshold` produces flicker at edges; not unobserving after first reveal wastes cycles.

```html
<div class="reveal">Content</div>
<style>
  .reveal { opacity: 0; transform: translateY(24px);
            transition: opacity 500ms var(--ease-out-expo), transform 500ms var(--ease-out-expo); }
  .reveal.is-visible { opacity: 1; transform: translateY(0); }
  @media (prefers-reduced-motion: reduce) {
    .reveal { opacity: 1; transform: none; transition: none; }
  }
</style>
<script>
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) {
      e.target.classList.add('is-visible');
      io.unobserve(e.target);   // one-shot
    }
  }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
  document.querySelectorAll('.reveal').forEach(el => io.observe(el));
</script>
```

### 6. CSS Scroll-Driven Animations — declarative scroll-linked

What: `animation-timeline: view()` or `scroll()` ties keyframe progress to scroll position. Chrome 115+, Firefox not yet (April 2026); needs feature detection + fallback.
When: parallax, progress bars, scroll-linked transforms — without JS.
Performance: compositor-only; no rAF cost.
Common bugs: `view()` ranges (`cover`, `entry`, `exit`) commonly confused; always test on real content scroll.

```css
@supports (animation-timeline: view()) {
  .parallax-image {
    animation: parallax linear;
    animation-timeline: view();
    animation-range: entry 0% exit 100%;
  }
  @keyframes parallax {
    from { transform: translateY(-15%); }
    to   { transform: translateY(15%); }
  }
}
/* fallback: static image, no parallax */
```

### 7. Spring physics with requestAnimationFrame

What: integrate spring equation each frame; outputs natural feel for drag-release, modal pop-in.
When: physics-feel matters more than determinism (drag-and-release, dismiss gestures).
Performance: rAF runs every frame on main thread; keep loop body lean.
Common bugs: floating-point creep — terminate when |velocity| < epsilon AND |position - target| < epsilon.

```js
function spring(from, to, { stiffness = 170, damping = 26, mass = 1, onUpdate, onDone }) {
  let x = from, v = 0, last = performance.now();
  const tick = (now) => {
    const dt = Math.min(0.064, (now - last) / 1000); last = now;
    const Fspring = -stiffness * (x - to);
    const Fdamp   = -damping * v;
    const a = (Fspring + Fdamp) / mass;
    v += a * dt; x += v * dt;
    onUpdate(x);
    if (Math.abs(v) < 0.01 && Math.abs(x - to) < 0.01) { onUpdate(to); onDone?.(); return; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
spring(0, 100, { onUpdate: (x) => card.style.transform = `translateY(${x}px)` });
```

### 8. FLIP technique — layout transitions for moving elements

What: First (measure), Last (move/change), Invert (translate back to original), Play (animate to identity). Animates layout changes via transform.
When: list reorder, grid reflow, element changes parent.
Performance: avoids layout thrash by animating cheap transform instead of expensive layout.
Common bugs: forgetting to read both First and Last in same frame; transforms compound if not reset.

```js
function flip(el, mutate) {
  const first = el.getBoundingClientRect();   // F
  mutate();                                   // L (DOM change)
  const last = el.getBoundingClientRect();
  const dx = first.left - last.left, dy = first.top - last.top;
  el.animate(                                 // I + P
    [
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: 'translate(0, 0)' },
    ],
    { duration: 400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
  );
}
flip(card, () => listContainer.prepend(card));
```

### 9. Shared element transitions — element morphing between routes

What: same logical element (e.g. product image) animates from list view to detail view.
When: list→detail flows where continuity matters (gallery → lightbox, product card → product page).
Performance: View Transitions API native; FLIP-based fallback works everywhere.
Common bugs: source element must still be in DOM at animation start; aspect ratio mismatches produce squish.

```js
// Modern: View Transitions
async function openDetail(href, image) {
  image.style.viewTransitionName = 'product-image';
  if (!document.startViewTransition) { location.href = href; return; }
  await document.startViewTransition(async () => { /* swap DOM */ }).finished;
}

// Fallback: FLIP-style — measure source, render destination, animate clone
function morphSharedElement(source, target) {
  const s = source.getBoundingClientRect(), t = target.getBoundingClientRect();
  const clone = source.cloneNode(true);
  Object.assign(clone.style, { position: 'fixed', left: s.left + 'px', top: s.top + 'px',
    width: s.width + 'px', height: s.height + 'px', margin: 0, transition: 'all 500ms cubic-bezier(0.16,1,0.3,1)' });
  document.body.appendChild(clone);
  requestAnimationFrame(() => {
    Object.assign(clone.style, { left: t.left + 'px', top: t.top + 'px', width: t.width + 'px', height: t.height + 'px' });
  });
  clone.addEventListener('transitionend', () => clone.remove(), { once: true });
}
```

### 10. Skeleton loaders — perceived-performance via shimmering placeholders

What: gray boxes shaped like content, with shimmer gradient sweeping across.
When: any data fetch > 200ms; placeholders calm uncertainty.
Performance: pure CSS — no JS overhead.
Common bugs: skeleton shape doesn't match real content → visible reflow when data arrives.

```css
.skeleton {
  background: linear-gradient(90deg, #eee 0%, #f5f5f5 50%, #eee 100%);
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
  border-radius: 4px;
}
@keyframes shimmer {
  0%   { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
.skeleton.title  { height: 24px; width: 60%; margin-bottom: 12px; }
.skeleton.line   { height: 14px; width: 100%; margin-bottom: 8px; }
.skeleton.line.short { width: 80%; }
```

### 11. Stagger / orchestration — sequenced reveal of list children

What: each child animates in with progressively delayed start.
When: hero reveals, navigation menus, card grids on initial paint.
Performance: pure CSS; computed once.
Common bugs: hardcoded delays break when item count changes — use CSS custom property + nth-child OR JS index.

```css
.list > * {
  opacity: 0; transform: translateY(16px);
  animation: fade-up 500ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
  animation-delay: calc(var(--i, 0) * 60ms);
}
@keyframes fade-up { to { opacity: 1; transform: translateY(0); } }
```
```js
document.querySelectorAll('.list > *').forEach((el, i) => el.style.setProperty('--i', i));
```

### 12. Page-load orchestration — above-fold-first paint priority

What: prioritise visible-on-load elements, defer below-fold animations until visible.
When: landing pages, hero sections, anywhere LCP matters.
Performance: prevents jank during initial paint by NOT animating everything at once.
Common bugs: large entrance animations delay LCP; heavy CSS animations on first paint hurt INP score.

```js
// Phase 1 — immediate paint, no animation on critical-path text
document.documentElement.classList.add('is-loaded');

// Phase 2 — animate hero on next frame (allow paint to commit)
requestAnimationFrame(() => {
  document.querySelector('.hero').classList.add('animate-in');
});

// Phase 3 — defer below-fold animations to Intersection Observer
const io = new IntersectionObserver((entries) => {
  entries.forEach(e => e.isIntersecting && e.target.classList.add('animate-in'));
}, { threshold: 0.1 });
document.querySelectorAll('.below-fold').forEach(el => io.observe(el));
```

## Graphics + visual approaches

### Video capability gate

Rendered video is optional, not assumed. Before choosing video/WebM/GIF as a deliverable:

1. Run `node "<resolved-supervibe-plugin-root>/scripts/detect-media-capabilities.mjs" --json`.
2. If `video=true`, record encoding plan, poster frame, file budget, autoplay policy, captions if content-bearing, and reduced-motion fallback.
3. If `video=false`, choose one of:
   - live CSS/WAAPI motion inside the prototype
   - static storyboard frames in `assets/storyboard/`
   - SVG or Lottie spec when the source asset already exists
   - poster frame plus motion notes for later production
4. Do not block prototype delivery waiting for video tooling unless the user explicitly chose video as the core deliverable.

### CSS gradients

- **Linear** — directional washes, button hover sheens, divider fades.
  ```css
  background: linear-gradient(135deg, #4f46e5 0%, #06b6d4 50%, #10b981 100%);
  ```
- **Radial** — spotlight focus, glow halos around hero CTA, vignette.
  ```css
  background: radial-gradient(ellipse at top, rgba(99,102,241,.4), transparent 60%);
  ```
- **Conic** — pie charts, color wheels, cone-of-light effects, ring spinners.
  ```css
  background: conic-gradient(from 90deg at 50% 50%, #f59e0b, #ef4444, #ec4899, #f59e0b);
  ```
- Multi-stop trick: stack multiple gradients for richness — `background: g1, g2, g3;`. Top first; `transparent` everywhere except where layer dominates.

### Mesh gradients

CSS-only 4-corner approximation:
```css
.mesh {
  background:
    radial-gradient(at 0% 0%,   hsla(282,86%,60%,1) 0px, transparent 50%),
    radial-gradient(at 100% 0%, hsla(196,86%,60%,1) 0px, transparent 50%),
    radial-gradient(at 100% 100%, hsla(335,86%,60%,1) 0px, transparent 50%),
    radial-gradient(at 0% 100%, hsla(38,86%,60%,1) 0px, transparent 50%);
}
```
For richer mesh: pre-rendered SVG (export from Photoshop/Figma mesh-gradient plugin) saved as PNG/WebP; or libraries like `mesh-gradient-svg` for animated mesh.

### CSS blob shapes

```css
.blob {
  width: 400px; aspect-ratio: 1;
  background: hsl(280 90% 70%);
  border-radius: 63% 37% 54% 46% / 55% 48% 52% 45%;  /* asymmetric percentages = organic */
  animation: blob-morph 12s ease-in-out infinite alternate;
}
@keyframes blob-morph {
  0%   { border-radius: 63% 37% 54% 46% / 55% 48% 52% 45%; }
  100% { border-radius: 38% 62% 67% 33% / 41% 70% 30% 59%; }
}
```
Workflow: design 2-3 keyframe shapes via blobmaker.app, drop the border-radius values into keyframes, animate.

### SVG strategies

- **Inline `<svg>`** — when you need CSS/JS access to fill/stroke/path; animation on individual paths possible.
- **Sprite (`<use href="#icon">`)** — many copies of same icon set; one HTTP request, cacheable.
- **`<img src="x.svg">`** — opaque blob, no CSS reach inside; smallest markup; for static logos.

Animating SVG:
- **CSS** — `transform`, `stroke-dashoffset` (line-draw effect), `opacity` on individual paths.
- **SMIL** (`<animate>`, `<animateMotion>`) — declarative inside SVG; deprecated in Chrome at one point but currently supported; risky for forward compat.
- **JS** — set attributes via `el.setAttribute('d', newPath)` for path morphing.

Line-draw SVG entrance:
```css
.path { stroke-dasharray: 1000; stroke-dashoffset: 1000;
  animation: draw 2s ease-out forwards; }
@keyframes draw { to { stroke-dashoffset: 0; } }
```

### Canvas 2D for hero

When worth it: 1000+ animated elements, custom rendering not expressible in CSS, generative art with per-frame logic.

```js
const canvas = document.querySelector('canvas');
const ctx = canvas.getContext('2d');
const particles = Array.from({ length: 200 }, () => ({
  x: Math.random() * innerWidth, y: Math.random() * innerHeight,
  vx: (Math.random() - 0.5) * 0.5, vy: (Math.random() - 0.5) * 0.5, r: 1 + Math.random() * 2
}));
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(99,102,241,0.6)';
  for (const p of particles) {
    p.x += p.vx; p.y += p.vy;
    if (p.x < 0 || p.x > canvas.width)  p.vx *= -1;
    if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
  }
  requestAnimationFrame(draw);
}
draw();
```

### WebGL / Three.js

Use only when: 3D geometry, GLSL shaders for hero washes, particle counts > 5k, VR/AR. Otherwise the bundle cost (~150kb gzip Three.js core) and shader complexity are not justified.

Decision criteria:
- Just want pretty colors? CSS gradients win.
- Animated background pattern? Canvas 2D wins.
- Real 3D scene with lighting/depth? Three.js.
- Custom fragment shader for a wash? Either WebGL bare or `<canvas>` with shader (single quad + frag shader).

### Lottie

When designer hands you JSON exported from After Effects via Bodymovin plugin. Player: `lottie-web` (~70kb gzip). Best for: one-shot delight moments, complex vector animations that would take days to recreate in CSS.

```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/lottie-web/5.12.2/lottie.min.js"></script>
<div id="success-anim" style="width:200px;height:200px"></div>
<script>
  lottie.loadAnimation({
    container: document.getElementById('success-anim'),
    renderer: 'svg', loop: false, autoplay: true,
    path: '/anims/success-burst.json',
  });
</script>
```

### Custom shaders (GLSL fragment shader)

For hero washes / generative art that CSS gradients can't express (noise, flow fields, moving fluid). Single fullscreen quad + frag shader:

```glsl
// fragment shader (hero-wash.frag)
precision highp float;
uniform float u_time; uniform vec2 u_resolution;
void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  float n = sin(uv.x * 6.0 + u_time) * sin(uv.y * 4.0 - u_time * 0.7);
  vec3 col = mix(vec3(0.31, 0.27, 0.90), vec3(0.02, 0.71, 0.84), n * 0.5 + 0.5);
  gl_FragColor = vec4(col, 1.0);
}
```

### Aspect-ratio + object-fit (image responsiveness without JS)

```css
.hero-image-wrapper { aspect-ratio: 16 / 9; width: 100%; }
.hero-image-wrapper img { width: 100%; height: 100%; object-fit: cover; object-position: center 30%; }
```

### Image format strategy

| Content | Format | Why |
|---------|--------|-----|
| Photographs, hero imagery | AVIF (primary) → WebP (fallback) → JPEG | AVIF ~50% smaller than JPEG; WebP universal at this point |
| Screenshots, UI captures with text | PNG-8 or WebP-lossless | text edges suffer in lossy |
| Icons, logos, illustrations | SVG | vector scales, tiny, animatable |
| Animated graphics | WebM video > GIF | GIF averages 5-10x larger than equivalent WebM |
| Frame-by-frame UI animation | Lottie (JSON) | designer-friendly, scriptable |

Use `<picture>` for format negotiation:
```html
<picture>
  <source srcset="hero.avif" type="image/avif">
  <source srcset="hero.webp" type="image/webp">
  <img src="hero.jpg" alt="..." loading="lazy" decoding="async" width="1920" height="1080">
</picture>
```

## Performance discipline

- **Animate `transform` and `opacity` ONLY** for 60fps on cheap devices. These run on the compositor thread (skip layout + paint). Animating `width/height/top/left/margin/padding` triggers layout → paint → composite each frame; falls off 60fps quickly.
- **`will-change` is a hint, not magic** — it promotes element to its own GPU layer, costing memory. Overuse (e.g. `* { will-change: transform; }`) breaks GPU memory budget and slows everything. Apply just before animation, remove after.
- **`contain: layout style paint`** — isolates an element so its layout/paint can't ripple outward. Apply to animated containers to prevent triggering ancestor reflow.
- **60fps budget = 16.67ms per frame** — Chrome DevTools Performance tab → Frames track. Look for purple bars (layout) and green bars (paint) during animation; both are red flags.
- **`prefers-reduced-motion: reduce` is mandatory** for accessibility:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important;
      animation-iteration-count: 1 !important; scroll-behavior: auto !important; }
  }
  ```
- **`transform: translateZ(0)` GPU promotion** — old hack to force GPU layer; modern browsers usually do this automatically. Measure first; sometimes promotes too aggressively and hurts memory.
- **Pause animations off-screen** — Intersection Observer + `animation-play-state: paused`:
  ```js
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => e.target.style.animationPlayState = e.isIntersecting ? 'running' : 'paused');
  });
  document.querySelectorAll('.always-animating').forEach(el => io.observe(el));
  ```
- **rAF throttle** — never run physics simulation faster than rAF; `setInterval(16)` is wrong (drifts off vsync, double-paints).
- **GPU memory budget** — total promoted-layer area * 4 bytes/pixel. Hero with 50 promoted cards at 400x300 each = 24MB. On low-end Android, that's user-visible jank.

## Library decision tree

| Need | Pick | Why |
|------|------|-----|
| Pure CSS state transitions, ≤3 animated elements | None / native | No deps, smallest bundle |
| Choreographed sequences, gesture interactions, complex orchestration | GSAP | Most mature timeline API, smallest learning curve, robust browser support |
| Spring-physics-feel UI, vanilla JS | Motion One | ~12kb gzip, Web Animations API based, spring solver |
| Spring-physics-feel UI, React | Framer Motion / motion (forked) | Spring solver + React-native bindings |
| Lightweight tween, vanilla JS | Anime.js | 14kb gzip, simple API, mature |
| 3D / particles / shaders | Three.js | Industry standard, large ecosystem, docs |
| Pre-rendered designer JSON | Lottie-web | Direct After Effects export pipeline |
| Scroll-driven animations with fallback | GSAP ScrollTrigger | Robust polyfill where native scroll-timeline unavailable |

But for Supervibe prototypes default to **native CSS + Web Animations API + Intersection Observer**. Adding a library is escalation that requires justification: "we need spring physics", "we have 50+ choreographed steps", "designer already exported Lottie JSON". Do not pull GSAP for a fade-in.

## WOW-effect catalog (use sparingly — max 1-2 per product)

```
1. Cursor-following gradient        — premium feel, subtle, ~10 lines JS
2. Magnetic buttons                 — cursor pulls button slightly; 1-2 px max
3. Stagger reveal on scroll         — list items fade-up in sequence (60ms offset)
4. Shared element transition        — element morphs from list to detail
5. Optimistic UI with success burst — instant feedback + checkmark/confetti
6. Skeleton with shimmer            — perceived performance boost
7. Parallax depth                   — background slower than foreground (max 2 layers)
8. Confetti on conversion           — first signup, purchase complete
9. Cursor-aware 3D tilt on cards    — subtle depth (max ±5deg)
10. Page-load morph                 — splash element morphs into header logo
11. Hero shader wash                — animated GLSL fragment shader behind hero
12. Mesh gradient hero background   — animated radial-gradient blobs
```

## Procedure

1. **Step 0** — read brandbook motion + components
2. **Categorize interaction** by tier (decision tree)
3. **Select approach** from Animation approaches list (CSS-only first, escalate only if needed)
4. **Select easing** per tier
5. **If WOW moment**: pick from catalog, justify why this moment
6. **Implement with prototype-builder** in HTML/CSS:
   - GPU-accelerated properties only (transform, opacity)
   - `prefers-reduced-motion: reduce` fallback
   - Pause off-screen animations
7. **Test cross-browser** + reduced-motion mode + slow 3G + CPU throttle
8. **DevTools Performance audit** — confirm stable 60fps, no purple/green bars during animation
9. **ui-polish-reviewer** check: feels right, not gratuitous
10. **Score** with prototype rubric
11. **Auto-spawn preview** (required): invoke `supervibe:preview-server` skill with `--root <output-dir>` after files are written. Hand URL to user with hot-reload note.

## Output contract

Returns:
- Animation/transition spec per element (tier + easing + duration + approach)
- prefers-reduced-motion fallback
- WOW moment justification (if applicable)
- Performance audit notes (transform/opacity only, no layout-trigger properties)
- Cross-browser screenshot or recording
- **Preview URL**: http://localhost:NNNN — auto-spawned after generation, hot-reload on

```
Confidence: <N>.<dd>/10
Override: <true|false>
Rubric: prototype
```

## Anti-patterns

- **Linear easing for user-initiated transitions** — reads as mechanical. Use ease-out.
- **1000ms+ duration for action feedback** — eternity in UX time. Buttons/toasts/dropdowns ≤ 250ms.
- **Animating `width/height/top/left`** instead of transform — triggers layout each frame, drops to <30fps on cheap devices.
- **Ignoring `prefers-reduced-motion`** — accessibility violation; vestibular-disorder users get sick.
- **60fps animations on devices that can't sustain** — without fallback. Test on throttled CPU; fallback to instant.
- **Hover-only interactions on touch devices** — `:hover` on iOS sticks until next tap; provide touch-equivalent or focus-visible.
- **Scroll-jacking / hijacking native scroll** — users HATE losing scroll velocity control. Never preventDefault scroll for "cinematic" effects.
- **Entrance animations that delay user action** — hero fade-in for 1.5s blocks Skip-to-content. Animate decoratively, not on critical path.
- **Using JS animation when CSS suffices** — extra runtime + main-thread cost for no benefit.
- **Forgetting to pause animations off-screen** — wasted CPU + battery.
- **Mismatched easings between related elements** — modal opens with ease-out, closes with ease-in-out; reads as chaos. Pick a system; stick to it.
- **Relying on libraries when 20 lines of native CSS would do** — every kb of JS is paid by every user.
- **`will-change` on every element** — exhausts GPU memory; defeats the purpose; sometimes worse than not having it.
- **Animating during initial page paint** — hurts LCP and INP scores; defer to next frame or after `load`.
- **Bouncy easing for serious actions** — delete-confirmation should feel weighty; bounce reads as "the app isn't taking this seriously".

### Skill-level fail conditions
- `asking-multiple-questions-at-once` — bundling >1 question into one user message. ALWAYS one question with `Шаг N/M:` progress label.
- `advancing-without-feedback-prompt` — concluding delivery without printing the 5-choice feedback block (✅ / ✎ / 🔀 / 📊 / 🛑) and waiting for explicit user choice.
- `random-regen-instead-of-tradeoff-alternatives` — when user dislikes a direction, re-rolling without producing 2-3 documented alternatives via `templates/alternatives/tradeoff.md.tpl`.

## Verification

- DevTools Performance tab: stable 60fps, no purple "layout" bars or green "paint" bars during animation
- `prefers-reduced-motion` test: animations either disabled or shortened to ≤10ms
- Screen-reader compatibility: aria-live for status changes; no important content gated behind animation
- Touch device test: no hover-only states block functionality
- Slow 3G + CPU throttle (DevTools 4x): still feels OK or has graceful fallback
- Lottie/SVG: file size ≤ 200KB per asset for hero, ≤ 30KB for icons
- Animation property audit (grep): only `transform`, `opacity`, `filter`, `color`, `background-color`, `box-shadow` — never `width/height/top/left/margin/padding`
- Bundle size: any animation library added must justify its kb cost in PR description
- ui-polish-reviewer approval

## Guard rails

- DO NOT: animate `width/height/top/left` (causes reflow; use transform)
- DO NOT: skip `prefers-reduced-motion` fallback (a11y violation)
- DO NOT: use >2 WOW effects in product (dilutes impact)
- DO NOT: use bouncy easing for serious actions (delete confirm = ease-in, not bounce)
- DO NOT: invent new tiers (5 are enough; consistency > novelty)
- DO NOT: pull a library before exhausting native CSS + Web Animations API
- DO NOT: animate during initial paint — defer to next rAF
- DO NOT: hijack native scroll for cinematic effects
- ALWAYS: GPU-accelerated properties only
- ALWAYS: test reduced-motion mode
- ALWAYS: pause animations off-screen via Intersection Observer
- ALWAYS: provide fallback for modern features (View Transitions, scroll-driven animations)

## Related

- `agents/_design/creative-director` — sets the motion language and WOW-moment strategy
- `agents/_design/prototype-builder` — implements animations in HTML/CSS/JS
- `agents/_design/ui-polish-reviewer` — reviews motion quality and polish
- `agents/_design/accessibility-reviewer` — verifies reduced-motion + a11y compliance
- `agents/_design/ux-ui-designer` — owns interaction-design layer
- `supervibe:brandbook` — `motion.md` is source of truth for tiers + easings
- `supervibe:prototype` — invokes this skill during prototype build
- `supervibe:landing-page` — invokes this skill for hero animations
- `supervibe:preview-server` — auto-spawned after implementation for live preview
