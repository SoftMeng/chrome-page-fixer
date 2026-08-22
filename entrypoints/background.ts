import {
  ANALYZE,
  ANALYZE_TURN,
  CONSOLE_LOG_RECEIVED,
  LIST_ELEMENTS_REPLY,
  PAGE_CONTEXT,
  PAGE_ERROR,
  type AnalyzeTurnRequest,
  type AnalyzeTurnResponse,
} from "./shared/messaging";
import { SYSTEM_PROMPT } from "./shared/system-prompt";
import { getSettings } from "./shared/storage";
import { ensureIndexNumbers } from "./shared/error-index";
import {
  INSPECT_ELEMENT,
  INSPECT_ELEMENT_REPLY,
  LIST_ELEMENTS,
  LIST_RESOURCE_TIMING,
  LIST_RESOURCE_TIMING_REPLY,
  GET_NAVIGATION_TIMING,
  GET_NAVIGATION_TIMING_REPLY,
  GET_COMPUTED_STYLE,
  GET_COMPUTED_STYLE_REPLY,
  GET_STORAGE,
  GET_STORAGE_REPLY,
  GET_EVENT_LISTENERS,
  GET_EVENT_LISTENERS_REPLY,
  GET_PAGE_DOM_HTML,
  GET_PAGE_DOM_HTML_REPLY,
} from "./shared/messaging";
import type { InspectElementResult } from "./shared/tools/inspect-element";
import type { ListElementsResult } from "./shared/tools/list-elements";
import { runAgentWithTools } from "./agent/run";
import { createAgentProvider } from "./agent/provider";
import type { ToolContext } from "./agent/tools";
import {
  getPageContext,
  recordPageContext,
} from "./shared/page-tracker";
import { recordConsoleEntry } from "./shared/console-buffer";
import type { ConsoleLevel } from "./shared/console-buffer";
import { recordNetworkEntry } from "./shared/network-buffer";
import {
  MAX_ERRORS,
  STORAGE_KEY,
  type ErrorEntry,
  type NetworkResourceType,
} from "./shared/types";

const INSPECT_TIMEOUT_MS = 1000;

interface PendingInspect {
  resolve: (value: InspectElementResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingInspects = new Map<string, PendingInspect>();

function genRequestId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function callInspectElement(selector: string): Promise<InspectElementResult> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== "number") {
    return { selector, found: false, error: "no active tab" };
  }
  const requestId = genRequestId();
  return new Promise<InspectElementResult>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingInspects.delete(requestId);
      resolve({ selector, found: false, error: "inspect timeout" });
    }, INSPECT_TIMEOUT_MS);
    pendingInspects.set(requestId, { resolve, reject, timer });
    chrome.tabs
      .sendMessage(tab.id as number, { type: INSPECT_ELEMENT, payload: { selector, requestId } })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err.message : "sendMessage failed";
        const p = pendingInspects.get(requestId);
        if (p) {
          clearTimeout(p.timer);
          pendingInspects.delete(requestId);
          resolve({ selector, found: false, error: e });
        }
      });
  });
}

