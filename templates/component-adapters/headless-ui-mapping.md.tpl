# Headless Library Mapping — <library-name>

> Generated: <ISO-date>
> Source baseline: .supervibe/artifacts/prototypes/_design-system/components/

| Our baseline | Headless primitive | Notes |
|---|---|---|
| Button | (none — use native `<button>`) | tokens applied directly |
| Input | (none — use native `<input>`) | tokens applied directly |
| Select | <library>/Listbox | replaces native select for advanced cases |
| Checkbox | (native) or <library>/Checkbox | native preferred |
| Radio | <library>/RadioGroup | for keyboard-arrow group navigation |
| Toggle | <library>/Switch | accessible role=switch built-in |
| Card | (none — composite) | structural CSS only |
| Modal | <library>/Dialog | built-in focus trap + return |
| Toast | <library>/Toast or custom | check whether library ships toast |
| Tabs | <library>/Tab.Group | roving tabindex built-in |
| Nav | (none — composite) | landmark + your tokens |
| Badge | (none — visual only) | tokens applied directly |

## Theme application
This library is logic-only — visual tokens come from `tokens.css` applied via class names or CSS variables. No theme provider is configured.

## Anti-patterns specific to this library
<list 2-3 known footguns>
