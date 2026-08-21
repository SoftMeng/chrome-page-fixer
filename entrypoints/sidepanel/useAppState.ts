import { useEffect, useMemo, useState } from "react";
import { ensureIndexNumbers } from "../shared/error-index";
import { getSessions } from "../shared/chat-storage";
import { STORAGE_KEY, type ChatSession, type ErrorEntry } from "../shared/types";

export interface AppState {
  errors: ErrorEntry[];
  sorted: ErrorEntry[];
  sessions: ChatSession[];
  setSessions: React.Dispatch<React.SetStateAction<ChatSession[]>>;
  session: ChatSession | null;
  setSession: React.Dispatch<React.SetStateAction<ChatSession | null>>;
  hashToIndex: Map<string, number>;
  lookup: Map<string, ErrorEntry>;
}

export function useAppState(): AppState {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [hashToIndex, setHashToIndex] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    void chrome.storage.local.get(STORAGE_KEY).then((stored) => {
      setErrors(Array.isArray(stored.errors) ? (stored.errors as ErrorEntry[]) : []);
    });
    const listener: Parameters<typeof chrome.storage.onChanged.addListener>[0] = (changes, area) => {
      if (area !== "local") return;
      const change = changes[STORAGE_KEY];
      if (!change) return;
      setErrors(Array.isArray(change.newValue) ? (change.newValue as ErrorEntry[]) : []);
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  useEffect(() => {
    const refresh = async () => {
      const all = (await getSessions()).sort((a, b) => b.updatedAt - a.updatedAt);
      setSessions(all);
      setSession((current) => {
        if (current) {
          const fresh = all.find((s) => s.id === current.id);
          if (fresh) return fresh;
        }
        return all[0] ?? null;
      });
    };
    void refresh();
  }, []);

  useEffect(() => {
    if (errors.length === 0) {
      setHashToIndex(new Map());
      return;
    }
    void ensureIndexNumbers(errors.map((e) => e.hash)).then(setHashToIndex);
  }, [errors]);

  const sorted = useMemo(
    () => [...errors].sort((a, b) => b.timestamp - a.timestamp),
    [errors],
  );
  const lookup = useMemo(() => new Map(errors.map((e) => [e.hash, e])), [errors]);

  return {
    errors,
    sorted,
    sessions,
    setSessions,
    session,
    setSession,
    hashToIndex,
    lookup,
  };
}