interface PendingList {
  resolve: (value: ListElementsResult) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingLists = new Map<string, PendingList>();

interface ResourceTimingItem {
  name: string;
  initiatorType: string;
  durationMs: number;
  transferSize: number;
  startTime: number;
  responseEnd: number;
}
interface PendingTiming {
  resolve: (value: ResourceTimingItem[]) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingTimings = new Map<string, PendingTiming>();

type NavigationTimingResult = import("./shared/tools/get-navigation-timing").NavigationTimingResult;
interface PendingNavigationTiming {
  resolve: (value: NavigationTimingResult) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingNavTimings = new Map<string, PendingNavigationTiming>();

interface GetComputedStyleResult {
  selector: string;
  found: boolean;
  styles: Record<string, string>;
  error?: string;
}
interface PendingStyle {
  resolve: (value: GetComputedStyleResult) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingStyles = new Map<string, PendingStyle>();

interface GetStorageSnapshotResult {
  scope: "local" | "session";
  totalKeys: number;
  includedKeys: number;
  redactedKeys: number;
  entries: Array<{ key: string; value: string }>;
  error?: string;
}
interface PendingStorage {
  resolve: (value: GetStorageSnapshotResult) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingStorages = new Map<string, PendingStorage>();

interface GetEventListenersResult {
  selector: string;
  found: boolean;
  inline: Array<{ event: string; handler: string }>;
  capturedTriggers: Array<{ event: string; timestamp: number }>;
  limitations: string[];
  error?: string;
}
interface PendingEventListeners {
  resolve: (value: GetEventListenersResult) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingEventListeners = new Map<string, PendingEventListeners>();

interface GetPageDomHtmlResult {
  url: string;
  totalLength: number;
  truncated: boolean;
  html: string;
  note: string;
  error?: string;
}
interface PendingPageDomHtml {
  resolve: (value: GetPageDomHtmlResult) => void;
  timer: ReturnType<typeof setTimeout>;
}
const pendingPageDomHtmls = new Map<string, PendingPageDomHtml>();

async function callGetPageDomHtml(
  maxLength: number | undefined,
): Promise<GetPageDomHtmlResult> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== "number") {
    return {
      url: "",
      totalLength: 0,
      truncated: false,
      html: "",
      note: "",
      error: "no active tab",
    };
  }
  const requestId = genRequestId();
  return new Promise<GetPageDomHtmlResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingPageDomHtmls.delete(requestId);
      resolve({ url: "", totalLength: 0, truncated: false, html: "", note: "", error: "dom html timeout" });
    }, INSPECT_TIMEOUT_MS);
    pendingPageDomHtmls.set(requestId, { resolve, timer });
    chrome.tabs
      .sendMessage(tab.id as number, { type: GET_PAGE_DOM_HTML, payload: { requestId, maxLength } })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err.message : "sendMessage failed";
        const p = pendingPageDomHtmls.get(requestId);
        if (p) {
          clearTimeout(p.timer);
          pendingPageDomHtmls.delete(requestId);
          resolve({ url: "", totalLength: 0, truncated: false, html: "", note: "", error: e });
        }
      });
  });
}

async function callGetEventListeners(
  selector: string,
  eventTypes: string[] | undefined,
): Promise<GetEventListenersResult> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== "number") {
    return { selector, found: false, inline: [], capturedTriggers: [], limitations: [], error: "no active tab" };
  }
  const requestId = genRequestId();
  return new Promise<GetEventListenersResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingEventListeners.delete(requestId);
      resolve({ selector, found: false, inline: [], capturedTriggers: [], limitations: [], error: "event listeners timeout" });
    }, INSPECT_TIMEOUT_MS);
    pendingEventListeners.set(requestId, { resolve, timer });
    chrome.tabs
      .sendMessage(tab.id as number, { type: GET_EVENT_LISTENERS, payload: { selector, requestId, eventTypes } })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err.message : "sendMessage failed";
        const p = pendingEventListeners.get(requestId);
        if (p) {
          clearTimeout(p.timer);
          pendingEventListeners.delete(requestId);
          resolve({ selector, found: false, inline: [], capturedTriggers: [], limitations: [], error: e });
        }
      });
  });
}

async function callGetStorage(
  scope: "local" | "session" | undefined,
  properties: string[] | undefined,
): Promise<GetStorageSnapshotResult> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== "number") {
    return { scope: scope ?? "local", totalKeys: 0, includedKeys: 0, redactedKeys: 0, entries: [] };
  }
  const requestId = genRequestId();
  return new Promise<GetStorageSnapshotResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingStorages.delete(requestId);
      resolve({ scope: scope ?? "local", totalKeys: 0, includedKeys: 0, redactedKeys: 0, entries: [], error: "storage timeout" });
    }, INSPECT_TIMEOUT_MS);
    pendingStorages.set(requestId, { resolve, timer });
    chrome.tabs
      .sendMessage(tab.id as number, { type: GET_STORAGE, payload: { requestId, scope, properties } })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err.message : "sendMessage failed";
        const p = pendingStorages.get(requestId);
        if (p) {
          clearTimeout(p.timer);
          pendingStorages.delete(requestId);
          resolve({ scope: scope ?? "local", totalKeys: 0, includedKeys: 0, redactedKeys: 0, entries: [], error: e } as GetStorageSnapshotResult);
        }
      });
  });
}

async function callGetComputedStyle(
  selector: string,
  properties?: string[],
): Promise<GetComputedStyleResult> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== "number") {
    return { selector, found: false, styles: {}, error: "no active tab" };
  }
  const requestId = genRequestId();
  return new Promise<GetComputedStyleResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingStyles.delete(requestId);
      resolve({ selector, found: false, styles: {}, error: "style timeout" });
    }, INSPECT_TIMEOUT_MS);
    pendingStyles.set(requestId, { resolve, timer });
    chrome.tabs
      .sendMessage(tab.id as number, { type: GET_COMPUTED_STYLE, payload: { selector, requestId, properties } })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err.message : "sendMessage failed";
        const p = pendingStyles.get(requestId);
        if (p) {
          clearTimeout(p.timer);
          pendingStyles.delete(requestId);
          resolve({ selector, found: false, styles: {}, error: e });
        }
      });
  });
}

