export const PAGE_ERROR = "PAGE_ERROR";
export const ANALYZE = "ANALYZE";
export const ANALYZE_TURN = "ANALYZE_TURN";

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