import type { ConsoleEntry, ConsoleLevel } from "../console-buffer";

export interface GetConsoleMessagesInput {
  level?: ConsoleLevel | "all";
  limit?: number;
  sinceMs?: number;
}

export interface GetConsoleMessagesResult {
  entries: ConsoleEntry[];
}