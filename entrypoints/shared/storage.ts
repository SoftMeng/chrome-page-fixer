import { DEFAULT_SETTINGS } from "./storage-constants";

export interface Settings {
  apiKey?: string;
  proxyUrl?: string;
  appHint?: string;
}

const STORAGE_KEY = "settings";

export async function getSettings(): Promise<Settings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const value = stored[STORAGE_KEY];
  let apiKey: string | undefined;
  let proxyUrl: string | undefined;
  if (value && typeof value === "object") {
    const v = value as Partial<Settings>;
    if (typeof v.apiKey === "string") apiKey = v.apiKey;
    if (typeof v.proxyUrl === "string" && safeUrl(v.proxyUrl)) proxyUrl = v.proxyUrl;
  }
  const appHint =
    value && typeof value === "object" && typeof (value as Partial<Settings>).appHint === "string"
      ? (value as Partial<Settings>).appHint
      : undefined;
  return {
    apiKey: apiKey ?? DEFAULT_SETTINGS.apiKey,
    proxyUrl: proxyUrl ?? DEFAULT_SETTINGS.proxyUrl,
    appHint,
  };
}

export async function setSettings(partial: Partial<Settings>): Promise<void> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  const current =
    stored[STORAGE_KEY] && typeof stored[STORAGE_KEY] === "object"
      ? (stored[STORAGE_KEY] as Settings)
      : {};
  const next: Settings = { ...current };
  for (const key of ["apiKey", "proxyUrl", "appHint"] as const) {
    const v = partial[key];
    if (v === undefined) delete next[key];
    else next[key] = v;
  }
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
}

export async function clearApiKey(): Promise<void> {
  await setSettings({ apiKey: undefined });
}

function safeUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}