import type { ErrorEntry } from "../types";

export interface SearchErrorsInput {
  query: string;
  limit?: number;
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;
const MAX_QUERY = 64;

export function searchErrors(
  buffer: ErrorEntry[],
  raw: SearchErrorsInput,
): ErrorEntry[] {
  const q = (raw.query ?? "").slice(0, MAX_QUERY).trim().toLowerCase();
  if (!q) return [];
  const limit = clampLimit(raw.limit);
  const out: ErrorEntry[] = [];
  for (let i = buffer.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const e = buffer[i];
    if (!e) continue;
    if (matches(e, q)) out.push(e);
  }
  return out;
}

function matches(e: ErrorEntry, q: string): boolean {
  if (e.message.toLowerCase().includes(q)) return true;
  if (e.elementSummary && e.elementSummary.toLowerCase().includes(q)) return true;
  if (e.selector && e.selector.toLowerCase().includes(q)) return true;
  return false;
}

function clampLimit(n: number | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_LIMIT;
  const v = Math.floor(n);
  if (v < 1) return 1;
  if (v > MAX_LIMIT) return MAX_LIMIT;
  return v;
}