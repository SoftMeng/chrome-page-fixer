import { useEffect, useState } from "react";
import { CopyButton } from "./CopyButton";
import { toMarkdown, toReport } from "../shared/format";
import { ANALYZE, type AnalyzeResponse } from "../shared/messaging";
import { MAX_ERRORS, STORAGE_KEY, type ErrorEntry } from "../shared/types";

const RECENT_N = 5;

type AnalysisState = "idle" | "loading" | "ok" | "error";

function format(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}

export function App() {
  const [errors, setErrors] = useState<ErrorEntry[]>([]);
  const [analysis, setAnalysis] = useState<string>("");
  const [state, setState] = useState<AnalysisState>("idle");

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

  const sorted = [...errors].sort((a, b) => b.timestamp - a.timestamp);
  const latest = sorted[0];
  const recentN = sorted.slice(0, RECENT_N);

  async function onAnalyze() {
    setState("loading");
    setAnalysis("");
    try {
      const reply = await chrome.runtime.sendMessage({
        type: ANALYZE,
        payload: { prompt: toReport(recentN) },
      });
      const data = reply as AnalyzeResponse | undefined;
      if (!data || !data.ok) {
        throw new Error(data?.error ?? "analyze failed");
      }
      setAnalysis(data.content ?? "");
      setState("ok");
    } catch (err) {
      setAnalysis(err instanceof Error ? err.message : "分析失败");
      setState("error");
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
        <button
          type="button"
          onClick={onAnalyze}
          disabled={state === "loading" || recentN.length === 0}
        >
          {state === "loading" ? "分析中…" : `分析最近 ${RECENT_N} 条`}
        </button>
      </div>

      {analysis && (
        <pre className="analysis-result" data-state={state}>
          {analysis}
        </pre>
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
                  <CopyButton label="复制" getText={() => toMarkdown(e)} />
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