async function callListResourceTiming(): Promise<ResourceTimingItem[]> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== "number") return [];
  const requestId = genRequestId();
  return new Promise<ResourceTimingItem[]>((resolve) => {
    const timer = setTimeout(() => {
      pendingTimings.delete(requestId);
      resolve([]);
    }, INSPECT_TIMEOUT_MS);
    pendingTimings.set(requestId, { resolve, timer });
    chrome.tabs
      .sendMessage(tab.id as number, { type: LIST_RESOURCE_TIMING, payload: { requestId } })
      .catch(() => {
        const p = pendingTimings.get(requestId);
        if (p) {
          clearTimeout(p.timer);
          pendingTimings.delete(requestId);
          resolve([]);
        }
      });
  });
}

async function callGetNavigationTiming(): Promise<NavigationTimingResult> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== "number") {
    return { available: false, error: "no active tab" };
  }
  const requestId = genRequestId();
  return new Promise<NavigationTimingResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingNavTimings.delete(requestId);
      resolve({ available: false, error: "timeout" });
    }, INSPECT_TIMEOUT_MS);
    pendingNavTimings.set(requestId, { resolve, timer });
    chrome.tabs
      .sendMessage(tab.id as number, { type: GET_NAVIGATION_TIMING, payload: { requestId } })
      .catch(() => {
        const p = pendingNavTimings.get(requestId);
        if (p) {
          clearTimeout(p.timer);
          pendingNavTimings.delete(requestId);
          resolve({ available: false, error: "send failed" });
        }
      });
  });
}

async function callListElements(
  selector: string | undefined,
  limit?: number,
  depth?: number,
  mode?: "flat" | "tree",
): Promise<ListElementsResult> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab || typeof tab.id !== "number") {
    return { selector: selector ?? "", total: 0, returned: 0, truncated: false, mode: "flat", depth: 1, items: [], error: "no active tab" };
  }
  const requestId = genRequestId();
  const effectiveMode: "flat" | "tree" = mode ?? "flat";
  const effectiveDepth = depth ?? 1;
  return new Promise<ListElementsResult>((resolve) => {
    const timer = setTimeout(() => {
      pendingLists.delete(requestId);
      resolve({ selector: selector ?? "", total: 0, returned: 0, truncated: false, mode: effectiveMode, depth: effectiveDepth, items: [], error: "list timeout" });
    }, INSPECT_TIMEOUT_MS);
    pendingLists.set(requestId, { resolve, timer });
    chrome.tabs
      .sendMessage(tab.id as number, { type: LIST_ELEMENTS, payload: { selector, requestId, limit, depth, mode } })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err.message : "sendMessage failed";
        const p = pendingLists.get(requestId);
        if (p) {
          clearTimeout(p.timer);
          pendingLists.delete(requestId);
          resolve({ selector: selector ?? "", total: 0, returned: 0, truncated: false, mode: effectiveMode, depth: effectiveDepth, items: [], error: e });
        }
      });
  });
}

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

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

