export const PAGE_ERROR = "PAGE_ERROR";
export const PAGE_CONTEXT = "PAGE_CONTEXT";
export const ANALYZE = "ANALYZE";
export const ANALYZE_TURN = "ANALYZE_TURN";
export const INSPECT_ELEMENT = "INSPECT_ELEMENT";
export const INSPECT_ELEMENT_REPLY = "INSPECT_ELEMENT_REPLY";
export const LIST_ELEMENTS = "LIST_ELEMENTS";
export const LIST_ELEMENTS_REPLY = "LIST_ELEMENTS_REPLY";
export const CONSOLE_LOG = "CONSOLE_LOG";
export const CONSOLE_LOG_RECEIVED = "CONSOLE_LOG_RECEIVED";
export const GET_COMPUTED_STYLE = "GET_COMPUTED_STYLE";
export const GET_COMPUTED_STYLE_REPLY = "GET_COMPUTED_STYLE_REPLY";
export const GET_STORAGE = "GET_STORAGE";
export const GET_STORAGE_REPLY = "GET_STORAGE_REPLY";
export const GET_EVENT_LISTENERS = "GET_EVENT_LISTENERS";
export const GET_EVENT_LISTENERS_REPLY = "GET_EVENT_LISTENERS_REPLY";
export const GET_PAGE_DOM_HTML = "GET_PAGE_DOM_HTML";
export const GET_PAGE_DOM_HTML_REPLY = "GET_PAGE_DOM_HTML_REPLY";
export const LIST_RESOURCE_TIMING = "LIST_RESOURCE_TIMING";
export const LIST_RESOURCE_TIMING_REPLY = "LIST_RESOURCE_TIMING_REPLY";
export const GET_NAVIGATION_TIMING = "GET_NAVIGATION_TIMING";
export const GET_NAVIGATION_TIMING_REPLY = "GET_NAVIGATION_TIMING_REPLY";

export interface PageContextMessage {
  url: string;
  title: string;
  route: string;
}

export interface AnalyzeRequest {
  prompt: string;
}

export interface AnalyzeResponse {
  ok: boolean;
  content?: string;
  error?: string;
}

export interface AnalyzeTurnRequest {
  sessionId: string;
  userContent: string;
  refs: string[];
  history: Array<{
    id: string;
    role: "user" | "assistant";
    content: string;
    refs: string[];
    timestamp: number;
  }>;
}

export interface AnalyzeTurnResponse {
  ok: boolean;
  content?: string;
  error?: string;
}