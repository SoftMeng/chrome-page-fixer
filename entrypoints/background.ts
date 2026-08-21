import { ANALYZE, PAGE_ERROR } from "./shared/messaging";
import { DEFAULT_SETTINGS } from "./shared/storage-constants";
import {
  MAX_ERRORS,
  STORAGE_KEY,
  type ErrorEntry,
  type NetworkResourceType,
} from "./shared/types";

const PROXY_URL_REJECT = ["localhost", "127.0.0.1", "::1", "0.0.0.0"];
const PRIVATE_HOST_RE = /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/;

const KNOWN_NETWORK_TYPES = new Set<NetworkResourceType>([
  "image",
  "script",
  "stylesheet",
  "font",
  "media",
  "websocket",
  "xmlhttprequest",
  "fetch",
  "other",
]);

function normalizeResourceType(raw: string | undefined): NetworkResourceType {
  if (!raw) return "unknown";
  const lower = raw.toLowerCase();
  if (lower === "xhr") return "xmlhttprequest";
  if (KNOWN_NETWORK_TYPES.has(lower as NetworkResourceType)) {
    return lower as NetworkResourceType;
  }
  return "unknown";
}

let buffer: ErrorEntry[] | null = null;

async function load(): Promise<ErrorEntry[]> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return Array.isArray(stored.errors) ? (stored.errors as ErrorEntry[]) : [];
}

async function getBuffer(): Promise<ErrorEntry[]> {
  if (buffer === null) buffer = await load();
  return buffer;
}

async function persist(next: ErrorEntry[]): Promise<void> {
  buffer = next;
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
}

function validateProxyUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("proxy url must be http(s)");
  }
  return url;
}

function isoNow(): string {
  return new Date().toISOString();
}

function classifyHost(host: string): "public" | "dev" | "intranet" | "unknown" {
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return "dev";
  if (PRIVATE_HOST_RE.test(host)) return "intranet";
  if (host.endsWith(".local")) return "dev";
  return "public";
}

function deriveRoute(url: string): string {
  try {
    const u = new URL(url);
    if (u.hash && u.hash !== "#") return u.hash;
    return u.pathname || "/";
  } catch {
    return "(unknown)";
  }
}

async function pushNetworkError(entry: ErrorEntry): Promise<void> {
  const current = await getBuffer();
  if (current.some((e) => e.hash === entry.hash)) return;
  const next = [...current, entry];
  if (next.length > MAX_ERRORS) next.splice(0, next.length - MAX_ERRORS);
  await persist(next);
}

function installNetworkListeners(): void {
  chrome.webRequest.onResponseStarted.addListener(
    (details) => {
      if (details.tabId === -1) return;
      console.log("[wr.onResponseStarted]", details.statusCode, details.type, details.url);
      const status = details.statusCode;
      if (status < 400) return;
      const resourceType = normalizeResourceType(details.type);
      let host = "unknown";
      try {
        host = new URL(details.url).hostname.toLowerCase();
      } catch {
        // ignore
      }
      const message = `GET ${details.url} → ${status}`.trim();
      const entry: ErrorEntry = {
        hash: `${status}|${details.url}|${Math.floor(Date.now() / 1000)}`,
        level: "error",
        kind: "network",
        message,
        url: details.initiator || details.url,
        timestamp: Date.now(),
        capturedAt: isoNow(),
        pageTitle: "(from webRequest)",
        route: deriveRoute(details.url),
        viewport: "(unknown)",
        tabId: `${host}`,
        frameId: String(details.frameId ?? 0),
        isDev: classifyHost(host),
        appHint: "",
      };
      (entry as ErrorEntry & { resourceType?: NetworkResourceType }).resourceType = resourceType;
      console.log("[wr.onResponseStarted] pushing", entry);
      void pushNetworkError(entry);
    },
    { urls: ["<all_urls>"] },
  );

  chrome.webRequest.onErrorOccurred.addListener(
    (details) => {
      if (details.tabId === -1) return;
      console.log("[wr.onErrorOccurred]", details.type, details.error, details.url);
    },
    { urls: ["<all_urls>"] },
  );
}

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

  chrome.runtime.onInstalled.addListener(async () => {
    const existing = await chrome.storage.local.get(STORAGE_KEY);
    if (!existing[STORAGE_KEY]) {
      await chrome.storage.local.set({ [STORAGE_KEY]: { ...DEFAULT_SETTINGS } });
    }
    await getBuffer();
  });

  installNetworkListeners();

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    const change = changes.settings;
    if (!change) return;
    const next = change.newValue as { apiKey?: string; proxyUrl?: string; appHint?: string } | undefined;
    console.log(
      "[settings]",
      JSON.stringify({
        proxyUrl: next?.proxyUrl ?? null,
        hasApiKey: Boolean(next?.apiKey),
        appHint: next?.appHint ?? null,
      }),
    );
  });

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    const msg = message as { type?: string; payload?: unknown };
    if (msg.type === PAGE_ERROR) {
      const entry = msg.payload as ErrorEntry;
      if (!entry || typeof entry.hash !== "string") return;
      (async () => {
        const current = await getBuffer();
        if (current.some((e) => e.hash === entry.hash)) {
          sendResponse({ ok: true, deduped: true });
          return;
        }
        const settings = await chrome.storage.local.get("settings");
        const appHint = (settings.settings as { appHint?: unknown } | undefined)?.appHint;
        const enriched: ErrorEntry =
          typeof appHint === "string" && appHint ? { ...entry, appHint } : entry;
        const next = [...current, enriched];
        if (next.length > MAX_ERRORS) next.splice(0, next.length - MAX_ERRORS);
        await persist(next);
        sendResponse({ ok: true });
      })();
      return true;
    }
    if (msg.type === ANALYZE) {
      const { prompt } = msg.payload as { prompt?: string };
      if (typeof prompt !== "string") return;
      (async () => {
        try {
          const stored = await chrome.storage.local.get("settings");
          const settings = (stored.settings ?? {}) as { apiKey?: unknown; proxyUrl?: unknown };
          if (typeof settings.apiKey !== "string" || !settings.apiKey) {
            throw new Error("missing api key");
          }
          if (typeof settings.proxyUrl !== "string" || !settings.proxyUrl) {
            throw new Error("missing proxy url");
          }
          const url = validateProxyUrl(settings.proxyUrl);
          if (prompt.length > 8 * 1024) throw new Error("prompt too large");
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-api-key": settings.apiKey,
              "anthropic-version": "2023-06-01",
              "anthropic-dangerous-direct-browser-access": "true",
              "x-extension-origin": chrome.runtime.id,
            },
            body: JSON.stringify({
              model: "claude-3-5-sonnet-latest",
              max_tokens: 1024,
              messages: [{ role: "user", content: prompt }],
            }),
          });
          if (!response.ok) {
            const body = await response.text().catch(() => "");
            throw new Error(`proxy returned ${response.status} ${body.slice(0, 200)}`);
          }
          const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
          const text = Array.isArray(data.content)
            ? data.content
                .filter((b) => b && b.type === "text" && typeof b.text === "string")
                .map((b) => b.text)
                .join("\n")
            : "";
          if (!text) throw new Error("empty proxy response");
          sendResponse({ ok: true, content: text });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : "analyze failed" });
        }
      })();
      return true;
    }
  });
});