async function runAnthropicRequest(
  apiKey: string,
  url: URL,
  messages: AnthropicMessage[],
  system: string = SYSTEM_PROMPT,
): Promise<string> {
  const { model } = createAgentProvider(url.toString(), apiKey);
  const { generateText } = await import("ai");
  const result = await generateText({ model, system, messages });
  return result.text;
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

async function enrichFromTabContext(entry: ErrorEntry, tabId: number): Promise<void> {
  const ctx = getPageContext(tabId);
  if (!ctx) return;
  const current = await getBuffer();
  const idx = current.findIndex((e) => e.hash === entry.hash);
  if (idx === -1) return;
  const target = current[idx];
  if (!target) return;
  const enriched: ErrorEntry = {
    ...target,
    url: ctx.url,
    pageTitle: ctx.title,
    route: ctx.route,
  };
  const next = [...current];
  next[idx] = enriched;
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
      void pushNetworkError(entry).then(() => enrichFromTabContext(entry, details.tabId));
      recordNetworkEntry({
        url: details.url,
        method: details.method,
        status,
        kind: "network",
        durationMs: details.timeStamp ? Math.max(0, Date.now() - details.timeStamp) : 0,
        timestamp: Date.now(),
        initiator: details.initiator || undefined,
      });
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
          const settings = await getSettings();
          if (!settings.apiKey) throw new Error("missing api key");
          if (!settings.proxyUrl) throw new Error("missing proxy url");
          const url = validateProxyUrl(settings.proxyUrl);
          if (prompt.length > 8 * 1024) throw new Error("prompt too large");
          const text = await runAnthropicRequest(settings.apiKey, url, [
            { role: "user", content: prompt },
          ]);
          sendResponse({ ok: true, content: text });
        } catch (err) {
          sendResponse({ ok: false, error: err instanceof Error ? err.message : "analyze failed" });
        }
      })();
      return true;
    }
    if (msg.type === ANALYZE_TURN) {
      const payload = msg.payload as AnalyzeTurnRequest | undefined;
      if (!payload || typeof payload !== "object") return;
      if (typeof payload.sessionId !== "string") return;
      if (typeof payload.userContent !== "string") return;
      if (!Array.isArray(payload.refs)) return;
      if (!Array.isArray(payload.history)) return;
      (async () => {
        const response: AnalyzeTurnResponse = await runAnalyzeTurn(payload);
        sendResponse(response);
      })();
      return true;
    }
    if (msg.type === INSPECT_ELEMENT_REPLY) {
      const payload = msg.payload as { requestId?: string; result?: InspectElementResult } | undefined;
      if (!payload || typeof payload.requestId !== "string") return;
      const p = pendingInspects.get(payload.requestId);
      if (p) {
        clearTimeout(p.timer);
        pendingInspects.delete(payload.requestId);
        const result = payload.result && typeof payload.result === "object"
          ? payload.result
          : { selector: "", found: false, error: "bad result" };
        p.resolve(result);
      }
      return false;
    }
    if (msg.type === LIST_ELEMENTS_REPLY) {
      const payload = msg.payload as { requestId?: string; result?: ListElementsResult } | undefined;
      if (!payload || typeof payload.requestId !== "string") return;
      const p = pendingLists.get(payload.requestId);
      if (p) {
        clearTimeout(p.timer);
        pendingLists.delete(payload.requestId);
        const result = payload.result && typeof payload.result === "object"
          ? payload.result
          : { selector: "", total: 0, returned: 0, truncated: false, mode: "flat" as const, depth: 1, items: [], error: "bad result" };
        p.resolve(result);
      }
      return false;
    }
    if (msg.type === CONSOLE_LOG_RECEIVED) {
      const payload = msg.payload as { level?: string; message?: string; url?: string; timestamp?: number; stack?: string } | undefined;
      if (!payload || typeof payload.level !== "string" || typeof payload.message !== "string" || typeof payload.timestamp !== "number" || typeof payload.url !== "string") return;
      recordConsoleEntry({
        level: payload.level as ConsoleLevel,
        message: payload.message,
        url: payload.url,
        timestamp: payload.timestamp,
        stack: typeof payload.stack === "string" ? payload.stack : undefined,
      });
      return false;
    }
    if (msg.type === LIST_RESOURCE_TIMING_REPLY) {
      const payload = msg.payload as { requestId?: string; items?: unknown } | undefined;
      if (!payload || typeof payload.requestId !== "string") return;
      const p = pendingTimings.get(payload.requestId);
      if (p) {
        clearTimeout(p.timer);
        pendingTimings.delete(payload.requestId);
        const items = Array.isArray(payload.items) ? payload.items : [];
        p.resolve(items as ResourceTimingItem[]);
      }
      return false;
    }
    if (msg.type === GET_NAVIGATION_TIMING_REPLY) {
      const payload = msg.payload as { requestId?: string; result?: NavigationTimingResult } | undefined;
      if (!payload || typeof payload.requestId !== "string") return;
      const p = pendingNavTimings.get(payload.requestId);
      if (p) {
        clearTimeout(p.timer);
        pendingNavTimings.delete(payload.requestId);
        const result = payload.result && typeof payload.result === "object"
          ? payload.result
          : { available: false as const, error: "bad result" };
        p.resolve(result);
      }
      return false;
    }
    if (msg.type === GET_COMPUTED_STYLE_REPLY) {
      const payload = msg.payload as { requestId?: string; result?: GetComputedStyleResult } | undefined;
      if (!payload || typeof payload.requestId !== "string") return;
      const p = pendingStyles.get(payload.requestId);
      if (p) {
        clearTimeout(p.timer);
        pendingStyles.delete(payload.requestId);
        const result = payload.result && typeof payload.result === "object"
          ? payload.result
          : { selector: "", found: false, styles: {}, error: "bad result" };
        p.resolve(result);
      }
      return false;
    }
    if (msg.type === GET_STORAGE_REPLY) {
      const payload = msg.payload as { requestId?: string; result?: GetStorageSnapshotResult } | undefined;
      if (!payload || typeof payload.requestId !== "string") return;
      const p = pendingStorages.get(payload.requestId);
      if (p) {
        clearTimeout(p.timer);
        pendingStorages.delete(payload.requestId);
        const result = payload.result && typeof payload.result === "object"
          ? payload.result
          : { scope: "local" as const, totalKeys: 0, includedKeys: 0, redactedKeys: 0, entries: [], error: "bad result" };
        p.resolve(result);
      }
      return false;
    }
    if (msg.type === GET_EVENT_LISTENERS_REPLY) {
      const payload = msg.payload as { requestId?: string; result?: GetEventListenersResult } | undefined;
      if (!payload || typeof payload.requestId !== "string") return;
      const p = pendingEventListeners.get(payload.requestId);
      if (p) {
        clearTimeout(p.timer);
        pendingEventListeners.delete(payload.requestId);
        const result = payload.result && typeof payload.result === "object"
          ? payload.result
          : { selector: "", found: false, inline: [], capturedTriggers: [], limitations: [], error: "bad result" };
        p.resolve(result);
      }
      return false;
    }
    if (msg.type === GET_PAGE_DOM_HTML_REPLY) {
      const payload = msg.payload as { requestId?: string; result?: GetPageDomHtmlResult } | undefined;
      if (!payload || typeof payload.requestId !== "string") return;
      const p = pendingPageDomHtmls.get(payload.requestId);
      if (p) {
        clearTimeout(p.timer);
        pendingPageDomHtmls.delete(payload.requestId);
        const result = payload.result && typeof payload.result === "object"
          ? payload.result
          : { url: "", totalLength: 0, truncated: false, html: "", note: "", error: "bad result" };
        p.resolve(result);
      }
      return false;
    }
    if (msg.type === PAGE_CONTEXT) {
      const payload = msg.payload as { url?: string; title?: string; route?: string } | undefined;
      const tabId = _sender?.tab?.id;
      if (typeof tabId === "number" && payload && typeof payload.url === "string" && typeof payload.title === "string" && typeof payload.route === "string") {
        recordPageContext(tabId, { url: payload.url, title: payload.title, route: payload.route });
      }
      return false;
    }
  });
});

