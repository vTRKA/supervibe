# Interaction Design Pattern Reference

This file is the one-hop reference for `skills/interaction-design-patterns/SKILL.md`.
Keep reusable tables, snippets, and examples here; keep workflow gates in the
skill entrypoint.

## Timing Tiers

| Tier | Duration | Use case | Default easing |
| --- | --- | --- | --- |
| instant | 0-100ms | hover state, focus ring, color shift | ease-out |
| quick | 150-250ms | button press, tooltip, dropdown, toast | ease-out-quad |
| considered | 250-450ms | modal, drawer, section reveal, accordion | ease-in-out-quart |
| deliberate | 450-700ms | hero entrance, route transition, staged sequence | ease-out-expo |
| narrative | 700ms+ | onboarding or scene change | custom per moment |

Every 100ms past 250ms must earn its place. Interaction feedback should feel
immediate; storytelling motion may be slower only when it is not blocking work.

## Easing Tokens

```css
:root {
  --ease-linear: cubic-bezier(0, 0, 1, 1);
  --ease-out-quad: cubic-bezier(0.25, 0.46, 0.45, 0.94);
  --ease-in-out-quart: cubic-bezier(0.77, 0, 0.175, 1);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-in-expo: cubic-bezier(0.7, 0, 0.84, 0);
  --ease-out-back: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-spring-soft: cubic-bezier(0.5, 1.25, 0.5, 1);
  --ease-material: cubic-bezier(0.4, 0, 0.2, 1);
}
```

Use `ease-out` for user-initiated transitions because response starts fast. Use
`ease-in` for exits. Use bounce/back curves only for playful success moments,
never destructive or compliance-heavy actions.

## Pattern Selection Matrix

| Need | Preferred approach | Escalate when |
| --- | --- | --- |
| Simple state change | CSS transition | timing is dynamic or chained |
| Idle decorative loop | CSS keyframes | many particles or custom rendering |
| Programmatic values | Web Animations API | timeline orchestration needs a library |
| Scroll reveal | Intersection Observer | scroll position itself drives progress |
| Layout reorder | FLIP | route continuity needs View Transitions |
| Shared route element | View Transitions API | browser support needs FLIP fallback |
| Drag/release physics | rAF spring or Motion One | gesture state is complex |
| 1000+ particles | Canvas 2D | real depth/shaders require WebGL |
| Real 3D or shaders | Three.js/WebGL | static poster can satisfy the brief |

## CSS Transition Recipe

```css
.button {
  background: var(--color-action-bg);
  color: var(--color-action-fg);
  transform: translateY(0);
  transition:
    background-color var(--duration-quick) var(--ease-out-quad),
    transform var(--duration-instant) var(--ease-out-quad),
    box-shadow var(--duration-quick) var(--ease-out-quad);
}

.button:hover {
  background: var(--color-action-bg-hover);
  transform: translateY(-1px);
}

.button:active {
  transform: translateY(0);
  transition-duration: 50ms;
}
```

Use for hover/focus/active states, dropdown visibility, and small state changes.
Do not transition `display`; combine `visibility`, `opacity`, and transform.

## Keyframe Recipe

```css
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}

.ambient-card {
  animation: float 4s var(--ease-in-out-quart) infinite;
  animation-fill-mode: both;
}

@media (prefers-reduced-motion: reduce) {
  .ambient-card { animation: none; }
}
```

Use for decorative loops only. Pause idle animation off-screen if it runs for
more than a few seconds.

## Web Animations API Recipe

```js
const animation = element.animate(
  [
    { transform: 'translateY(16px)', opacity: 0 },
    { transform: 'translateY(0)', opacity: 1 },
  ],
  {
    duration: 350,
    easing: 'var(--ease-out-expo)',
    fill: 'both',
  }
);

await animation.finished.catch(() => {});
```

Use WAAPI for dynamic values, sequences, or cancelable one-shot effects. Wrap
`finished` because cancellation rejects the promise.

## Intersection Observer Reveal

```js
const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    entry.target.classList.add('is-visible');
    observer.unobserve(entry.target);
  }
}, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });

document.querySelectorAll('[data-reveal]').forEach((node) => observer.observe(node));
```

