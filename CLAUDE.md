# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

"Abdul Tools" / Dev Suite: an Electron desktop app bundling small developer/design utilities (image resizer, bulk renamer, typescale, PDF→JPG, favicon generator, SVG optimizer, image cropper, color palette, code formatter, Base64, CSS builder). Vanilla JS + Tailwind v4, built with Vite. No framework, no tests, no linter.

## Commands

Node version is pinned in `.nvmrc` (22.12.0; `engines` requires >=20.19).

- `npm run dev` — Vite dev server (browser only; IPC-backed features fall back or are disabled). `Run-Dev-Suite-Local.bat` runs it on `0.0.0.0:5174`.
- `npm run build` — Vite build to `dist/` (single inlined `index.html` via `vite-plugin-singlefile`).
- `npm run electron` — run Electron against the built `dist/index.html`. Run `npm run build` first. To point Electron at the dev server instead, set `VITE_DEV_SERVER_URL` (e.g. `http://localhost:5173`) before `npm run electron`.
- `npm run build-exe` — build + package Windows NSIS installer into `release/` (unpacked app at `release/win-unpacked/dev-suite.exe`, which the `Launch-Dev-Suite*.bat` files start). `npm run build-mac` for DMG.

`package.json` references `icon.ico` for the window/installer icon, but it is not currently in the repo.

## Architecture

**Two processes, insecure-by-design bridge.** `electron-main.cjs` (CommonJS, main process) creates the window with `nodeIntegration: true, contextIsolation: false`. There is no preload script; renderer code calls `window.require('electron').ipcRenderer` directly and guards on `window.require` existing so the page still loads in a plain browser.

**Native work lives in the main process** via `ipcMain.handle` channels:
- `process-image-sharp` — resize/convert/re-encode with `sharp` (webp/jpeg/png/jxl), always `withMetadata()` to preserve EXIF/XMP/alt text.
- `crop-image` — `sharp().extract()`.
- `create-zip` — builds the ZIP with JSZip in Node, then shows a save dialog.
- `save-file` — save dialog + write.

ZIP creation and file writes deliberately go through IPC rather than running JSZip in the renderer, because Vite's Buffer polyfill breaks JSZip (see comment in `src/download.js`). Use `downloadBlob` / `downloadZip` from `src/download.js` for any output; `downloadZip` has no browser fallback.

**Renderer layout.** `index.html` contains all tool markup statically: a nav of `.tab-btn[data-tab="X"]` buttons and matching `<div id="tool-X" class="tool-section">` panels. `src/main.js` handles tab switching, dark mode (`html.dark` class persisted to `localStorage.theme`, initial value set by an inline script in `index.html`), and `[data-tooltip]` tooltips, then calls each tool's `initX()` wrapped in its own try/catch so one broken tool doesn't take down the others.

**Each tool** is `src/tools/<name>.js` exporting `init<Name>()`, which looks up its elements by id from `index.html` (ids are prefixed per tool, e.g. `b64-*`, `cssb-*`), returns early if its root element is missing, and wires up listeners. Tools with sub-tabs implement their own local `switchTab` by toggling Tailwind classes. Shared helpers: `src/toast.js` (`showToast(message, type)`), `src/download.js`.

**Adding a tool:** add the nav button + `tool-<id>` section to `index.html`, create `src/tools/<name>.js` with `init<Name>()`, and import/call it in `src/main.js`. If it needs Node/native APIs, add an `ipcMain.handle` in `electron-main.cjs`.

**External deps worth knowing:** pdf.js is loaded from a CDN `<script>` in `index.html` (global, not an npm import). SVGO is imported as `svgo/browser` in the renderer. Dark-mode styling is mostly done in `src/style.css` with `html.dark ...` overrides of Tailwind utility classes rather than `dark:` variants.

## Communication

Always reply to the user in Arabic, in the Levantine (Shami) dialect. Code, identifiers, commands, and commit messages stay in English.