async function runAnalyzeTurn(req: AnalyzeTurnRequest): Promise<AnalyzeTurnResponse> {
  try {
    const settings = await getSettings();
    if (!settings.apiKey) throw new Error("missing api key");
    if (!settings.proxyUrl) throw new Error("missing proxy url");
    validateProxyUrl(settings.proxyUrl);

    const allErrors = await getBuffer();
    const lookup = new Map(allErrors.map((e) => [e.hash, e]));
    const refs = req.refs
      .filter((h) => typeof h === "string")
      .map((h) => lookup.get(h))
      .filter((e): e is ErrorEntry => Boolean(e));

    const ctx = await buildToolContext(refs.map((e) => e.hash));
    const outcome = await runAgentWithTools({
      proxyUrl: settings.proxyUrl,
      apiKey: settings.apiKey,
      system: SYSTEM_PROMPT,
      history: req.history.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        refs: m.refs,
        timestamp: m.timestamp,
      })),
      userContent: req.userContent,
      refs,
      ctx,
      maxSteps: 5,
    });
    if (!outcome.ok) return { ok: false, error: outcome.error };
    return { ok: true, content: outcome.content };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "analyze failed" };
  }
}

async function buildToolContext(refHashes: string[]): Promise<ToolContext> {
  const allErrors = await getBuffer();
  const ensured = await ensureIndexNumbers(refHashes);
  return {
    buffer: allErrors,
    hashToNumber: ensured,
    inspectElement: (input) => callInspectElement(input.selector),
    listElements: (input) =>
      callListElements(input.selector, input.limit, input.depth, input.mode),
    getComputedStyle: (input) => callGetComputedStyle(input.selector, input.properties),
    getStorage: (input) => callGetStorage(input.scope, input.properties),
    getEventListeners: (input) => callGetEventListeners(input.selector, input.eventTypes),
    getPageDomHtml: (input) => callGetPageDomHtml(input.maxLength),
    readResourceTiming: () => callListResourceTiming(),
    getNavigationTiming: () => callGetNavigationTiming(),
  };
}

function serializeToolResult(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}