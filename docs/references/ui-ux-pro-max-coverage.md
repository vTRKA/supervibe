# UI/UX Pro Max Coverage

This reference is not a runtime dependency. Supervibe uses the adapted UI/UX coverage model as a checklist for design-facing agents and skills. The goal is to preserve the useful design review breadth while keeping Supervibe host-neutral, token-governed, and evidence-backed.

## Coverage Domains

Every design-facing workflow must explicitly consider these ten domains when the surface is relevant:

1. Accessibility
2. Touch & Interaction
3. Performance
4. Style Selection
5. Layout & Responsive
6. Typography & Color
7. Animation
8. Forms & Feedback
9. Navigation Patterns
10. Charts & Data

## Product Fit

Use a product-fit style matrix before committing to visual direction. Match the product category, user trust burden, density, interaction mode, and platform conventions before selecting style, palette, typography, motion, and component density.

Examples of product-fit decisions:

- Operational SaaS and admin tools prioritize clarity, density, predictable navigation, keyboard paths, and fast scanning.
- Finance, healthcare, government, and safety-sensitive products prioritize trust, high contrast, conservative motion, visible recovery paths, and accessibility.
- Consumer, creator, gaming, and campaign surfaces may carry stronger visual identity, but still need state coverage, readable type, and reduced-motion fallbacks.
- Data-heavy products require chart semantics, legends, tooltips, accessible encodings, filtering, export, and virtualization for large lists.

## Stack-Aware UI Guidance

Design guidance must be stack-aware UI guidance, not generic visual taste:

- Web prototypes use native HTML/CSS/JS and Supervibe tokens before framework handoff.
- React, Vue, Svelte, Angular, Laravel, and similar stacks receive framework-neutral handoff plus token/component mapping.
- Mobile-native flows must respect platform safe areas, touch targets, system navigation, dynamic type, and gesture alternatives.
- shadcn/ui, Tailwind, Radix, Material, SwiftUI, Flutter, and other libraries are implementation adapters; they do not override approved tokens or accessibility requirements.

## Mandatory Gates

- Accessibility: contrast, labels, keyboard, focus, semantic structure, reduced motion, screen-reader announcements.
- Touch & Interaction: target size, spacing, press feedback, hover-independent primary actions, gesture alternatives.
- Performance: image dimensions, lazy loading, font loading, layout shift prevention, main-thread budget, list virtualization where needed.
- Style Selection: style matches product category and is consistent across screens; icon language is unified.
- Layout & Responsive: declared viewports only, no horizontal scroll, safe areas, content priority, stable dimensions.
- Typography & Color: semantic tokens, readable sizes, line length, hierarchy, dark-mode pairing where supported.
- Animation: meaningful, interruptible, transform/opacity based, duration tokenized, reduced-motion safe.
- Forms & Feedback: visible labels, inline errors, loading/success/error states, recovery paths, autosave where appropriate.
- Navigation Patterns: predictable back behavior, active state, deep links for key screens, appropriate nav depth.
- Charts & Data: chart type fits data, legends/tooltips exist, color is not the only encoding, tables/lists handle scale.

## Anti-Patterns

- Letting a style trend override product context.
- Using draft prototype visuals as production guidance before final tokens.
- Raw colors, magic spacing, arbitrary shadows, or one-off icon styles.
- Hover-only interactions, missing focus rings, disabled zoom, or gesture-only critical actions.
- Chart visuals without labels, legends, accessible color treatment, or data-state coverage.
