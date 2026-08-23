# Chrome Page Fixer

> **Structurally capture browser-side errors and emit AI-friendly envelopes for Claude Code / Codex / Agent.**

[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-success.svg)](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6.svg)](https://www.typescriptlang.org)
[![MV3 Permissions](https://img.shields.io/badge/Permissions-minimal-orange.svg)](docs/constraint/manifest-permissions.md)

A Manifest V3 Chrome extension that captures page errors from the **main world** (so React/Vue/SPA errors are not lost to the isolated world), and emits a structured **envelope report** designed for AI tooling — Claude Code, Codex, or any agent — to read at a glance.

> [!IMPORTANT]
> **Privacy first.** The extension saves errors only to local `chrome.storage`. Network calls go **only** to a proxy URL you provide in Options. The API key is never sent to anyone except that proxy.

---

## At a glance

| Side Panel | Options | AI envelope |
| :---: | :---: | :---: |
| ![Side Panel](docs/screenshots/side-panel.svg) | ![Options](docs/screenshots/options.svg) | ![Envelope](docs/screenshots/envelope.svg) |

---

## What it does

- Captures `console.error` / `console.warn` / `console.info`, uncaught exceptions, unhandled `Promise` rejections, and resource-load failures (script/style/img).
- Captures native resource load failures (`<img>` 502, `<script>` 404) via `chrome.webRequest.onResponseStarted` — for the cases browser consoles log but never emit JS events.
- Captures `fetch` / `XMLHttpRequest` 4xx and 5xx, plus network-layer failures, and attaches the most recent `click` / `submit` / `keydown` target as `triggerSelector` / `triggerElement`.
- Renders each error as a single entry in the Side Panel with a level color bar.
- Single-copy and bulk-copy buttons, including an **AI-friendly envelope** that names kind, level, route, page title, viewport, focused element, source, and stack.
- BYOK + custom proxy URL — Key is stored only in `chrome.storage.local`. The extension never hardcodes any provider.
- Multi-turn chat with stable `#N` references; "问他" reuses the most recent session that references the same error hash.
- Anthropic **Tool Use**: the agent can call **12 read-only Tools** to enumerate the captured error buffer, query DOM elements, read console / network / storage / resource timing / event listeners / page HTML / navigation timing. Tool loop is capped at 5 rounds by SDK `stopWhen: stepCountIs(5)`.

## Who it's for

- Frontend developers debugging React / Vue / SPA errors in production.
- Teams feeding structured errors to Claude Code for automated root-cause analysis.
- Anyone who wants their browser-side failure context to be **machine-readable**, not a wall of console text.

## Quick start

### Prerequisites

- Node.js 20+ and pnpm 10+
- Chrome 121+ (Manifest V3)

### Install and build

```bash
pnpm install
pnpm build
```

The build output is `.output/chrome-mv3/`. Load it as an unpacked extension in `chrome://extensions` (enable Developer mode).

### Use the default error fixture

Open `tests/error-pages/index.html` in the loaded browser. The Side Panel will show three entries (console error, uncaught throw, unhandled rejection). Copy them as Markdown for human consumption, or as an envelope for AI consumption.

### Trigger a real network failure

Open any page that loads a 4xx/5xx resource (e.g. a page with a 502 image) and the Side Panel will surface it as a `network` entry including the URL and status.

### Configure BYOK and proxy

Open the extension Options page (from `chrome://extensions` → "Extension options", or from the Side Panel status row). Default values are pre-filled:

> [!TIP]
> **The default Proxy URL is `http://127.0.0.1:5000/v1` and the default API Key is `PROXY_MANAGED`.** Both are no-ops until you point the URL at a working Anthropic-protocol proxy and replace the placeholder with a real key (or a token your proxy recognises).
>
> The Options page auto-strips a trailing `/messages` from your Proxy URL on save, so pasting `http://127.0.0.1:5000/v1/messages` is equivalent to `http://127.0.0.1:5000/v1`.

| Field | Default | Notes |
| --- | --- | --- |
| API Key | `PROXY_MANAGED` | Sent as `x-api-key` header. Replace with your gateway token. |
| Proxy URL | `http://127.0.0.1:5000/v1` | Must accept Anthropic Messages protocol. `/messages` suffix is auto-stripped. |
| App Hint | _(empty)_ | Optional. Tells the AI where your project root is, so it can locally inspect the right files. |

> [!WARNING]
> The proxy URL **must point at the Messages endpoint**. If you write `http://127.0.0.1:5000/v1/messages` it works as-is; the extension strips `/messages` before posting.

### Trigger an AI analysis

From the Side Panel, click **Analyze recent 5**. The extension posts the envelope to your proxy. The reply renders below the toolbar.

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│ user page (e.g. https://app.example.com)                     │
│                                                              │
│  ┌──── MAIN world (capture-main.content.ts) ────┐            │
│  │ listens for console.* / window error / ...   │            │
│  │ wraps fetch + XHR for 4xx/5xx                │            │
│  └──────────────────┬───────────────────────────┘            │
│                     │ postMessage({source, type, payload})    │
│  ┌──── ISOLATED world (capture.content.ts) ─────┐            │
│  │ chrome.runtime.sendMessage(payload) ──────────┼──┐         │
│  └──────────────────┬───────────────────────────┘  │         │
└─────────────────────┼───────────────────────────────┼─────────┘
                      ▼                               │
┌──────────────────────────────────────────────────────────────┐
│ background.ts (Service Worker)                                │
│                                                              │
│  PAGE_ERROR ─► dedup + 200-entry ring buffer + storage     │
│  ANALYZE ──► fetch(proxyUrl, {x-api-key, anthropic-version})│
│  webRequest ─► log native resource 4xx/5xx                  │
└──────────────────────────────────────────────────────────────┘
                      │
                      ▼
┌──────────────────────────────────────────────────────────────┐
│ Side Panel (React)                                           │
│                                                              │
│  ─ list (kind color bar + level + message + url)             │
│  ─ envelope copy (AI-friendly)                               │
│  ─ markdown copy (human-friendly)                            │
│  ─ multi-turn chat → Vercel AI SDK → Tool Use loop (≤5)    │
└──────────────────────────────────────────────────────────────┘
```

`docs/qa/` tracks how every design choice was disputed, decided, and constrained. `docs/constraint/` is the live rulebook for the extension — what permissions are allowed, what Tool shapes are allowed, what data leaves the page.

## Tools (12 read-only)

| name | source | purpose |
| --- | --- | --- |
| `get_errors` | buffer | List captured errors by kind/level/query |
| `get_error_by_index` | buffer | Fetch full ErrorEntry by stable `#N` |
| `search_errors_by_message` | buffer | Substring search across message / elementSummary / selector |
| `inspect_element` | DOM | Single element: tag / id / class / attribute whitelist / rect (no `textContent` / `innerHTML`) |
| `list_elements` | DOM | Flat list (count + items) or tree (skeleton, depth-controlled) |
| `get_console_messages` | console-buffer | `console.log/info/warn/error` history |
| `get_network_log` | network-buffer | webRequest 4xx/5xx history |
| `get_resource_timing` | PerformanceObserver | Per-resource load timing |
| `get_computed_style` | DOM | 12 default `getComputedStyle` properties or custom list |
| `get_storage_snapshot` | localStorage / sessionStorage | Keys + values (default `***` redaction; `properties` whitelist) |
| `get_event_listeners` | DOM (heuristic) | Inline `on*` attributes + captured triggers; cannot see `addEventListener` or framework virtual events |
| `get_page_dom_html` | DOM | `documentElement.outerHTML` with `maxLength` (default 8000) |
| `get_navigation_timing` | PerformanceNavigationTiming | Page-level timing: TTFB / DOMContentLoaded / load / FCP |

Bridge pattern: background → `chrome.tabs.sendMessage` (1 s timeout) → ISOLATED content → `window.postMessage` → MAIN world → reverse. `:root` / `html` / `body` / `*` selectors are rejected.

See `docs/constraint/tool-design.md` for the schema, privacy rules, and the lifecycle of new Tools.

## Project layout

```
chrome-page-fixer/
├── entrypoints/                # WXT auto-discovers .ts entrypoints
│   ├── background.ts           # Service Worker: event dispatcher + buffer
│   ├── capture-main.content.ts # MAIN world: console/error/network hooks + Tool bridges
│   ├── capture.content.ts      # ISOLATED world: bridge to background
│   ├── agent/                  # Vercel AI SDK adapter (provider, run loop, Tool registry)
│   ├── sidepanel/              # React Side Panel UI
│   ├── options/                # React Options UI (BYOK)
│   └── shared/                 # Types, format, storage, messaging, buffers, Tool impls
├── tests/
│   └── error-pages/            # Local HTML fixtures (no network)
├── docs/
│   ├── qa/                     # Decision records, evidence grading, e2e checklists
│   └── constraint/             # Permissions, Tool schema, agent safety, privacy
├── wxt.config.ts               # Manifest V3 + side_panel + options_ui
├── tsconfig.json               # strict + noUncheckedIndexedAccess
└── package.json
```

## End-to-end verification

- `docs/qa/e2e-verification-phase1-4.md` — capture / copy / BYOK / agent path (Phase 1–4).
- `docs/qa/agent-e2e-checklist.md` — 23-scenario grid for the 12 read-only Tools (user fills AI replies).

## Roadmap

### Done

- Phase 1–4: scaffold, capture, copy, AI envelope, BYOK + proxy.
- Network error capture via `chrome.webRequest` + `fetch`/`XHR` interception.
- AI-friendly envelope report with kind, level, route, viewport, focused element, source, stack.
- Multi-turn chat with stable `#N` references and session reuse by error hash.
- Network errors now carry `triggerSelector` / `triggerElement` (the most recent click/submit/keydown target); cross-origin / unrecorded cases are labeled honestly.
- 4 read-only Tools on a hand-rolled loop (`get_errors` / `get_error_by_index` / `search_errors_by_message` / `inspect_element`) at v-pre-ai-sdk.
- Agent framework: migrated to **Vercel AI SDK v7** + `@ai-sdk/anthropic` v4 + `zod` v4. Tool loop is `stopWhen: stepCountIs(5)`. Self-rolled `runAgentWithTools` / `ContentBlock` / `TOOL_REGISTRY` removed.
- 8 additional read-only Tools: `list_elements` / `get_console_messages` / `get_network_log` / `get_resource_timing` / `get_computed_style` / `get_storage_snapshot` / `get_event_listeners` / `get_page_dom_html` / `get_navigation_timing`.
- system-prompt rewritten: triangle-loop thinking, 12-Tool capability map, "envelope or tool — never speculate" boundary.
- Bundle impact: background.js 26 kB → 413 kB (+387 kB) — accepted once for "一次到位" — L2 decision-layer capabilities (description best practice, zod schema validation, `stopWhen` predicate, parallel tool calls).

### Planned

- Source-map-aware stack resolution against a local repo path.
- Recent-action timeline (clicks / inputs, max 5) for reproduction paths.
- Write-side Tools with domain allow-list + second-confirm + audit (per `docs/constraint/agent-safety.md`).

## Known limitations

- `<img>` 502 is captured via `chrome.webRequest`, which requires `host_permissions: ["<all_urls>"]`. We accept this privacy trade-off because JS-only paths miss it.
- `console.info` is captured but rarely used; toggle via `format.ts` if it pollutes your list.
- The proxy URL must be **Anthropic Messages** compatible (the wire format we speak). Switching to other providers means swapping the SDK adapter in `entrypoints/agent/provider.ts`; the proxy contract stays the same.
- No stream mode. The current reply is a single round-trip.

## Contributing

Issues and PRs welcome. Read `docs/qa/` first to understand the constraint model and the evidence-grading principle. All changes must:

1. Pass `pnpm typecheck` and `pnpm build`.
2. Keep `manifest.json` permissions inside `docs/constraint/manifest-permissions.md`.
3. Not load remote code at runtime (Manifest V3 policy).
4. Add or update a QA record under `docs/qa/` for any new architecture decision.

## License

Apache License 2.0. See [LICENSE](LICENSE).

Copyright 2026 SoftMeng / xiangyuanmeng.
