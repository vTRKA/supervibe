{
  "$schema": "https://github.com/vTRKA/supervibe/schemas/prototype-approval.json",
  "status": "approved",
  "approvedAt": "{{ISO date — e.g. 2026-04-28T14:30:00Z}}",
  "approvedBy": "{{user — read from `git config user.name`}}",
  "viewports": [375, 1440],
  "designSystemVersion": "{{git commit sha of prototypes/_design-system/ at approval time}}",
  "previewUrl": "http://localhost:{{port}}",
  "feedbackRounds": 0,
  "approvalScope": "full",
  "_scope_options": [
    "full           — entire prototype across all declared viewports",
    "viewport-mobile  — only 375px slice approved; desktop still draft",
    "viewport-desktop — only 1440px slice approved; mobile still draft",
    "layout-only    — structure approved; copy/colors still need work"
  ],
  "reviewsResolved": {
    "polish": "<count of polish issues fixed>",
    "a11y": "<count of WCAG violations fixed>",
    "seo": "<count of SEO findings fixed — landing only>"
  },
  "alternatives": [],
  "_alternatives_note": "If user explored variants, list them here as { name, summary, rejectedReason } — keeps decision audit trail"
}
