/* shadcn/ui token bridge
 * Source: .supervibe/artifacts/prototypes/_design-system/tokens.css
 * Generated: <ISO-date>
 * Regenerate when tokens.css changes.
 *
 * shadcn's globals.css typically declares :root vars like --background, --foreground, --primary.
 * Here we re-declare them as references to OUR tokens, so shadcn components inherit project palette.
 */

@import "../../tokens.css"; /* project tokens are the source of truth */

:root {
  --background: var(--color-bg-default);
  --foreground: var(--color-text-primary);
  --card: var(--color-bg-elevated);
  --card-foreground: var(--color-text-primary);
  --popover: var(--color-bg-elevated);
  --popover-foreground: var(--color-text-primary);
  --primary: var(--color-primary-500);
  --primary-foreground: var(--color-on-primary);
  --secondary: var(--color-secondary-500);
  --secondary-foreground: var(--color-on-secondary);
  --muted: var(--color-bg-muted);
  --muted-foreground: var(--color-text-muted);
  --accent: var(--color-accent-500);
  --accent-foreground: var(--color-on-accent);
  --destructive: var(--color-danger-500);
  --destructive-foreground: var(--color-on-danger);
  --border: var(--color-border-default);
  --input: var(--color-border-default);
  --ring: var(--color-primary-500);
  --radius: var(--radius-md);
}

.dark {
  --background: var(--color-bg-default-dark, var(--color-bg-default));
  /* Mirror for dark mode if tokens.css declares dark variants */
}
