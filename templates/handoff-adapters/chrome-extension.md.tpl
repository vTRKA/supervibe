# Chrome MV3 Extension Adapter — <prototype-slug>

> Source HTML: .supervibe/artifacts/prototypes/<slug>/{popup,options,side-panel}/index.html
> Target stack: Chrome MV3 (works on Edge, Brave, Vivaldi, Opera)

## Manifest surfaces
Map prototype HTML to MV3 manifest entries:

```json
{
  "manifest_version": 3,
  "action": { "default_popup": "popup/index.html", "default_icon": "..." },
  "options_page": "options/index.html",
  "side_panel": { "default_path": "side-panel/index.html" },
  "content_security_policy": {
    "extension_pages": "script-src 'self'; object-src 'self';"
  }
}
```

## CSP constraints
MV3 CSP is strict:
- NO inline `<script>` content (must be external file)
- NO `eval`, `new Function`, inline event handlers (`onclick=...`)
- NO remote scripts
- ✅ external file refs to extension's own `.js` files

If your prototype HTML has any inline `<script>` content, refactor to external `.js` BEFORE handoff.

## Storage
- `chrome.storage.local` (5 MB) — most data
- `chrome.storage.sync` (100 KB total, 8 KB per item) — user settings to sync across devices
- NEVER `localStorage` — extension contexts have separate origins

## Messaging
- popup ↔ service worker: `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`
- content script ↔ extension: `chrome.tabs.sendMessage` / `chrome.runtime.connect`

## Permissions
Declare ONLY what's needed in `manifest.json` `permissions:[]`. Each new permission triggers user re-prompt on update.

## Surface dimensions
- popup: max 800×600 enforced by Chrome
- options page: full-tab, design as a normal web page
- side-panel: 280–800 wide; user can resize

## Anti-patterns
- `localStorage` — wrong origin, data lost
- inline event handlers (CSP violation)
- assuming popup stays open (closes on focus loss)
- background service worker holds state in JS variables (worker can be killed)
