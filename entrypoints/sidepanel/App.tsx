import { useMemo, useState } from "react";
import { CopyButton } from "./CopyButton";
import { ChatPanel } from "./ChatPanel";
import { HistoryView } from "./HistoryView";
import { formatTime, toMarkdown, toReport } from "../shared/format";
import {
  ANALYZE_TURN,
  type AnalyzeTurnRequest,
  type AnalyzeTurnResponse,
} from "../shared/messaging";
import {
  appendTurn,
  clearSessions,
  createSession,
  deleteMessage,
  deleteSession,
  getSessions,
  updateSessionRefs,
} from "../shared/chat-storage";
import { clearIndex, ensureIndexNumbers } from "../shared/error-index";
import { useAppState } from "./useAppState";
import { useChatUiState } from "./useChatUiState";
import { type ChatSession, type ErrorEntry } from "../shared/types";

const RECENT_N = 5;

type Tab = "errors" | "chat" | "history";

function findRecentSessionByHash(
  hash: string,
  sessions: ChatSession[],
): ChatSession | undefined {
  for (const s of sessions) {
    if (s.refs.includes(hash)) return s;
  }
  return undefined;
}

export function App() {
  const [tab, setTab] = useState<Tab>("errors");
  const ui = useChatUiState();

  const {
    sorted,
    sessions,
    setSessions,
    session,
    setSession,
    hashToIndex,
    lookup,
  } = useAppState();

  const refEntries = useMemo(
    () =>
      session
        ? session.refs
            .map((h) => lookup.get(h))
            .filter((e): e is ErrorEntry => Boolean(e))
        : [],
    [session, lookup],
  );

  async function askAbout(hash: string) {
    if (!lookup.has(hash)) return;
    ui.clearChatError();
    const existing = findRecentSessionByHash(hash, sessions);
    if (existing) {
      setSession(existing);
      setTab("chat");
      return;
    }
    const created = await createSession([hash]);
    setSessions((prev) => [created, ...prev]);
    setSession(created);
    setTab("chat");
  }

  async function newBlankSession() {
    ui.clearChatError();
    const created = await createSession([]);
    setSessions((prev) => [created, ...prev]);
    setSession(created);
    setTab("chat");
  }

  async function switchSession(id: string) {
    ui.clearChatError();
    const target = sessions.find((s) => s.id === id);
    if (!target) return;
    setSession(target);
    setTab("chat");
  }

  async function removeSession(id: string) {
    ui.clearChatError();
    await deleteSession(id);
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setSession((current) => (current?.id === id ? null : current));
  }

  async function removeRef(hash: string) {
    if (!session) return;
    const nextRefs = session.refs.filter((h) => h !== hash);
    const updated = await updateSessionRefs(session.id, nextRefs);
    setSession(updated);
    setSessions((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }

  async function onSend(content: string): Promise<void> {
    if (!session || ui.busy) return;
    const sessionRef = session;
    const refs = sessionRef.refs;
    ui.clearChatError();
    let userMessageId: string | null = null;
    try {
      await ui.withBusy(async () => {
        const userResult = await appendTurn(sessionRef.id, {
          role: "user",
          content,
          refs,
        });
        userMessageId = userResult.messageId;
        setSession(userResult.session);
        setSessions((prev) =>
          prev
            .map((s) => (s.id === userResult.session.id ? userResult.session : s))
            .sort((a, b) => b.updatedAt - a.updatedAt),
        );

        const payload: AnalyzeTurnRequest = {
          sessionId: sessionRef.id,
          userContent: content,
          refs,
          history: userResult.session.messages,
        };
        const reply = await chrome.runtime.sendMessage({
          type: ANALYZE_TURN,
          payload,
        });
        const data = reply as AnalyzeTurnResponse | undefined;
        if (!data || !data.ok) {
          throw new Error(data?.error ?? "analyze failed");
        }
        const assistantResult = await appendTurn(sessionRef.id, {
          role: "assistant",
          content: data.content ?? "",
          refs: [],
        });
        setSession(assistantResult.session);
        setSessions((prev) =>
          prev
            .map((s) => (s.id === assistantResult.session.id ? assistantResult.session : s))
            .sort((a, b) => b.updatedAt - a.updatedAt),
        );
      });
    } catch (err) {
      if (userMessageId) {
        try {
          const rolled = await deleteMessage(sessionRef.id, userMessageId);
          setSession((current) => (current?.id === rolled.id ? rolled : current));
          setSessions((prev) => prev.map((s) => (s.id === rolled.id ? rolled : s)));
        } catch {
          // rollback failure is not fatal; user message stays in storage
        }
      }
      ui.setChatError(err instanceof Error ? err.message : "发送失败");
    }
  }

  async function onClearAll() {
    const ok = window.confirm("清空所有会话和错误序号？此操作不可撤销。");
    if (!ok) return;
    ui.clearChatError();
    await clearSessions();
    await clearIndex();
    setSessions([]);
    setSession(null);
  }

  const latest = sorted[0];
  const recentN = sorted.slice(0, RECENT_N);

  return (
    <main className="app">
      <header className="header">
        <span className="brand">Page Fixer</span>
        <div className="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            className="tab"
            data-active={tab === "errors"}
            aria-selected={tab === "errors"}
            onClick={() => setTab("errors")}
          >
            错误
            <span className="tab-count">{sorted.length}</span>
          </button>
          <button
            type="button"
            role="tab"
            className="tab"
            data-active={tab === "chat"}
            aria-selected={tab === "chat"}
            onClick={() => setTab("chat")}
          >
            对话
          </button>
          <button
            type="button"
            role="tab"
            className="tab"
            data-active={tab === "history"}
            aria-selected={tab === "history"}
            onClick={() => setTab("history")}
          >
            历史
            <span className="tab-count">{sessions.length}</span>
          </button>
        </div>
        <button type="button" className="header-link" onClick={() => chrome.runtime.openOptionsPage()}>
          设置
        </button>
      </header>

      {tab === "errors" ? (
        <div className="view">
          <div className="toolbar">
            <CopyButton
              label="复制最新 1 条"
              getText={() => (latest ? toMarkdown(latest) : "")}
            />
            <CopyButton
              label={`复制最近 ${RECENT_N} 条`}
              getText={() => toReport(recentN)}
            />
          </div>

          {sorted.length === 0 ? (
            <div className="empty-state">暂无错误</div>
          ) : (
            <ul className="error-list">
              {sorted.map((e) => {
                const idx = hashToIndex.get(e.hash);
                return (
                  <li key={e.hash} className="error-item" data-level={e.level}>
                    <div className="error-level-bar" />
                    <div className="error-body">
                      <div className="error-row">
                        <div className="error-meta">
                          <span className="error-index">{idx ? `#${idx}` : "#-"}</span>
                          <span className="error-kind">{e.kind}</span>
                          <span className="error-time">{formatTime(e.timestamp)}</span>
                        </div>
                        <div className="error-actions">
                          <button type="button" className="error-item-ask" onClick={() => void askAbout(e.hash)}>
                            问他
                          </button>
                          <CopyButton label="复制" getText={() => toMarkdown(e)} />
                        </div>
                      </div>
                      <div className="error-message">{e.message}</div>
                      <div className="error-url">{e.url}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : tab === "chat" ? (
        <div className="view">
          {ui.chatError && (
            <pre className="analysis-result" data-state="error">
              {ui.chatError}
            </pre>
          )}
          {session ? (
            <ChatPanel
              messages={session.messages}
              refs={refEntries}
              hashToIndex={hashToIndex}
              busy={ui.busy}
              onSend={onSend}
              onRemoveRef={(h) => void removeRef(h)}
              onGoHistory={() => setTab("history")}
            />
          ) : (
            <div className="empty-state">
              暂无会话。到「错误」页点某条错误的「问他」开始。
            </div>
          )}
          <div className="toolbar toolbar-floating">
            <button type="button" className="session-new" onClick={() => void newBlankSession()}>
              + 新会话
            </button>
            <button type="button" className="session-clear" onClick={() => void onClearAll()}>
              清空
            </button>
          </div>
        </div>
      ) : (
        <HistoryView
          sessions={sessions}
          currentId={session?.id ?? null}
          lookup={lookup}
          hashToIndex={hashToIndex}
          onOpen={(id) => void switchSession(id)}
          onDelete={(id) => void removeSession(id)}
          onClearAll={() => void onClearAll()}
        />
      )}
    </main>
  );
}