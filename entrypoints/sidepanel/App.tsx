import { useEffect, useState } from "react";
import { CopyButton } from "./CopyButton";
import { ChatPanel } from "./ChatPanel";
import { toMarkdown, toReport } from "../shared/format";
import {
  ANALYZE_TURN,
  type AnalyzeTurnRequest,
  type AnalyzeTurnResponse,
} from "../shared/messaging";
import {
  appendTurn,
  createSession,
  clearSessions,
  getSessions,
} from "../shared/chat-storage";
import {
  MAX_ERRORS,
  STORAGE_KEY,
  type ChatSession,
  type ErrorEntry,
} from "../shared/types";

const RECENT_N = 5;

function format(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export function App() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [session, setSession] = useState<ChatSession | null>(null);
  const [chatOpen, setChatOpen] = useState(true);
  const [busy, setBusy] = useState(false);
  const [chatError, setChatError] = useState<string>("");

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
    void getSessions().then((all) => {
      const latest = all.sort((a, b) => b.updatedAt - a.updatedAt)[0];
      setSession(latest ?? null);
    });
  }, []);

  const sorted = [...errors].sort((a, b) => b.timestamp - a.timestamp);
  const latest = sorted[0];
  const recentN = sorted.slice(0, RECENT_N);
  const lookup = new Map(errors.map((e) => [e.hash, e]));

  async function openChatForHash(hash: string) {
    if (!lookup.has(hash)) return;
    const existing = session;
    if (existing && existing.refs.includes(hash)) return;
    const created = await createSession(existing ? Array.from(new Set([...existing.refs, hash])) : [hash]);
    setSession(created);
  }

  async function onClearSession() {
    if (!session) return;
    const ok = window.confirm("清空所有会话？此操作不可撤销。");
    if (!ok) return;
    await clearSessions();
    setSession(null);
  }

  function toggleChat() {
    setChatOpen((v) => !v);
  }

  async function onSend(content: string): Promise<void> {
    if (!session || busy) return;
    setChatError("");
    setBusy(true);
    try {
      const userMessage = await appendTurn(session.id, {
        role: "user",
        content,
        refs: session.refs,
      });
      setSession(userMessage);

      const payload: AnalyzeTurnRequest = {
        sessionId: session.id,
        userContent: content,
        refs: session.refs,
        history: userMessage.messages,
      };
      const reply = await chrome.runtime.sendMessage({
        type: ANALYZE_TURN,
        payload,
      });
      const data = reply as AnalyzeTurnResponse | undefined;
      if (!data || !data.ok) {
        throw new Error(data?.error ?? "analyze failed");
      }
      const assistantMessage = await appendTurn(session.id, {
        role: "assistant",
        content: data.content ?? "",
        refs: [],
      });
      setSession(assistantMessage);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "发送失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app">
      <header className="header">
        <h1>Chrome Page Fixer</h1>
      </header>

      <div className="status">
        <span>
          {errors.length === 0 ? "暂无错误" : `${errors.length} / ${MAX_ERRORS} 条`}
        </span>
        <span>·</span>
        <button type="button" className="link" onClick={() => chrome.runtime.openOptionsPage()}>
          打开 Options
        </button>
      </div>

      <div className="toolbar">
        <CopyButton
          label="复制最新 1 条"
          getText={() => (latest ? toMarkdown(latest) : "")}
        />
        <CopyButton
          label={`复制最近 ${RECENT_N} 条`}
          getText={() => toReport(recentN)}
        />
        <button type="button" className="toolbar-toggle" onClick={toggleChat}>
          {chatOpen ? "关闭聊天" : "打开聊天"}
        </button>
        {chatOpen && session && session.messages.length > 0 && (
          <button type="button" className="toolbar-toggle" onClick={() => void onClearSession()}>
            清空会话
          </button>
        )}
      </div>

      {chatError && (
        <pre className="analysis-result" data-state="error">
          {chatError}
        </pre>
      )}

      {chatOpen && session && (
        <ChatPanel
          session={session}
          refs={session.refs.map((h) => lookup.get(h)).filter((e): e is ErrorEntry => Boolean(e))}
          busy={busy}
          onSend={onSend}
        />
      )}

      {sorted.length === 0 ? (
        <div className="empty-state">暂无错误</div>
      ) : (
        <ul className="error-list">
          {sorted.map((e) => (
            <li key={e.hash} className="error-item" data-level={e.level}>
              <div className="error-level-bar" />
              <div className="error-body">
                <div className="error-row">
                  <div className="error-meta">
                    <span className="error-level">{e.level}</span>
                    <span>{format(e.timestamp)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      type="button"
                      className="error-item-ask"
                      onClick={() => void openChatForHash(e.hash)}
                    >
                      问他
                    </button>
                    <CopyButton label="复制" getText={() => toMarkdown(e)} />
                  </div>
                </div>
                <div className="error-message">{e.message}</div>
                <div className="error-url">{e.url}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}