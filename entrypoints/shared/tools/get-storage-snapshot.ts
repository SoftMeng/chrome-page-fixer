export type StorageScope = "local" | "session";

export interface GetStorageSnapshotInput {
  scope?: StorageScope;
  properties?: string[];
}

export interface StorageEntry {
  key: string;
  value: string;
}

export interface GetStorageSnapshotResult {
  scope: StorageScope;
  totalKeys: number;
  includedKeys: number;
  redactedKeys: number;
  entries: StorageEntry[];
  error?: string;
}

export const MAX_STORAGE_KEYS = 50;
export const MAX_STORAGE_VALUE = 200;

export const REDACTED = "***";