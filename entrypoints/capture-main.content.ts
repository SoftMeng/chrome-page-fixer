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
  window.postMessage(msg, window.location.origin);
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
}

function reportNetwork(ctx: SharedContext, kind: ErrorKind, message: string): void {
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
    const ctx: SharedContext = { url, pageTitle, route, viewport, tabId, frameId, isDev, appHint };

    installNetworkMonitor(ctx);

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
  },
});

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}