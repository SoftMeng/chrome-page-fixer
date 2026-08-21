import {
  ANALYZE,
  ANALYZE_TURN,
  PAGE_ERROR,
  type AnalyzeTurnRequest,
  type AnalyzeTurnResponse,
} from "./shared/messaging";
import { buildChatMessages } from "./shared/chat-prompt";
import { SYSTEM_PROMPT } from "./shared/system-prompt";
import { getSettings } from "./shared/storage";
import { TOOLS } from "./shared/tool-schema";
import { TOOL_REGISTRY, type ToolContext, type ToolResult } from "./shared/tool-registry";
import { ensureIndexNumbers } from "./shared/error-index";
import { INSPECT_ELEMENT, INSPECT_ELEMENT_REPLY } from "./shared/messaging";
import type { InspectElementInput, InspectElementResult } from "./shared/tools/inspect-element";
import {
  MAX_ERRORS,
  STORAGE_KEY,
  type ErrorEntry,
  type NetworkResourceType,
} from "./shared/types";

const TOOL_LOOP_MAX_ROUNDS = 5;
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
  content: string | ContentBlock[];
}

type ContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
  | { type: "tool_result"; tool_use_id: string; content: string };

interface AnthropicResponse {
  content: ContentBlock[];
  stop_reason: "end_turn" | "tool_use" | "max_tokens" | "stop_sequence" | string | null;
}

async function runAnthropicRequest(
  apiKey: string,
  url: URL,
  messages: AnthropicMessage[],
  system: string = SYSTEM_PROMPT,
  tools: typeof TOOLS | null = null,
): Promise<AnthropicResponse> {
  const body: Record<string, unknown> = {
    model: "claude-3-5-sonnet-latest",
    max_tokens: 1024,
    system,
    messages,
  };
  if (tools) body.tools = tools;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "x-extension-origin": chrome.runtime.id,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`proxy returned ${response.status} ${body.slice(0, 200)}`);
  }
  const data = (await response.json()) as { content?: ContentBlock[]; stop_reason?: string };
  const content = Array.isArray(data.content) ? data.content : [];
  return { content, stop_reason: data.stop_reason ?? "end_turn" };
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
  });
});

async function runAnalyzeTurn(req: AnalyzeTurnRequest): Promise<AnalyzeTurnResponse> {
  try {
    const settings = await getSettings();
    if (!settings.apiKey) throw new Error("missing api key");
    if (!settings.proxyUrl) throw new Error("missing proxy url");
    const url = validateProxyUrl(settings.proxyUrl);

    const allErrors = await getBuffer();
    const lookup = new Map(allErrors.map((e) => [e.hash, e]));
    const refs = req.refs
      .filter((h) => typeof h === "string")
      .map((h) => lookup.get(h))
      .filter((e): e is ErrorEntry => Boolean(e));

    const messages = buildChatMessages(
      req.history.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        refs: m.refs,
        timestamp: m.timestamp,
      })),
      refs,
      req.userContent,
      { maxHistoryTurns: 12, maxPromptChars: 6 * 1024 },
    );

    const ctx = await buildToolContext(refs.map((e) => e.hash));
    const text = await runAgentWithTools(settings.apiKey, url, messages, ctx);
    return { ok: true, content: text };
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
    inspectElement: (input: InspectElementInput) => callInspectElement(input.selector),
  };
}

async function runAgentWithTools(
  apiKey: string,
  url: URL,
  initialMessages: AnthropicMessage[],
  ctx: ToolContext,
): Promise<string> {
  const messages: AnthropicMessage[] = [...initialMessages];
  let finalText = "";

  for (let round = 0; round < TOOL_LOOP_MAX_ROUNDS; round += 1) {
    const resp = await runAnthropicRequest(apiKey, url, messages, SYSTEM_PROMPT, TOOLS);

    if (resp.stop_reason === "tool_use") {
      const toolUseBlocks = resp.content.filter(
        (b): b is Extract<ContentBlock, { type: "tool_use" }> => b.type === "tool_use",
      );
      const toolResults: ContentBlock[] = toolUseBlocks.map((use) => {
        const def = TOOL_REGISTRY[use.name];
        const payload = def ? def.run(ctx, use.input ?? {}) : null;
        return {
          type: "tool_result",
          tool_use_id: use.id,
          content: serializeToolResult(payload),
        };
      });
      messages.push({ role: "assistant", content: resp.content });
      messages.push({ role: "user", content: toolResults });
      continue;
    }

    finalText = resp.content
      .filter((b): b is Extract<ContentBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    break;
  }

  if (!finalText) {
    finalText = "[agent reached tool loop limit without final answer]";
  }
  return finalText;
}

function serializeToolResult(value: ToolResult): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}