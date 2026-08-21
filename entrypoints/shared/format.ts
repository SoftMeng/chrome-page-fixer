import { CAPTURER_VERSION, type ErrorEntry } from "./types";

const CONTROL_CODES: number[] = [
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0c, 0x0e, 0x0f,
  0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x7f,
];
const CONTROL_SET = new Set(CONTROL_CODES.map((c) => String.fromCharCode(c)));

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function sanitize(s: string): string {
  let out = "";
  for (const ch of s) out += CONTROL_SET.has(ch) ? "" : ch;
  return out;
}

function formatSource(e: ErrorEntry): string {
  if (e.source) {
    return e.source + (e.line !== undefined ? `:${e.line}` : "") +
      (e.column !== undefined ? `:${e.column}` : "");
  }
  if (e.kind === "resource-load") return "(resource-only)";
  return "(none)";
}

export function toMarkdown(entry: ErrorEntry): string {
  const head = `### ${entry.kind} ${entry.level} @ ${formatTime(entry.timestamp)}`;
  const body = sanitize(entry.message);
  const url = sanitize(entry.url);
  const lines: string[] = [head, body, url];
  if (entry.source) {
    const loc = entry.source + (entry.line !== undefined ? `:${entry.line}` : "") +
      (entry.column !== undefined ? `:${entry.column}` : "");
    lines.push(sanitize(loc));
  }
  if (entry.stack) lines.push("```\n" + sanitize(entry.stack) + "\n```");
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
      `[ERROR #${idx + 1}] kind=${e.kind} level=${e.level} at=${e.capturedAt}`,
    );
    if (e.resourceType) {
      lines.push(`  resource-type: ${e.resourceType}`);
    }
    lines.push(`  selector: ${e.selector || "(none)"}`);
    lines.push(`  element: ${e.elementSummary || "(none)"}`);
    lines.push(`  message: \`\`\`\n${sanitize(e.message)}\n\`\`\``);
    lines.push(`  source: ${formatSource(e)}`);
    lines.push(`  stack: \`\`\`\n${e.stack ? sanitize(e.stack) : "(none)"}\n\`\`\``);
    lines.push(`  focused: ${e.focusedSelector || "(none)"}`);
    if (idx < sorted.length - 1) lines.push("");
  });

  lines.push("");
  lines.push("请基于以上错误分析根因并给出最小修复建议。");
  return lines.join("\n");
}

export function toPrompt(entries: ErrorEntry[]): string {
  return toReport(entries);
}