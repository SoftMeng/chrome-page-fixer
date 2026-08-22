export interface ResourceTimingItem {
  name: string;
  initiatorType: string;
  durationMs: number;
  transferSize: number;
  startTime: number;
  responseEnd: number;
}

export interface GetResourceTimingInput {
  type?: string;
  limit?: number;
}

export interface GetResourceTimingResult {
  items: ResourceTimingItem[];
}