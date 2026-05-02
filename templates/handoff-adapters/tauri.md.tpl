# Tauri Adapter — <prototype-slug>

> Source HTML: .supervibe/artifacts/prototypes/<slug>/{main-window,secondary}/index.html
> Target stack: Tauri 2 webview

## Webview compatibility
Tauri uses platform-native webviews:
- macOS: WKWebView (Safari engine)
- Windows: WebView2 (Edge/Chromium)
- Linux: WebKitGTK (Safari engine, older)

**Test ALL three.** Features that work in Chromium may fail in WKWebView/WebKitGTK:
- `:has()` selector — Safari 15.4+ only
- Container queries — Safari 16+
- View Transitions API — Safari behind flag
- Some Web Animations API timeline features

## IPC contract
Replace mocked data with `invoke` calls:

```ts
import { invoke } from '@tauri-apps/api/core';
const user = await invoke('get_user');
```

Production Rust commands declared in `src-tauri/src/lib.rs`:
```rust
#[tauri::command]
fn get_user() -> User { ... }
```

## Asset paths
- Use Tauri's asset protocol (`tauri.conf.json` → `app.security.assetProtocol`)
- `convertFileSrc()` to translate file paths to webview-loadable URLs

## Bundle size
Tauri's selling point is small bundle. Audit:
- No CSS frameworks (or use Tailwind JIT-purged)
- No heavy fonts (subset or system-default)
- Tree-shake JS deps (Vite default)

## Anti-patterns
- assuming Chromium parity (test on macOS WKWebView!)
- `font-family: system-ui` without per-OS fallback list
- inline Node API access (always via `invoke`)
- bundle > 10 MB (defeats Tauri's purpose)
