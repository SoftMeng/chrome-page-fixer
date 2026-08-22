import { CAPTURER_VERSION, type ErrorEntry } from "./types";
import type { ChatMessage } from "./types";

const CONTROL_CODES: number[] = [
  0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x0b, 0x0c, 0x0e, 0x0f,
  0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x7f,
];
const CONTROL_SET = new Set(CONTROL_CODES.map((c) => String.fromCharCode(c)));

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

export function envelopeForRefs(refs: ErrorEntry[]): string {
  if (refs.length === 0) return "";
  const first = refs[0];
  const head = first
    ? `${first.pageTitle} | ${first.url}`
    : "(unknown)";
  const lines: string[] = [
    `=== CHROME PAGE FIXER REPORT v${CAPTURER_VERSION} ===`,
    `Captured-at: ${new Date().toISOString()}`,
    `Page: ${head}`,
    `Route: ${first ? first.route : "(none)"}`,
    `Browser: ${first ? `${first.viewport} | tab=${first.tabId} frame=${first.frameId}` : "(none)"}`,
    `Env: ${first ? first.isDev : "unknown"}`,
    `App-hint: ${first?.appHint?.trim() ? first.appHint : "(none)"}`,
    `Errors: ${refs.length}`,
    `=== END HEADERS ===`,
    "",
  ];
  refs.forEach((e, idx) => {
    lines.push(`[ERROR #${idx + 1}] kind=${e.kind} level=${e.level} at=${e.capturedAt}`);
    if (e.resourceType) lines.push(`  resource-type: ${e.resourceType}`);
    lines.push(`  selector: ${e.selector || "(none)"}`);
    lines.push(`  element: ${e.elementSummary || "(none)"}`);
    lines.push(`  message: \`\`\`\n${sanitize(e.message)}\n\`\`\``);
    lines.push(`  source: ${formatSource(e)}`);
    lines.push(`  stack: \`\`\`\n${e.stack ? sanitize(e.stack) : "(none)"}\n\`\`\``);
    lines.push(`  focused: ${e.focusedSelector || "(none)"}`);
    if (idx < refs.length - 1) lines.push("");
  });
  return lines.join("\n");
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : "0".repeat(n - s.length) + s;
}

function trim(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n... (truncated)`;
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export function buildChatMessages(
  history: ChatMessage[],
  refs: ErrorEntry[],
  userContent: string,
  options: { maxHistoryTurns: number; maxPromptChars: number },
): AnthropicMessage[] {
  const messages: AnthropicMessage[] = [];

  const envelope = envelopeForRefs(refs);
  if (envelope) messages.push({ role: "user", content: envelope });

  const priorTurns = history.filter((m) => m.role === "user" || m.role === "assistant");
  const start = Math.max(0, priorTurns.length - options.maxHistoryTurns);
  for (const m of priorTurns.slice(start)) {
    messages.push({ role: m.role, content: m.content });
  }

  messages.push({ role: "user", content: trim(userContent, options.maxPromptChars) });
  return messages;
}