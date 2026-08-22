export interface GetPageDomHtmlInput {
  maxLength?: number;
}

export interface GetPageDomHtmlResult {
  url: string;
  totalLength: number;
  truncated: boolean;
  html: string;
  note: string;
}

export const DEFAULT_MAX_LENGTH = 8000;
export const MAX_MAX_LENGTH = 30000;