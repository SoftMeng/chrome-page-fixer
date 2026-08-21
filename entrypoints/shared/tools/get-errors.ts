import type { ErrorEntry, ErrorKind, ErrorLevel } from "../types";

export interface GetErrorsInput {
  kind?: ErrorKind;
  level?: ErrorLevel;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function getErrors(
  buffer: ErrorEntry[],
  raw: GetErrorsInput,
): ErrorEntry[] {
  const limit = clampLimit(raw.limit);
  const out: ErrorEntry[] = [];
  for (let i = buffer.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const e = buffer[i];
    if (!e) continue;
    if (raw.kind && e.kind !== raw.kind) continue;
    if (raw.level && e.level !== raw.level) continue;
    out.push(e);
  }
  return out;
}

function clampLimit(n: number | undefined): number {
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_LIMIT;
  const v = Math.floor(n);
  if (v < 1) return 1;
  if (v > MAX_LIMIT) return MAX_LIMIT;
  return v;
}