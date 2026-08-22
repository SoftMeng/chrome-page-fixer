import {
  ERROR_EVENT,
  REJECTION_EVENT,
  MESSAGE_KIND,
  MESSAGE_SOURCE,
  type BridgeMessage,
  type EnvKind,
  type ErrorEntry,
  type ErrorKind,
  type ErrorLevel,
} from "./shared/types";
import { PAGE_CONTEXT, INSPECT_ELEMENT, INSPECT_ELEMENT_REPLY, LIST_ELEMENTS, LIST_ELEMENTS_REPLY, CONSOLE_LOG, LIST_RESOURCE_TIMING, LIST_RESOURCE_TIMING_REPLY, GET_COMPUTED_STYLE, GET_COMPUTED_STYLE_REPLY, GET_STORAGE, GET_STORAGE_REPLY, GET_EVENT_LISTENERS, GET_EVENT_LISTENERS_REPLY, GET_PAGE_DOM_HTML, GET_PAGE_DOM_HTML_REPLY, GET_NAVIGATION_TIMING, GET_NAVIGATION_TIMING_REPLY } from "./shared/messaging";
import {
  MAX_LIST_ITEMS,
  MAX_TREE_DEPTH,
  MAX_TREE_NODES,
  MAX_TREE_TEXT,
  MAX_ITEM_TEXT,
} from "./shared/tools/list-elements";

const ATTR_WHITELIST = [
  "id",
  "class",
  "role",
  "type",
  "name",
  "href",
  "disabled",
  "hidden",
  "aria-label",
  "aria-hidden",
  "aria-disabled",
  "data-testid",
  "data-action",
  "data-id",
  "data-state",
];
const MAX_CLASSES = 10;
const ANCESTOR_DEPTH = 3;

const CONSOLE_METHODS: ReadonlyArray<ErrorLevel> = ["error", "warn", "info"];

const INTRA_HOST_RE = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

const NETWORK_REPORT_STATUS = { ok: 0, failure: 500 } as const;

function epochSeconds(d: Date): number {
  return Math.floor(d.getTime() / 1000);
}

function hashEntry(level: ErrorLevel, message: string, url: string, ts: number): string {
  return `${level}|${message}|${url}|${epochSeconds(new Date(ts))}`;
}

function post(entry: ErrorEntry): void {
  const msg: BridgeMessage = { source: MESSAGE_SOURCE, type: MESSAGE_KIND.error, payload: entry };
  try {
    window.postMessage(msg, window.location.origin);
  } catch {
    // postMessage can throw on serialization (e.g. exotic Error subclasses,
    // circular refs). Silently drop — capture must never crash the page.
  }
}

function postConsoleLog(level: string, message: string, stack?: string): void {
  const payload = {
    level,
    message,
    stack: stack?.slice(0, 4000),
    url: window.location.href,
    timestamp: Date.now(),
  };
  try {
    window.postMessage(
      { source: MESSAGE_SOURCE, type: CONSOLE_LOG, payload },
      window.location.origin,
    );
  } catch {
    // serialization failure — drop silently
  }
}

function postResourceTiming(items: Array<{
  name: string;
  initiatorType: string;
  durationMs: number;
  transferSize: number;
  startTime: number;
  responseEnd: number;
}>): void {
  try {
    window.postMessage(
      { source: MESSAGE_SOURCE, type: LIST_RESOURCE_TIMING_REPLY, payload: { items } },
      window.location.origin,
    );
  } catch {
    // serialization failure — drop silently
  }
}

function describeArg(a: unknown): { message: string; stack?: string } {
  if (a instanceof Error) return { message: a.message, stack: a.stack };
  if (typeof a === "string") return { message: a };
  return { message: safeStringify(a) };
}

function classifyHost(host: string): EnvKind {
  if (LOCAL_HOSTS.has(host)) return "dev";
  if (INTRA_HOST_RE.test(host)) return "intranet";
  if (host.endsWith(".local")) return "dev";
  return "public";
}

function deriveRoute(): string {
  const hash = window.location.hash;
  if (hash && hash !== "#") return hash;
  const path = window.location.pathname;
  return path || "/";
}

