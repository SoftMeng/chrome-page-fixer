import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ErrorEntry } from "../shared/types";
import { Markdown } from "./markdown";

interface Props {
  messages: ChatMessage[];
  refs: ErrorEntry[];
  hashToIndex: Map<string, number>;
  busy: boolean;
  onSend: (content: string) => Promise<void>;
  onRemoveRef: (hash: string) => void;
  onGoHistory: () => void;
}

export function ChatPanel({ messages, refs, hashToIndex, busy, onSend, onRemoveRef, onGoHistory }: Props) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, busy]);

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key !== "Enter" || e.shiftKey) return;
    if (e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    void submit();
  }

  async function submit() {
    const content = draft.trim();
    if (!content || busy) return;
    setDraft("");
    if (textareaRef.current) textareaRef.current.style.height = "";
    await onSend(content);
  }

  return (
    <section className="chat-view" aria-label="AI 对话">
      <div className="chat-history-link">
        <button type="button" className="history-link-button" onClick={onGoHistory}>
          ← 历史会话
        </button>
      </div>
      <div className="chat-refs-bar">
        <span className="chat-refs-label">引用 {refs.length} 条</span>
        {refs.map((r) => {
          const idx = hashToIndex.get(r.hash);
          return (
            <span key={r.hash} className="ref-chip" data-level={r.level}>
              #{idx ?? "?"} {r.kind}
              <button
                type="button"
                className="ref-remove"
                aria-label={`移除引用 ${r.kind}`}
                onClick={() => onRemoveRef(r.hash)}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>

      <div className="chat-scroll" ref={scrollRef}>
        {messages.length === 0 && !busy && (
          <div className="chat-empty">
            <div className="chat-empty-title">向 AI 提问</div>
            基于引用的错误条目追问根因，
            按 Enter 发送，⌘/Ctrl + Enter 换行。
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className="chat-msg" data-role={m.role}>
            {m.role === "assistant" ? <Markdown source={m.content} /> : m.content}
          </div>
        ))}
        {busy && (
          <div className="chat-typing" aria-label="AI 正在回复">
            <span />
            <span />
            <span />
          </div>
        )}
      </div>

      <div className="chat-composer">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={refs.length === 0 ? "先在「错误」页点「问他」引用一条…" : "追问…"}
          disabled={busy}
          rows={1}
        />
        <button type="button" className="chat-send" onClick={() => void submit()} disabled={busy || !draft.trim()}>
          发送 <kbd>↵</kbd>
        </button>
      </div>

    </section>
  );
}