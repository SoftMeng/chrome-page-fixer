export interface NetworkEntry {
  url: string;
  method: string;
  status: number;
  kind: "resource-load" | "network";
  durationMs: number;
  timestamp: number;
  initiator?: string;
}

const MAX_ENTRIES = 100;
const buffer: NetworkEntry[] = [];

export function recordNetworkEntry(entry: NetworkEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
}

export function readNetworkEntries(): NetworkEntry[] {
  return buffer.slice();
}

export function clearNetworkBuffer(): void {
  buffer.length = 0;
}