function buildSelector(el: Element | null): string {
  if (!el) return "";
  const parts: string[] = [];
  let cur: Element | null = el;
  let depth = 0;
  while (cur && depth < 5) {
    const tag = cur.tagName ? cur.tagName.toLowerCase() : "";
    if (!tag) break;
    const id = cur.id ? `#${cur.id}` : "";
    const testid = !id ? cur.getAttribute("data-testid") : null;
    const testidPart = testid ? `[data-testid="${testid}"]` : "";
    const className = typeof cur.className === "string" ? cur.className.trim() : "";
    const classParts = className
      ? className.split(/\s+/).filter(Boolean).slice(0, 2).map((c) => `.${c}`).join("")
      : "";
    parts.unshift(`${tag}${id}${testidPart}${classParts}`);
    cur = cur.parentElement;
    depth += 1;
  }
  return parts.join(" > ");
}

function summarizeElement(el: Element | null): string {
  if (!el) return "";
  const tag = el.tagName ? el.tagName.toLowerCase() : "";
  const attrs = Array.from(el.attributes)
    .filter((a) => ["alt", "title", "class", "id", "data-testid", "role", "href", "src"].includes(a.name))
    .slice(0, 5)
    .map((a) => `${a.name}="${a.value.slice(0, 60)}"`)
    .join(" ");
  const parents: string[] = [];
  let cur = el.parentElement;
  let depth = 0;
  while (cur && depth < 2) {
    const ptag = cur.tagName ? cur.tagName.toLowerCase() : "";
    if (ptag) parents.unshift(ptag);
    cur = cur.parentElement;
    depth += 1;
  }
  const parentPath = parents.join(" > ");
  return parentPath ? `<${tag} ${attrs}> in <${parentPath}>` : `<${tag} ${attrs}>`;
}

function nowIso(): string {
  return new Date().toISOString();
}

interface SharedContext {
  url: string;
  pageTitle: string;
  route: string;
  viewport: string;
  tabId: string;
  frameId: string;
  isDev: EnvKind;
  appHint: string;
  lastTrigger: Element | null;
}

interface TriggerRecord {
  event: string;
  timestamp: number;
  selector: string;
}
const TRIGGER_HISTORY_LIMIT = 100;
const triggerHistory: TriggerRecord[] = [];

function captureLastTrigger(ctx: SharedContext): void {
  const record = (event: Event): void => {
    const target = event.target;
    if (target instanceof Element) {
      ctx.lastTrigger = target;
      const selector = buildSelector(target);
      triggerHistory.push({ event: event.type, timestamp: Date.now(), selector });
      if (triggerHistory.length > TRIGGER_HISTORY_LIMIT) {
        triggerHistory.splice(0, triggerHistory.length - TRIGGER_HISTORY_LIMIT);
      }
    }
  };
  for (const evt of ["click", "submit", "keydown"] as const) {
    document.addEventListener(evt, record, { capture: true, passive: true });
  }
}

function reportNetwork(ctx: SharedContext, kind: ErrorKind, message: string): void {
  let triggerSelector: string | undefined;
  let triggerElement: string | undefined;
  if (ctx.lastTrigger) {
    triggerSelector = buildSelector(ctx.lastTrigger) || undefined;
    triggerElement = summarizeElement(ctx.lastTrigger) || undefined;
  } else {
    try {
      const u = new URL(ctx.lastTrigger === null ? message : ctx.url);
      if (u.origin !== window.location.origin) {
        triggerSelector = "(cross-origin)";
        triggerElement = "(cross-origin)";
      } else {
        triggerSelector = "(unrecorded)";
        triggerElement = "(unrecorded)";
      }
    } catch {
      triggerSelector = "(unrecorded)";
      triggerElement = "(unrecorded)";
    }
  }
  post({
    hash: hashEntry("error", message, ctx.url, Date.now()),
    level: "error",
    kind,
    message,
    url: ctx.url,
    timestamp: Date.now(),
    capturedAt: nowIso(),
    pageTitle: ctx.pageTitle,
    route: ctx.route,
    viewport: ctx.viewport,
    tabId: ctx.tabId,
    frameId: ctx.frameId,
    isDev: ctx.isDev,
    appHint: ctx.appHint,
    focusedSelector: buildSelector(document.activeElement) || undefined,
    triggerSelector,
    triggerElement,
  });
}

