/* ============================================================
   Design System — Motion (named timings + easings + keyframes)
   ============================================================
   Every animation in every prototype + production component
   uses these tokens. No inline cubic-bezier, no inline ms.
   Adding a curve = system extension dialogue, not ad-hoc.

   Reference for choosing values: skills/interaction-design-patterns/SKILL.md
*/

:root {
  /* === DURATIONS — timing tiers =========================== */
  --duration-instant:    100ms;  /* hover, focus ring, color shift */
  --duration-quick:      200ms;  /* button press, tooltip, dropdown */
  --duration-considered: 350ms;  /* modal, drawer, page section reveal */
  --duration-deliberate: 600ms;  /* hero entrance, staged sequence */
  --duration-narrative:  1000ms; /* onboarding, landing storytelling (rare) */

  /* === EASINGS — named cubic-bezier curves ================ */
  --ease-out-quad:     cubic-bezier(0.25, 0.46, 0.45, 0.94);  /* default state-change */
  --ease-out-quart:    cubic-bezier(0.25, 1, 0.5, 1);          /* dropdown open, button hover */
  --ease-out-expo:     cubic-bezier(0.16, 1, 0.3, 1);          /* hero reveal, page transition */
  --ease-in-expo:      cubic-bezier(0.7, 0, 0.84, 0);          /* exit, fade-out */
  --ease-in-out-quart: cubic-bezier(0.77, 0, 0.175, 1);        /* modal symmetric */
  --ease-out-back:     cubic-bezier(0.34, 1.56, 0.64, 1);      /* playful enter, success */
  --ease-spring-soft:  cubic-bezier(0.5, 1.25, 0.5, 1);        /* spring approximation */
  --ease-material:     cubic-bezier(0.4, 0, 0.2, 1);           /* safe default */
}

/* === KEYFRAMES — named animations ========================= */
@keyframes fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes fade-up {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: none; }
}

@keyframes fade-down {
  from { opacity: 0; transform: translateY(-8px); }
  to   { opacity: 1; transform: none; }
}

@keyframes scale-in {
  from { opacity: 0; transform: scale(0.96); }
  to   { opacity: 1; transform: scale(1); }
}

@keyframes slide-up {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.5; }
}

@keyframes shimmer {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}

/* === REDUCED MOTION discipline (mandatory) ================ */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration:   0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration:  0.01ms !important;
    scroll-behavior:      auto !important;
  }
}
