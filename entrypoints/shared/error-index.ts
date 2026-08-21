const INDEX_KEY = "error_index";

interface StoredIndex {
  next: number;
  hashToNumber: Record<string, number>;
}

interface IndexState {
  hashToNumber: Map<string, number>;
  next: number;
}

let cache: IndexState | null = null;

function emptyState(): IndexState {
  return { hashToNumber: new Map(), next: 1 };
}

async function loadFromStorage(): Promise<IndexState> {
  const stored = await chrome.storage.local.get(INDEX_KEY);
  const value = stored[INDEX_KEY];
  if (!value || typeof value !== "object") return emptyState();
  const v = value as Partial<StoredIndex>;
  const hashToNumber = new Map<string, number>();
  if (v.hashToNumber && typeof v.hashToNumber === "object") {
    for (const [hash, num] of Object.entries(v.hashToNumber)) {
      if (typeof num === "number" && num > 0) {
        hashToNumber.set(hash, num);
      }
    }
  }
  const next = typeof v.next === "number" && v.next > 0 ? v.next : hashToNumber.size + 1;
  return { hashToNumber, next };
}

async function persist(state: IndexState): Promise<void> {
  const obj: StoredIndex = {
    next: state.next,
    hashToNumber: Object.fromEntries(state.hashToNumber),
  };
  await chrome.storage.local.set({ [INDEX_KEY]: obj });
}

async function ensureLoaded(): Promise<IndexState> {
  if (cache) return cache;
  cache = await loadFromStorage();
  return cache;
}

export async function getIndexNumber(hash: string): Promise<number | undefined> {
  const state = await ensureLoaded();
  return state.hashToNumber.get(hash);
}

export async function ensureIndexNumbers(hashes: string[]): Promise<Map<string, number>> {
  const state = await ensureLoaded();
  const result = new Map<string, number>();
  let mutated = false;
  for (const hash of hashes) {
    if (!hash) continue;
    const existing = state.hashToNumber.get(hash);
    if (existing !== undefined) {
      result.set(hash, existing);
      continue;
    }
    const assigned = state.next;
    state.hashToNumber.set(hash, assigned);
    state.next = assigned + 1;
    result.set(hash, assigned);
    mutated = true;
  }
  if (mutated) await persist(state);
  return result;
}

export async function clearIndex(): Promise<void> {
  cache = emptyState();
  await chrome.storage.local.remove(INDEX_KEY);
}