function installNetworkMonitor(ctx: SharedContext): void {
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const input = args[0];
    const method = (args[1]?.method ?? "GET").toUpperCase();
    const url = typeof input === "string"
      ? input
      : input instanceof URL
      ? input.toString()
      : input instanceof Request
      ? input.url
      : String(input);
    try {
      const response = await originalFetch(...args);
      if (response.status >= 400) {
        reportNetwork(
          ctx,
          "network",
          `${method} ${url} → ${response.status} ${response.statusText || ""}`.trim(),
        );
      }
      return response;
    } catch (err) {
      const note = err instanceof Error ? err.message : "fetch failed";
      reportNetwork(ctx, "network", `${method} ${url} → network error (${note})`);
      throw err;
    }
  };

  type XHROpen = XMLHttpRequest["open"];
  type XHRSend = XMLHttpRequest["send"];
  const originalOpen: XHROpen = XMLHttpRequest.prototype.open;
  const originalSend: XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patched(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    ...rest: unknown[]
  ): void {
    (this as XMLHttpRequest & { __xhrMethod?: string; __xhrUrl?: string }).__xhrMethod = method.toUpperCase();
    (this as XMLHttpRequest & { __xhrMethod?: string; __xhrUrl?: string }).__xhrUrl = url.toString();
    return originalOpen.apply(this, [method, url, ...rest] as Parameters<XHROpen>);
  };

  XMLHttpRequest.prototype.send = function patched(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null): void {
    this.addEventListener("loadend", () => {
      if (this.status >= 400 || this.status === NETWORK_REPORT_STATUS.failure) {
        const m = (this as XMLHttpRequest & { __xhrMethod?: string }).__xhrMethod ?? "GET";
        const u = (this as XMLHttpRequest & { __xhrUrl?: string }).__xhrUrl ?? location.href;
        reportNetwork(
          ctx,
          "network",
          `${m} ${u} → ${this.status} ${this.statusText || ""}`.trim(),
        );
      }
    });
    return originalSend.call(this, body);
  };
}

