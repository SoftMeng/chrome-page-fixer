import type { NetworkEntry } from "../network-buffer";

export interface GetNetworkLogInput {
  kind?: "resource-load" | "network";
  minStatus?: number;
  limit?: number;
  sinceMs?: number;
}

export interface GetNetworkLogResult {
  entries: NetworkEntry[];
}