import type { ErrorEntry } from "../types";

export function getErrorByIndex(
  buffer: ErrorEntry[],
  hashToNumber: Map<string, number>,
  index: number,
): ErrorEntry | null {
  if (!Number.isFinite(index) || index < 1) return null;
  for (const [hash, num] of hashToNumber) {
    if (num === index) {
      const entry = buffer.find((e) => e.hash === hash);
      return entry ?? null;
    }
  }
  return null;
}