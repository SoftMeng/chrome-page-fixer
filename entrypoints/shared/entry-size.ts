import type { ErrorEntry } from "./types";

const MAX_ENTRY_BYTES = 8 * 1024;
const TRUNCATABLE_KEYS = [
  "message",
  "stack",
  "responseData",
  "requestBody",
  "focusedSelector",
  "triggerElement",
  "elementSummary",
] as const;

function byteSize(s: string): number {
  return new TextEncoder().encode(s).length;
}

export function entryBytes(entry: ErrorEntry): number {
  try {
    return byteSize(JSON.stringify(entry));
  } catch {
    return Infinity;
  }
}

export function clampEntry(entry: ErrorEntry): ErrorEntry {
  let out = entry;
  let guard = 0;
  while (entryBytes(out) > MAX_ENTRY_BYTES && guard < TRUNCATABLE_KEYS.length) {
    const key = TRUNCATABLE_KEYS[guard] as keyof ErrorEntry;
    const value = out[key];
    if (typeof value === "string" && value.length > 100) {
      out = {
        ...out,
        [key]: value.slice(0, Math.floor(value.length / 2)) + `<truncated:${key}>`,
      };
    }
    guard += 1;
  }
  return out;
}
