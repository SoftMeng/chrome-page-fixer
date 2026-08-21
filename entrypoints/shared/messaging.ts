export const PAGE_ERROR = "PAGE_ERROR";
export const ANALYZE = "ANALYZE";

export interface AnalyzeRequest {
  prompt: string;
}

export interface AnalyzeResponse {
  ok: boolean;
  content?: string;
  error?: string;
}