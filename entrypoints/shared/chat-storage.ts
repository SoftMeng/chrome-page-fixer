import {
  CHAT_STORAGE_KEY,
  MAX_MESSAGES_PER_SESSION,
  MAX_SESSIONS,
  type ChatMessage,
  type ChatSession,
} from "./types";

interface StoredShape {
  sessions: ChatSession[];
}

const EMPTY: StoredShape = { sessions: [] };

function newId(): string {
  return crypto.randomUUID();
}

function isSession(value: unknown): value is ChatSession {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.createdAt === "number" &&
    typeof v.updatedAt === "number" &&
    Array.isArray(v.messages) &&
    Array.isArray(v.refs) &&
    v.refs.every((r) => typeof r === "string")
  );
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    (v.role === "user" || v.role === "assistant") &&
    typeof v.content === "string" &&
    Array.isArray(v.refs) &&
    v.refs.every((r) => typeof r === "string") &&
    typeof v.timestamp === "number"
  );
}

async function load(): Promise<ChatSession[]> {
  const stored = await chrome.storage.local.get(CHAT_STORAGE_KEY);
  const value = stored[CHAT_STORAGE_KEY];
  if (!value || typeof value !== "object") return [];
  const v = value as Partial<StoredShape>;
  if (!Array.isArray(v.sessions)) return [];
  return v.sessions.filter(isSession).map((s) => ({
    ...s,
    messages: s.messages.filter(isMessage),
  }));
}

async function save(sessions: ChatSession[]): Promise<void> {
  await chrome.storage.local.set({ [CHAT_STORAGE_KEY]: { sessions } });
}

function trimSessions(sessions: ChatSession[]): ChatSession[] {
  if (sessions.length <= MAX_SESSIONS) return sessions;
  return [...sessions]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_SESSIONS);
}

export async function getSessions(): Promise<ChatSession[]> {
  return load();
}

export async function getSession(id: string): Promise<ChatSession | undefined> {
  const sessions = await load();
  return sessions.find((s) => s.id === id);
}

export async function createSession(initialRefs: string[]): Promise<ChatSession> {
  const now = Date.now();
  const session: ChatSession = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    messages: [],
    refs: Array.from(new Set(initialRefs)),
  };
  const sessions = await load();
  await save(trimSessions([...sessions, session]));
  return session;
}

export async function appendTurn(
  sessionId: string,
  message: Omit<ChatMessage, "id" | "timestamp">,
): Promise<ChatSession> {
  const sessions = await load();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx === -1) throw new Error(`session not found: ${sessionId}`);
  const current = sessions[idx];
  if (!current) throw new Error(`session not found: ${sessionId}`);
  const turn: ChatMessage = {
    id: newId(),
    timestamp: Date.now(),
    role: message.role,
    content: message.content,
    refs: message.refs,
  };
  const messages = [...current.messages, turn];
  const trimmed =
    messages.length > MAX_MESSAGES_PER_SESSION
      ? messages.slice(messages.length - MAX_MESSAGES_PER_SESSION)
      : messages;
  const next: ChatSession = {
    ...current,
    updatedAt: turn.timestamp,
    refs: Array.from(new Set([...current.refs, ...message.refs])),
    messages: trimmed,
  };
  const updated = [...sessions];
  updated[idx] = next;
  await save(updated);
  return next;
}

export async function clearSessions(): Promise<void> {
  await chrome.storage.local.set({ [CHAT_STORAGE_KEY]: EMPTY });
}