export default defineContentScript({
  matches: ["<all_urls>"],
  runAt: "document_start",
  world: "MAIN",
  main() {
    const url = window.location.href;
    const host = window.location.hostname.toLowerCase();
    const isDev = classifyHost(host);
    const pageTitle = document.title || "(untitled)";
    const route = deriveRoute();
    const viewport = `${window.innerWidth}x${window.innerHeight}`;
    const tabId = `${host}:${window.location.port || ""}`;
    const frameId = String(window === window.top ? 0 : 1);
    const appHint = "";
    const ctx: SharedContext = { url, pageTitle, route, viewport, tabId, frameId, isDev, appHint, lastTrigger: null };

    captureLastTrigger(ctx);
    installNetworkMonitor(ctx);
    installPageContextReporter(ctx);

    for (const level of CONSOLE_METHODS) {
      const original = window.console[level].bind(window.console);
      window.console[level] = (...args: unknown[]) => {
        try {
          const described = args.map(describeArg);
          const message = described.map((d) => d.message).join(" ");
          const stack = described.find((d) => d.stack)?.stack ?? new Error().stack;
          post({
            hash: hashEntry(level, message, url, Date.now()),
            level,
            kind: "console",
            message,
            url,
            timestamp: Date.now(),
            capturedAt: nowIso(),
            pageTitle,
            route,
            viewport,
            tabId,
            frameId,
            isDev,
            appHint,
            stack,
          });
          postConsoleLog(level, message, stack);
        } catch {
          // capture must not throw; original behaviour still runs below
        }
        original(...args);
      };
    }

    window.addEventListener(ERROR_EVENT, (event) => {
      const e = event as ErrorEvent;
      if (e.target && e.target !== window) {
        const target = e.target as Element;
        const tag = target.tagName ? target.tagName.toLowerCase() : "unknown";
        const src = "src" in target && typeof (target as HTMLScriptElement).src === "string"
          ? (target as HTMLScriptElement).src
          : "href" in target && typeof (target as HTMLLinkElement).href === "string"
          ? (target as HTMLLinkElement).href
          : location.href;
        const focused = buildSelector(document.activeElement);
        post({
          hash: hashEntry("error", `resource error: ${tag} src=${src}`, url, Date.now()),
          level: "error",
          kind: "resource-load",
          message: `resource error: ${tag} src=${src}`,
          url,
          timestamp: Date.now(),
          capturedAt: nowIso(),
          pageTitle,
          route,
          viewport,
          tabId,
          frameId,
          isDev,
          appHint,
          selector: buildSelector(target),
          elementSummary: summarizeElement(target),
          source: e.filename,
          line: e.lineno,
          column: e.colno,
          focusedSelector: focused || undefined,
        });
        return;
      }
      const focused = buildSelector(document.activeElement);
      post({
        hash: hashEntry("error", e.message || "uncaught error", url, Date.now()),
        level: "error",
        kind: "uncaught",
        message: e.message || "uncaught error",
        url,
        timestamp: Date.now(),
        capturedAt: nowIso(),
        pageTitle,
        route,
        viewport,
        tabId,
          frameId,
          isDev,
          appHint,
          stack: e.error instanceof Error ? e.error.stack : undefined,
          source: e.filename,
          line: e.lineno,
          column: e.colno,
          focusedSelector: focused || undefined,
      });
    });

    window.addEventListener(REJECTION_EVENT, (event) => {
      const reason = event.reason;
      const message = reason instanceof Error ? reason.message : safeStringify(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      const focused = buildSelector(document.activeElement);
      post({
        hash: hashEntry("error", message || "unhandled rejection", url, Date.now()),
        level: "error",
        kind: "unhandledrejection",
        message: message || "unhandled rejection",
        url,
        timestamp: Date.now(),
        capturedAt: nowIso(),
        pageTitle,
        route,
        viewport,
        tabId,
          frameId,
          isDev,
          appHint,
        stack,
        focusedSelector: focused || undefined,
      });
    });

    window.addEventListener("message", (event) => {
      if (event.source !== window) return;
      const data = event.data as { source?: string; type?: string; payload?: { selector?: string; requestId?: string; limit?: number; depth?: number; mode?: string; properties?: string[]; scope?: string; eventTypes?: string[]; maxLength?: number } } | undefined;
      if (!data || data.source !== MESSAGE_SOURCE) return;
      if (data.type === INSPECT_ELEMENT) {
        const payload = data.payload;
        if (!payload || typeof payload.selector !== "string" || typeof payload.requestId !== "string") return;
        const result = inspectElement(payload.selector);
        try {
          window.postMessage(
            {
              source: MESSAGE_SOURCE,
              type: INSPECT_ELEMENT_REPLY,
              payload: { requestId: payload.requestId, result },
            },
            window.location.origin,
          );
        } catch {
          // serialization failure — drop silently
        }
        return;
      }
      if (data.type === LIST_ELEMENTS) {
        const payload = data.payload;
        if (!payload || typeof payload.requestId !== "string") return;
        const result = listElements(payload.selector, payload.limit, payload.depth, payload.mode);
        try {
          window.postMessage(
            {
              source: MESSAGE_SOURCE,
              type: LIST_ELEMENTS_REPLY,
              payload: { requestId: payload.requestId, result },
            },
            window.location.origin,
          );
        } catch {
          // serialization failure — drop silently
        }
        return;
      }
      if (data.type === LIST_RESOURCE_TIMING) {
        const payload = data.payload;
        if (!payload || typeof payload.requestId !== "string") return;
        const items = readResourceTiming();
        postResourceTiming(items);
        return;
      }
      if (data.type === GET_NAVIGATION_TIMING) {
        const payload = data.payload;
        if (!payload || typeof payload.requestId !== "string") return;
        const result = readNavigationTiming();
        try {
          window.postMessage(
            {
              source: MESSAGE_SOURCE,
              type: GET_NAVIGATION_TIMING_REPLY,
              payload: { requestId: payload.requestId, result },
            },
            window.location.origin,
          );
        } catch {
          // serialization failure — drop silently
        }
        return;
      }
      if (data.type === GET_COMPUTED_STYLE) {
        const payload = data.payload;
        if (!payload || typeof payload.requestId !== "string" || typeof payload.selector !== "string") return;
        const result = readComputedStyle(payload.selector, payload.properties);
        try {
          window.postMessage(
            {
              source: MESSAGE_SOURCE,
              type: GET_COMPUTED_STYLE_REPLY,
              payload: { requestId: payload.requestId, result },
            },
            window.location.origin,
          );
        } catch {
          // serialization failure — drop silently
        }
        return;
      }
      if (data.type === GET_STORAGE) {
        const payload = data.payload;
        if (!payload || typeof payload.requestId !== "string") return;
        const result = readStorage(payload.scope, payload.properties);
        try {
          window.postMessage(
            {
              source: MESSAGE_SOURCE,
              type: GET_STORAGE_REPLY,
              payload: { requestId: payload.requestId, result },
            },
            window.location.origin,
          );
        } catch {
          // serialization failure — drop silently
        }
        return;
      }
      if (data.type === GET_EVENT_LISTENERS) {
        const payload = data.payload;
        if (!payload || typeof payload.requestId !== "string" || typeof payload.selector !== "string") return;
        const result = readEventListeners(payload.selector, payload.eventTypes);
        try {
          window.postMessage(
            {
              source: MESSAGE_SOURCE,
              type: GET_EVENT_LISTENERS_REPLY,
              payload: { requestId: payload.requestId, result },
            },
            window.location.origin,
          );
        } catch {
          // serialization failure — drop silently
        }
        return;
      }
      if (data.type === GET_PAGE_DOM_HTML) {
        const payload = data.payload;
        if (!payload || typeof payload.requestId !== "string") return;
        const result = readPageDomHtml(payload.maxLength);
        try {
          window.postMessage(
            {
              source: MESSAGE_SOURCE,
              type: GET_PAGE_DOM_HTML_REPLY,
              payload: { requestId: payload.requestId, result },
            },
            window.location.origin,
          );
        } catch {
          // serialization failure — drop silently
        }
        return;
      }
    });
  },
});

function pickAttributes(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ATTR_WHITELIST) {
    if (el.hasAttribute(name)) {
      const v = el.getAttribute(name);
      if (typeof v === "string") out[name] = v.slice(0, 120);
    }
  }
  return out;
}

