import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ErrorEntry } from "../shared/types";

interface Props {
  session: ChatSession;
  refs: ErrorEntry[];
  busy: boolean;
  onSend: (content: string) => Promise<void>;
}

interface ChatSession {
  id: string;
  messages: ChatMessage[];
  refs: string[];
}

export function ChatPanel({ session, refs, busy, onSend }: Props) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session.messages.length, busy]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  async function submit() {
    const content = draft.trim();
    if (!content || busy) return;
    setDraft("");
    await onSend(content);
  }

  return (
    <section className="chat-panel" aria-label="AI chat">
      <div className="chat-refs">
        <span>引用：</span>
        {refs.length === 0 ? (
          <span>(none)</span>
        ) : (
          refs.map((r) => (
            <span key={r.hash} className="ref-chip" data-level={r.level}>
              {r.level} {r.kind}
            </span>
          ))
        )}
      </div>
      <div className="chat-messages" ref={scrollRef}>
        {session.messages.length === 0 && !busy && (
          <div className="chat-msg" data-role="assistant" data-state="empty">
            在下方输入问题，按 Cmd/Ctrl+Enter 发送。
          </div>
        )}
        {session.messages.map((m) => (
          <div key={m.id} className="chat-msg" data-role={m.role}>
            {m.content}
          </div>
        ))}
        {busy && (
          <div className="chat-msg" data-role="assistant" data-state="loading">
            思考中…
          </div>
        )}
      </div>
      <div className="chat-input">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="问 AI…"
          disabled={busy}
        />
        <button type="button" onClick={() => void submit()} disabled={busy || !draft.trim()}>
          发送
        </button>
      </div>
    </section>
  );
}