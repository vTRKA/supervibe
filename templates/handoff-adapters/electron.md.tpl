# Electron Adapter — <prototype-slug>

> Source HTML: prototypes/<slug>/{main-window,settings}/index.html
> Target stack: Electron renderer process — same HTML/CSS/JS works directly

## Renderer process
The HTML in this prototype runs near-verbatim in the Electron renderer. Differences from web:
- No `localStorage` quota limits practically
- Direct file:// access available (but security: prefer IPC)
- DevTools always available (Cmd-Opt-I / Ctrl-Shift-I)
- `process` global exists if `nodeIntegration: true` (NOT recommended)

## IPC contract
The prototype likely mocks data — replace with `window.api.*` calls exposed via `contextBridge`:

```ts
// preload.ts (production)
contextBridge.exposeInMainWorld('api', {
  getUser: () => ipcRenderer.invoke('user:get'),
  saveSettings: (s) => ipcRenderer.invoke('settings:save', s),
});
```

## Window chrome
- macOS: traffic-light buttons fixed; `titleBarStyle: 'hiddenInset'` for custom chrome
- Windows: minimize/maximize/close on right; for custom chrome use `frame: false` + custom drag region (`-webkit-app-region: drag`)
- Linux: varies by DE — test KDE + GNOME

## Multi-window
- Each window is its own renderer process
- Share state via main process (`ipcMain.handle`) or shared `BrowserWindow.webContents.send`

## Anti-patterns
- using `nodeIntegration: true` (security)
- `remote` module (deprecated)
- synchronous `ipcRenderer.sendSync` (blocks renderer)
- assuming Chromium's latest features without testing on Electron's bundled version
