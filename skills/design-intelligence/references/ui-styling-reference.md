# UI Styling Reference

Use stack and styling rows to guide implementation handoff.

Rules:
- Prefer the target stack's existing component and icon libraries.
- Lucide-first for new icon buttons when the stack has no approved icon family.
- Do not install Shadcn, Tailwind, Heroicons, or Phosphor automatically. Use them only when already present or approved.
- Keep responsive constraints explicit: grid tracks, aspect ratios, min/max sizes, and stable toolbar dimensions.