```css
[data-reveal] {
  opacity: 0;
  transform: translateY(var(--space-4));
  transition:
    opacity var(--duration-considered) var(--ease-out-expo),
    transform var(--duration-considered) var(--ease-out-expo);
}

[data-reveal].is-visible {
  opacity: 1;
  transform: none;
}

@media (prefers-reduced-motion: reduce) {
  [data-reveal] {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

## FLIP Layout Transition

```js
function flip(element, mutate) {
  const first = element.getBoundingClientRect();
  mutate();
  const last = element.getBoundingClientRect();
  const dx = first.left - last.left;
  const dy = first.top - last.top;

  element.animate(
    [
      { transform: `translate(${dx}px, ${dy}px)` },
      { transform: 'translate(0, 0)' },
    ],
    { duration: 400, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
  );
}
```

Use when list/grid items move because the DOM changed. Reset transforms before
measuring if the element already has transforms.

## View Transition Fallback Shape

```js
async function navigateWithTransition(url, swapDom) {
  if (!document.startViewTransition) {
    await swapDom(url);
    return;
  }

  await document.startViewTransition(() => swapDom(url)).finished;
}
```

`view-transition-name` values must be unique during a transition. If support is
missing, navigation must still work instantly or with a FLIP clone.

## Spring Tuning

| Parameter | Typical UI range | Meaning |
| --- | --- | --- |
| mass | 1.0-1.5 | heavier elements accelerate more slowly |
| stiffness | 170-300 | higher values snap faster |
| damping | 20-40 | higher values reduce wobble |

For serious UI, avoid visible overshoot. End the rAF loop when both velocity and
distance-to-target are below a small epsilon.

## Loading States

Use skeletons for fetches that commonly exceed 200ms. Shape skeletons like the
final content to prevent layout shifts.

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--color-skeleton-base),
    var(--color-skeleton-highlight),
    var(--color-skeleton-base)
  );
  background-size: 200% 100%;
  animation: shimmer 1.4s linear infinite;
}

@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}
```

Under reduced motion, render a static placeholder.

## Media And Graphics Choices

| Content | Format | Notes |
| --- | --- | --- |
| Photography | AVIF, WebP, JPEG fallback | include width/height and meaningful alt |
| UI screenshots | PNG or WebP lossless | avoid lossy text edges |
| Icons/logos | SVG | inline only when CSS/JS access is needed |
| Animated short media | WebM over GIF | GIF is much larger |
| Designer vector animation | Lottie | local runtime, lazy load, static poster |
| Generative hero | Canvas 2D | use for many simple particles |
| Real 3D/shader | Three.js/WebGL | requires capability plan and fallback |

Before promising video/GIF output, run
`node scripts/detect-media-capabilities.mjs --json`. If unavailable, choose live
CSS/WAAPI, storyboard frames, SVG/Lottie spec, or a static poster.

## WOW Moment Catalog

Use at most one or two:
- Cursor-following gradient for a premium but subtle hero.
- Magnetic button with 1-2px movement.
- Staggered reveal for list entrance.
- Shared element transition from list to detail.
- Optimistic success burst after a conversion.
- Skeleton shimmer for perceived performance.
- Lightweight parallax with no scroll hijacking.
- Cursor-aware tilt capped at 5 degrees.
- Page-load morph when it does not block first interaction.
- Shader wash only with performance budget and fallback.

## Library Escalation

| Need | Candidate |
| --- | --- |
| Pure CSS state transitions | no dependency |
| Choreographed timeline | GSAP with plan |
| Lightweight spring UI | Motion One |
| React spring UI | motion/Framer Motion family |
| Simple tweening | Anime.js |
| 3D/shaders | Three.js |
| After Effects export | lottie-web |
| Robust scroll scenes | GSAP ScrollTrigger with plan |

Do not add a library for a fade-in, hover state, dropdown, or skeleton.

## Verification Prompts

- Reduced motion: emulate reduce and confirm large movement is removed.
- Performance: inspect frame track; layout and paint spikes during animation are
  failures for complex motion.
- Touch: essential actions must not depend on hover.
- Accessibility: status changes use ARIA where content changes matter.
- Bundle: any library has a recorded purpose, local delivery path, and size
  budget.

## Anti-Patterns

- Linear easing for user actions.
- Action feedback longer than 250ms.
- Animating `width`, `height`, `top`, `left`, `margin`, or `padding`.
- Scroll-jacking or preventing native scroll velocity.
- Entrance animation that blocks content or first action.
- `will-change` on many elements or forever.
- Hover-only controls on touch surfaces.
- Bouncy easing for serious, destructive, or regulated actions.
