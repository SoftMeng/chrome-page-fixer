export const REDACTED = "***";

const SENSITIVE_KEYS = new Set([
  "token",
  "access_token",
  "refresh_token",
  "id_token",
  "authorization",
  "cookie",
  "set-cookie",
  "password",
  "pwd",
  "passwd",
  "secret",
  "apikey",
  "api_key",
]);

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.has(key.toLowerCase())) return REDACTED;
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = redactValue(k, v);
    }
    return out;
  }
  return value;
}

export function redactBody(body: unknown): string {
  if (body == null) return "";
  if (typeof body === "string") return body;
  if (body instanceof FormData) return "<FormData>";
  if (body instanceof Blob) return `<Blob ${body.size}B>`;
  if (body instanceof URLSearchParams) return body.toString();
  if (typeof body !== "object") return String(body);
  try {
    const redacted = redactValue("", body);
    return JSON.stringify(redacted);
  } catch {
    return "<unserialisable>";
  }
}

const RESPONSE_PREVIEW_MAX = 500;
const BODY_PREVIEW_MAX = 2000;

export function previewResponse(data: unknown): string {
  if (data == null) return "";
  if (typeof data === "string") {
    return data.length > RESPONSE_PREVIEW_MAX
      ? data.slice(0, RESPONSE_PREVIEW_MAX) + "…"
      : data;
  }
  try {
    const s = JSON.stringify(data);
    return s.length > RESPONSE_PREVIEW_MAX
      ? s.slice(0, RESPONSE_PREVIEW_MAX) + "…"
      : s;
  } catch {
    return "<unserialisable>";
  }
}

export function previewRequest(body: unknown): string {
  const redacted = redactBody(body);
  if (redacted.length > BODY_PREVIEW_MAX) {
    return redacted.slice(0, BODY_PREVIEW_MAX) + "…";
  }
  return redacted;
}
