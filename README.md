# Chrome Page Fixer

Phase 1: scaffold + error fixture only.

## Setup

```bash
pnpm install
pnpm dev
```

WXT writes the build to `.output/chrome-mv3`. Load it as an unpacked extension in `chrome://extensions` with developer mode enabled.

## Manual verification

Open `tests/error-pages/index.html` in the loaded extension's browser. The page intentionally triggers:

- `console.error`
- `window.onerror` (uncaught throw)
- `Promise.reject` (unhandled rejection)
- one failed `fetch`

Phase 1 only reserves the Side Panel mount and the message channel. Capturing, listing, and Tool calls arrive in Phase 2+.

## Permission budget

Only the permissions listed in `docs/constraint/manifest-permissions.md` are declared. See `wxt.config.ts`.