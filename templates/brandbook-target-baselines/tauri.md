# Tauri Brandbook Baseline

> Inherits most of `electron.md`. Differences below.

## Webview engine differences
- macOS WKWebView: Safari-engine; CSS feature gaps vs Chromium
- Windows WebView2: Chromium-equivalent
- Linux WebKitGTK: older Safari-engine

**Avoid Chromium-only CSS without fallbacks:**
- `:has()` — Safari 15.4+, OK on macOS Big Sur 11.4+ only
- `aspect-ratio` — Safari 15+
- View Transitions API — behind flag in Safari

## Bundle constraint
Tauri's value is < 10 MB binary — keep it that way:
- NO CSS framework above ~10 KB gzipped
- NO bundled web fonts > 50 KB total — prefer system fonts
- Subset any unavoidable web font

## Motion budget
Same as Electron, but: WKWebView / WebKitGTK may stutter on heavy filter/blur — avoid `backdrop-filter` chains.

## Component baseline
Same as Electron — except: don't use `<dialog>` element (WKWebView support spotty pre-15.4); polyfill or use ARIA `role="dialog"`.
