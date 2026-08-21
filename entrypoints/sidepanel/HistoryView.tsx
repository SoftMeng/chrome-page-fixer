import type { ChatSession, ErrorEntry } from "../shared/types";
import { formatRelativeTime } from "../shared/format";

interface Props {
  sessions: ChatSession[];
  currentId: string | null;
  lookup: Map<string, ErrorEntry>;
  hashToIndex: Map<string, number>;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export function HistoryView({ sessions, currentId, lookup, hashToIndex, onOpen, onDelete, onClearAll }: Props) {
  return (
    <div className="view history-view">
      <div className="toolbar">
        <span className="toolbar-label">共 {sessions.length} 个会话</span>
        <button
          type="button"
          className="session-clear"
          onClick={onClearAll}
          disabled={sessions.length === 0}
        >
          清空
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="empty-state">暂无历史会话</div>
      ) : (
        <ul className="history-list">
          {sessions.map((s) => {
            const summary =
              s.refs.length === 0
                ? "空白会话"
                : s.refs
                    .map((h) => {
                      const idx = hashToIndex.get(h);
                      const e = lookup.get(h);
                      if (!e) return `${idx ? `#${idx}` : "?"} (removed)`;
                      return `${idx ? `#${idx}` : "?"} ${e.kind}`;
                    })
                    .join(", ");
            const isCurrent = currentId === s.id;
            return (
              <li key={s.id} className="history-item" data-current={isCurrent}>
                <button
                  type="button"
                  className="history-item-row"
                  onClick={() => onOpen(s.id)}
                >
                  <span className="history-item-summary">{summary}</span>
                  <span className="history-item-meta">
                    {s.messages.length} 轮 · {formatRelativeTime(s.updatedAt)}
                  </span>
                </button>
                <button
                  type="button"
                  className="history-item-delete"
                  aria-label="删除会话"
                  onClick={() => onDelete(s.id)}
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}