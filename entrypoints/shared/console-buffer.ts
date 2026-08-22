export type ConsoleLevel = "log" | "info" | "warn" | "error";

export interface ConsoleEntry {
  level: ConsoleLevel;
  message: string;
  url: string;
  timestamp: number;
  stack?: string;
  source?: { file: string; line: number; column: number };
}

const MAX_ENTRIES = 100;
const buffer: ConsoleEntry[] = [];

export function recordConsoleEntry(entry: ConsoleEntry): void {
  buffer.push(entry);
  if (buffer.length > MAX_ENTRIES) buffer.splice(0, buffer.length - MAX_ENTRIES);
}

export function readConsoleEntries(): ConsoleEntry[] {
  return buffer.slice();
}

export function clearConsoleBuffer(): void {
  buffer.length = 0;
}