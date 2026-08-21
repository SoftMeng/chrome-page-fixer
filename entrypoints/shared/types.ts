export const MESSAGE_SOURCE = "chrome-page-fixer";

export const MESSAGE_KIND = {
  error: "error",
} as const;

export const ERROR_EVENT = "error";
export const REJECTION_EVENT = "unhandledrejection";

export const CAPTURER_VERSION = "0.1.0";

export type ErrorLevel = "info" | "warn" | "error";

export type ErrorKind =
  | "console"
  | "uncaught"
  | "unhandledrejection"
  | "resource-load"
  | "network";

export type NetworkResourceType =
  | "image"
  | "script"
  | "stylesheet"
  | "font"
  | "media"
  | "websocket"
  | "xmlhttprequest"
  | "fetch"
  | "other"
  | "unknown";

export type EnvKind = "public" | "dev" | "intranet" | "unknown";

export interface ErrorEntry {
  hash: string;
  level: ErrorLevel;
  kind: ErrorKind;
  message: string;
  url: string;
  timestamp: number;
  capturedAt: string;
  pageTitle: string;
  route: string;
  viewport: string;
  tabId: string;
  frameId: string;
  isDev: EnvKind;
  focusedSelector?: string;
  selector?: string;
  elementSummary?: string;
  appHint?: string;
  stack?: string;
  source?: string;
  line?: number;
  column?: number;
  resourceType?: NetworkResourceType;
}

export interface BridgeMessage<T = ErrorEntry> {
  source: typeof MESSAGE_SOURCE;
  type: typeof MESSAGE_KIND.error;
  payload: T;
}

export const STORAGE_KEY = "errors";
export const MAX_ERRORS = 200;

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  refs: string[];
  timestamp: number;
}

export interface ChatSession {
  id: string;
  createdAt: number;
  updatedAt: number;
  messages: ChatMessage[];
  refs: string[];
}

export const CHAT_STORAGE_KEY = "chat_sessions";
export const MAX_SESSIONS = 50;
export const MAX_MESSAGES_PER_SESSION = 100;