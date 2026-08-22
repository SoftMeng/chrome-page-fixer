export interface GetEventListenersInput {
  selector: string;
  eventTypes?: string[];
}

export interface InlineHandler {
  event: string;
  handler: string;
}

export interface CapturedTrigger {
  event: string;
  timestamp: number;
}

export interface GetEventListenersResult {
  selector: string;
  found: boolean;
  inline: InlineHandler[];
  capturedTriggers: CapturedTrigger[];
  limitations: string[];
  error?: string;
}

export const INLINE_EVENT_PREFIXES = [
  "on",
];

export const CAPTURED_EVENT_NAMES = [
  "click",
  "submit",
  "keydown",
] as const;