function inspectElement(selector: string): {
  selector: string;
  found: boolean;
  tag?: string;
  id?: string;
  classes?: string[];
  attributes?: Record<string, string>;
  rect?: { x: number; y: number; w: number; h: number };
  visible?: boolean;
  ancestorSelector?: string;
  error?: string;
} {
  let el: Element | null;
  try {
    el = document.querySelector(selector);
  } catch (err) {
    return { selector, found: false, error: err instanceof Error ? err.message : "invalid selector" };
  }
  if (!el) return { selector, found: false };

  const rect = el.getBoundingClientRect();
  const className = typeof el.className === "string" ? el.className : "";
  const classes = className
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_CLASSES);

  return {
    selector,
    found: true,
    tag: el.tagName ? el.tagName.toLowerCase() : undefined,
    id: el.id || undefined,
    classes,
    attributes: pickAttributes(el),
    rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
    visible: el instanceof HTMLElement ? el.offsetParent !== null : el.getClientRects().length > 0,
    ancestorSelector: summarizeAncestor(el),
  };
}

function summarizeAncestor(el: Element): string {
  const parts: string[] = [];
  let cur: Element | null = el.parentElement;
  let n = 0;
  while (cur && n < ANCESTOR_DEPTH) {
    const tag = cur.tagName ? cur.tagName.toLowerCase() : "";
    if (!tag) break;
    const id = cur.id ? `#${cur.id}` : "";
    parts.unshift(`${tag}${id}`);
    cur = cur.parentElement;
    n += 1;
  }
  return parts.join(" > ");
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function postPageContext(): void {
  const payload = {
    url: window.location.href,
    title: document.title || "(untitled)",
    route: deriveRoute(),
  };
  try {
    window.postMessage(
      { source: MESSAGE_SOURCE, type: PAGE_CONTEXT, payload },
      window.location.origin,
    );
  } catch {
    // serialization failure — drop silently
  }
}

function installPageContextReporter(_ctx: SharedContext): void {
  postPageContext();
  window.addEventListener("hashchange", postPageContext, { passive: true });
  const origPush = history.pushState;
  const origReplace = history.replaceState;
  history.pushState = function (...args: Parameters<typeof origPush>): void {
    origPush.apply(this, args);
    postPageContext();
  };
  history.replaceState = function (...args: Parameters<typeof origReplace>): void {
    origReplace.apply(this, args);
    postPageContext();
  };
  window.addEventListener("popstate", postPageContext, { passive: true });
}

const MAX_TIMING_ITEMS = 50;

interface ResourceTimingItem {
  name: string;
  initiatorType: string;
  durationMs: number;
  transferSize: number;
  startTime: number;
  responseEnd: number;
}

function readResourceTiming(): ResourceTimingItem[] {
  const entries = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
  return entries.slice(-MAX_TIMING_ITEMS).map((e) => ({
    name: e.name,
    initiatorType: e.initiatorType,
    durationMs: Math.round(e.duration),
    transferSize: e.transferSize,
    startTime: Math.round(e.startTime),
    responseEnd: Math.round(e.responseEnd),
  }));
}

function readNavigationTiming(): {
  available: true;
  url: string;
  duration: number;
  domInteractive: number;
  domContentLoaded: number;
  loadComplete: number;
  ttfb: number;
  redirect: number;
  dns: number;
  tcp: number;
  tls: number;
  serverResponse: number;
  fcp: number | null;
  note?: string;
} | {
  available: false;
  error: string;
} {
  const navEntries = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
  const nav = navEntries[0];
  if (!nav) {
    return { available: false, error: "no navigation entries" };
  }
  const fcpEntries = performance.getEntriesByName("first-contentful-paint") as PerformanceEntry[];
  const fcp = fcpEntries[0] ? Math.round(fcpEntries[0].startTime) : null;
  const transferHidden = nav.transferSize === 0 && nav.decodedBodySize === 0 && nav.encodedBodySize > 0;
  const tlsRaw = nav.secureConnectionStart > 0
    ? nav.connectEnd - nav.secureConnectionStart
    : 0;
  return {
    available: true,
    url: nav.name,
    duration: Math.round(nav.duration),
    domInteractive: Math.round(nav.domInteractive - nav.startTime),
    domContentLoaded: Math.round(nav.domContentLoadedEventEnd - nav.startTime),
    loadComplete: Math.round(nav.loadEventEnd - nav.startTime),
    ttfb: Math.round(nav.responseStart - nav.requestStart),
    redirect: Math.round(nav.redirectEnd - nav.redirectStart),
    dns: Math.round(nav.domainLookupEnd - nav.domainLookupStart),
    tcp: Math.round(nav.connectEnd - nav.connectStart),
    tls: Math.max(0, Math.round(tlsRaw)),
    serverResponse: Math.round(nav.responseEnd - nav.responseStart),
    fcp,
    note: transferHidden ? "cross-origin, transfer sizes hidden" : undefined,
  };
}

const DEFAULT_STYLE_PROPS = [
  "display",
  "visibility",
  "opacity",
  "position",
  "z-index",
  "width",
  "height",
  "padding",
  "margin",
  "color",
  "background-color",
  "font-size",
];
const MAX_STYLE_PROPS = 10;

function readComputedStyle(
  selector: string,
  rawProperties: string[] | undefined,
): { selector: string; found: boolean; styles: Record<string, string>; error?: string } {
  let el: Element | null;
  try {
    el = document.querySelector(selector);
  } catch (err) {
    return {
      selector,
      found: false,
      styles: {},
      error: err instanceof Error ? err.message : "invalid selector",
    };
  }
  if (!el) return { selector, found: false, styles: {} };
  const wanted = Array.isArray(rawProperties) && rawProperties.length > 0
    ? rawProperties.slice(0, MAX_STYLE_PROPS)
    : DEFAULT_STYLE_PROPS;
  const computed = window.getComputedStyle(el);
  const styles: Record<string, string> = {};
  for (const prop of wanted) {
    const value = computed.getPropertyValue(prop);
    if (typeof value === "string") styles[prop] = value.slice(0, 200);
  }
  return { selector, found: true, styles };
}

const STORAGE_REDACTED = "***";
const STORAGE_MAX_KEYS = 50;
const STORAGE_MAX_VALUE = 200;

function readStorage(
  rawScope: string | undefined,
  rawProperties: string[] | undefined,
): {
  scope: "local" | "session";
  totalKeys: number;
  includedKeys: number;
  redactedKeys: number;
  entries: Array<{ key: string; value: string }>;
} {
  const scope: "local" | "session" = rawScope === "session" ? "session" : "local";
  const storage = scope === "session" ? window.sessionStorage : window.localStorage;
  const whitelist = Array.isArray(rawProperties) ? new Set(rawProperties) : null;
  const entries: Array<{ key: string; value: string }> = [];
  let totalKeys = 0;
  let includedKeys = 0;
  let redactedKeys = 0;
  for (let i = 0; i < storage.length && entries.length < STORAGE_MAX_KEYS; i += 1) {
    const key = storage.key(i);
    if (!key) continue;
    totalKeys += 1;
    const raw = storage.getItem(key);
    if (raw == null) continue;
    const isIncluded = whitelist ? whitelist.has(key) : false;
    if (isIncluded) {
      includedKeys += 1;
      entries.push({ key, value: raw.slice(0, STORAGE_MAX_VALUE) });
    } else {
      redactedKeys += 1;
      entries.push({ key, value: STORAGE_REDACTED });
    }
  }
  return { scope, totalKeys, includedKeys, redactedKeys, entries };
}

const EVENT_LISTENER_INLINE_PREFIXES = [
  "onclick",
  "ondblclick",
  "onmousedown",
  "onmouseup",
  "onmousemove",
  "onkeydown",
  "onkeyup",
  "onkeypress",
  "onfocus",
  "onblur",
  "onchange",
  "oninput",
  "onsubmit",
  "onreset",
  "onselect",
  "onload",
  "onerror",
];
const EVENT_LISTENER_INLINE_LIMIT = 400;

function readEventListeners(
  selector: string,
  rawEventTypes: string[] | undefined,
): {
  selector: string;
  found: boolean;
  inline: Array<{ event: string; handler: string }>;
  capturedTriggers: Array<{ event: string; timestamp: number }>;
  limitations: string[];
  error?: string;
} {
  let el: Element | null;
  try {
    el = document.querySelector(selector);
  } catch (err) {
    return {
      selector,
      found: false,
      inline: [],
      capturedTriggers: [],
      limitations: [],
      error: err instanceof Error ? err.message : "invalid selector",
    };
  }
  if (!el) {
    return {
      selector,
      found: false,
      inline: [],
      capturedTriggers: [],
      limitations: [],
    };
  }

  const filter = new Set((rawEventTypes ?? []).map((t) => t.toLowerCase()));
  const inline: Array<{ event: string; handler: string }> = [];
  const attrs = el.attributes;
  for (let i = 0; i < attrs.length; i += 1) {
    const attr = attrs.item(i);
    if (!attr) continue;
    const name = attr.name.toLowerCase();
    if (!EVENT_LISTENER_INLINE_PREFIXES.includes(name)) continue;
    const eventName = name.slice(2);
    if (filter.size > 0 && !filter.has(eventName)) continue;
    inline.push({ event: eventName, handler: attr.value.slice(0, EVENT_LISTENER_INLINE_LIMIT) });
  }

  const capturedTriggers: Array<{ event: string; timestamp: number }> = [];
  for (const rec of triggerHistory) {
    if (rec.selector !== selector) continue;
    if (filter.size > 0 && !filter.has(rec.event)) continue;
    capturedTriggers.push({ event: rec.event, timestamp: rec.timestamp });
  }

  const limitations = [
    "只能识别 inline on* 属性（<button onclick=...>），不能读 addEventListener 绑定的事件",
    "capturedTriggers 仅记录 Content Script 安装后捕获的事件，无法回溯历史",
    "React/Vue 等虚拟事件系统通过合成事件派发，本 Tool 看不到原生 handler",
  ];

  return { selector, found: true, inline, capturedTriggers, limitations };
}

const HTML_DEFAULT_MAX = 8000;
const HTML_HARD_MAX = 30000;

function readPageDomHtml(
  rawMax: number | undefined,
): { url: string; totalLength: number; truncated: boolean; html: string; note: string } {
  const max =
    typeof rawMax === "number" && rawMax >= 1
      ? Math.min(Math.floor(rawMax), HTML_HARD_MAX)
      : HTML_DEFAULT_MAX;
  const raw = document.documentElement.outerHTML;
  const totalLength = raw.length;
  const html = raw.length > max ? raw.slice(0, max) : raw;
  return {
    url: window.location.href,
    totalLength,
    truncated: raw.length > max,
    html,
    note: "运行时 DOM 序列化结果，不是源代码 / 编译产物原始字节。可能含用户输入 / token / 表单 value。",
  };
}

function listElements(
  selector: string | undefined,
  rawLimit: number | undefined,
  rawDepth: number | undefined,
  rawMode: string | undefined,
): {
  selector: string;
  total: number;
  returned: number;
  truncated: boolean;
  mode: "flat" | "tree";
  depth: number;
  items: Array<{
    tag: string;
    id?: string;
    classes?: string[];
    text?: string;
    rect: { x: number; y: number; w: number; h: number };
    visible: boolean;
  }>;
  tree?: Array<{
    tag: string;
    id?: string;
    classes?: string[];
    text?: string;
    children: Array<{
      tag: string;
      id?: string;
      classes?: string[];
      text?: string;
      children: unknown[];
    }>;
  }>;
  error?: string;
} {
  const mode: "flat" | "tree" = rawMode === "tree" ? "tree" : "flat";

  if (mode === "tree") {
    const depth =
      typeof rawDepth === "number" && rawDepth >= 1
        ? Math.min(Math.floor(rawDepth), MAX_TREE_DEPTH)
        : 4;
    const root: Element | null = selector ? safeQuery(selector) : document.body;
    if (!root) {
      return {
        selector: selector ?? "",
        total: 0,
        returned: 0,
        truncated: false,
        mode: "tree",
        depth,
        items: [],
        error: "root not found",
      };
    }
    let counter = 0;
    let truncated = false;
    const tree = buildTree(root as Element, depth, () => {
      counter += 1;
      if (counter > MAX_TREE_NODES) {
        truncated = true;
        return false;
      }
      return true;
    });
    return {
      selector: selector ?? "",
      total: counter,
      returned: counter,
      truncated,
      mode: "tree",
      depth,
      items: [],
      tree: tree ? [tree] : [],
    };
  }

  const limit =
    typeof rawLimit === "number" && rawLimit >= 1
      ? Math.min(Math.floor(rawLimit), MAX_LIST_ITEMS)
      : 20;
  const effectiveSelector = selector && selector.length > 0 ? selector : "body *";
  let all: NodeListOf<Element>;
  try {
    all = document.querySelectorAll(effectiveSelector);
  } catch (err) {
    return {
      selector: effectiveSelector,
      total: 0,
      returned: 0,
      truncated: false,
      mode: "flat",
      depth: 1,
      items: [],
      error: err instanceof Error ? err.message : "invalid selector",
    };
  }
  const total = all.length;
  const take = Math.min(total, limit);
  const items = Array.from(all)
    .slice(0, take)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const className = typeof el.className === "string" ? el.className : "";
      const text = (el.textContent ?? "").trim().slice(0, MAX_ITEM_TEXT);
      return {
        tag: el.tagName ? el.tagName.toLowerCase() : "",
        id: el.id || undefined,
        classes: className.split(/\s+/).filter(Boolean).slice(0, 4),
        text: text || undefined,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        },
        visible: el instanceof HTMLElement ? el.offsetParent !== null : el.getClientRects().length > 0,
      };
    });
  return {
    selector: effectiveSelector,
    total,
    returned: items.length,
    truncated: total > take,
    mode: "flat",
    depth: 1,
    items,
  };
}

function safeQuery(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function buildTree(
  el: Element,
  maxDepth: number,
  budget: () => boolean,
): {
  tag: string;
  id?: string;
  classes?: string[];
  text?: string;
  children: Array<{
    tag: string;
    id?: string;
    classes?: string[];
    text?: string;
    children: unknown[];
  }>;
} | null {
  if (!budget()) return null;
  const tag = el.tagName ? el.tagName.toLowerCase() : "";
  const className = typeof el.className === "string" ? el.className : "";
  const text = (el.textContent ?? "").trim().slice(0, MAX_TREE_TEXT);
  const node: {
    tag: string;
    id?: string;
    classes?: string[];
    text?: string;
    children: Array<{
      tag: string;
      id?: string;
      classes?: string[];
      text?: string;
      children: unknown[];
    }>;
  } = {
    tag,
    id: el.id || undefined,
    classes: className.split(/\s+/).filter(Boolean).slice(0, 4),
    text: text || undefined,
    children: [],
  };
  if (maxDepth <= 1) return node;
  for (const child of Array.from(el.children)) {
    if (!budget()) break;
    const built = buildTree(child, maxDepth - 1, budget);
    if (built) node.children.push(built);
  }
  return node;
}