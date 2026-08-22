interface PageContext {
  url: string;
  title: string;
  route: string;
  updatedAt: number;
}

const MAX_AGE_MS = 5 * 60 * 1000;
const contextByTab = new Map<number, PageContext>();

export function recordPageContext(tabId: number, ctx: Omit<PageContext, "updatedAt">): void {
  contextByTab.set(tabId, { ...ctx, updatedAt: Date.now() });
}

export function getPageContext(tabId: number): PageContext | null {
  const ctx = contextByTab.get(tabId);
  if (!ctx) return null;
  if (Date.now() - ctx.updatedAt > MAX_AGE_MS) {
    contextByTab.delete(tabId);
    return null;
  }
  return ctx;
}

export function prunePageContext(tabId: number): void {
  contextByTab.delete(tabId);
}

export function clearPageContext(): void {
  contextByTab.clear();
}