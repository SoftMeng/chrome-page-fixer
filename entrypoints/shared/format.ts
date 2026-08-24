import { CAPTURER_VERSION, type ErrorEntry } from "./types";

const CONTROL_CODES: number[] = [
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0c, 0x0e, 0x0f,
  0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x7f,
];
const CONTROL_SET = new Set(CONTROL_CODES.map((c) => String.fromCharCode(c)));

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function formatRelativeTime(ts: number, now: number = Date.now()): string {
  const diff = now - ts;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

function sanitize(s: string): string {
  let out = "";
  for (const ch of s) out += CONTROL_SET.has(ch) ? "" : ch;
  return out;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

const FOCUSED_MAX = 80;
const MESSAGE_MAX = 600;

export function toMarkdown(entry: ErrorEntry): string {
  const head = `[ERROR #1] ${entry.kind} level=${entry.level} at=${entry.capturedAt}`;
  const lines: string[] = [head];
  lines.push(`Page URL: ${sanitize(entry.url)}`);
  lines.push(`Message: ${truncate(sanitize(entry.message), MESSAGE_MAX)}`);
  if (entry.endpointUrl) {
    const m = entry.httpMethod ?? "?";
    lines.push(`Request: ${m} ${sanitize(entry.endpointUrl)}`);
  }
  if (entry.httpStatus !== undefined || entry.responseData) {
    const status = entry.httpStatus ?? "?";
    const body = entry.responseData ? ` ${sanitize(entry.responseData)}` : "";
    lines.push(`Response: ${status}${body}`);
  }
  if (entry.focusedSelector) {
    lines.push(`focused: ${truncate(sanitize(entry.focusedSelector), FOCUSED_MAX)}`);
  }
  if (entry.stack) {
    lines.push("```\n" + sanitize(entry.stack) + "\n```");
  }
  return lines.join("\n");
}

export function toReport(entries: ErrorEntry[]): string {
  const sorted = [...entries].sort((a, b) => b.timestamp - a.timestamp);
  const head = sorted[0];
  const title = head ? head.pageTitle : "(no errors)";
  const url = head ? head.url : "(none)";
  const route = head ? head.route : "(none)";
  const viewport = head ? head.viewport : "(none)";
  const tabId = head ? head.tabId : "(none)";
  const frameId = head ? head.frameId : "(none)";
  const isDev = head ? head.isDev : "unknown";
  const appHint = head?.appHint?.trim() ? head.appHint : "";

  const lines: string[] = [
    `=== CHROME PAGE FIXER REPORT v${CAPTURER_VERSION} ===`,
    `Captured-at: ${new Date().toISOString()}`,
    `Page: ${title} | ${url}`,
    `Route: ${route}`,
    `Browser: ${viewport} | tab=${tabId} frame=${frameId}`,
    `Env: ${isDev}`,
    `App-hint: ${appHint || "(none)"}`,
    `Errors: ${sorted.length}`,
    `=== END HEADERS ===`,
    "",
  ];

  sorted.forEach((e, idx) => {
    lines.push(
      `[ERROR #${idx + 1}] ${e.kind} level=${e.level} at=${e.capturedAt}`,
    );
    lines.push(`Page URL: ${sanitize(e.url)}`);
    lines.push(`Message: ${truncate(sanitize(e.message), MESSAGE_MAX)}`);
    if (e.endpointUrl) {
      const m = e.httpMethod ?? "?";
      lines.push(`Request: ${m} ${sanitize(e.endpointUrl)}`);
    }
    if (e.httpStatus !== undefined || e.responseData) {
      const status = e.httpStatus ?? "?";
      const body = e.responseData ? ` ${sanitize(e.responseData)}` : "";
      lines.push(`Response: ${status}${body}`);
    }
    if (e.focusedSelector) {
      lines.push(`focused: ${truncate(sanitize(e.focusedSelector), FOCUSED_MAX)}`);
    }
    if (e.stack) {
      lines.push("```\n" + sanitize(e.stack) + "\n```");
    }
    if (idx < sorted.length - 1) lines.push("");
  });

  return lines.join("\n");
}

export function toPrompt(entries: ErrorEntry[]): string {
  return toReport(entries);
}