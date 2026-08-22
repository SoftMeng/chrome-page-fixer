import { useEffect, useState } from "react";
import { clearApiKey, getSettings, setSettings } from "../shared/storage";
import { DEFAULT_SETTINGS } from "../shared/storage-constants";

type Status = "idle" | "saved" | "cleared" | "error";

export function App() {
  const [apiKey, setApiKey] = useState("");
  const [proxyUrl, setProxyUrl] = useState("");
  const [appHint, setAppHint] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [statusMessage, setStatusMessage] = useState("");

  useEffect(() => {
    void getSettings().then((s) => {
      setApiKey(s.apiKey ?? DEFAULT_SETTINGS.apiKey);
      setProxyUrl(s.proxyUrl ?? DEFAULT_SETTINGS.proxyUrl);
      setAppHint(s.appHint ?? "");
    });
  }, []);

  async function onSave() {
    try {
      const trimmedKey = apiKey.trim();
      const normalizedUrl = normalizeProxyUrl(proxyUrl.trim());
      const trimmedHint = appHint.trim();
      if (normalizedUrl) {
        try {
          const u = new URL(normalizedUrl);
          if (u.protocol !== "https:" && u.protocol !== "http:") {
            throw new Error("protocol");
          }
        } catch {
          setStatus("error");
          setStatusMessage("Proxy URL 协议必须为 http(s)");
          return;
        }
      }
      await setSettings({
        apiKey: trimmedKey || undefined,
        proxyUrl: normalizedUrl || undefined,
        appHint: trimmedHint || undefined,
      });
      if (normalizedUrl !== proxyUrl.trim()) {
        setProxyUrl(normalizedUrl);
      }
      setStatus("saved");
      setStatusMessage("已保存");
    } catch (err) {
      setStatus("error");
      setStatusMessage(err instanceof Error ? err.message : "保存失败");
    }
  }

  async function onClear() {
    await clearApiKey();
    setApiKey("");
    setStatus("cleared");
    setStatusMessage("已清除 API Key");
  }

  return (
    <main style={{ padding: 16, fontFamily: "system-ui, sans-serif", maxWidth: 480 }}>
      <h1 style={{ fontSize: 16, margin: 0 }}>Chrome Page Fixer</h1>
      <p style={{ color: "#555", fontSize: 12, marginTop: 4 }}>
        配置 API Key 与代理；Key 仅存本地。
      </p>

      <label style={labelStyle}>
        Proxy URL
        <input
          type="url"
          autoComplete="off"
          value={proxyUrl}
          onChange={(e) => setProxyUrl(e.target.value)}
          placeholder="http://127.0.0.1:5000/v1"
          style={inputStyle}
        />
      </label>
      <p style={{ marginTop: 4, color: "#888", fontSize: 11, lineHeight: 1.4 }}>
        填到 <code>/v1</code> 即可；SDK 会自动追加 <code>/messages</code>。
        如果你的 URL 已经以 <code>/messages</code> 结尾，保存时会被自动剥掉（避免 <code>/v1/messages/messages</code> 重复）。
      </p>

      <label style={labelStyle}>
        API Key
        <input
          type="password"
          autoComplete="off"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="占位符即可（如 PROXY_MANAGED），除非代理要求"
          style={inputStyle}
        />
      </label>

      <label style={labelStyle}>
        App Hint（项目背景，给 AI 看的）
        <input
          type="text"
          autoComplete="off"
          value={appHint}
          onChange={(e) => setAppHint(e.target.value)}
          placeholder="e.g. yudao 前端：React + antd；列表页常见 502"
          style={inputStyle}
        />
      </label>
      <p style={{ marginTop: 4, color: "#888", fontSize: 11, lineHeight: 1.4 }}>
        本扩展不读取宿主机文件；此字段会原样写进错误信封的「App-hint:」一行，仅供复制粘贴给下游 AI / Claude Code 时携带上下文。
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button type="button" onClick={onSave} style={btnStyle}>
          保存
        </button>
        <button type="button" onClick={onClear} style={btnStyle}>
          清除 API Key
        </button>
      </div>

      <p
        style={{
          marginTop: 12,
          color: status === "error" ? "#b00020" : "#666",
          fontSize: 12,
          minHeight: 16,
        }}
      >
        {statusMessage}
      </p>
    </main>
  );
}

function normalizeProxyUrl(raw: string): string {
  const s = raw.replace(/\/+$/, "");
  if (s.endsWith("/v1/messages")) return s.slice(0, -"/messages".length);
  if (s.endsWith("/messages")) return s.slice(0, -"/messages".length);
  return s;
}

const labelStyle: React.CSSProperties = { display: "block", marginTop: 12, fontSize: 13 };
const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  marginTop: 4,
  padding: "6px 8px",
  border: "1px solid #ccc",
  borderRadius: 4,
  fontSize: 13,
};
const btnStyle: React.CSSProperties = {
  fontSize: 13,
  padding: "6px 12px",
  border: "1px solid #ccc",
  background: "#fff",
  borderRadius: 4,
  cursor: "pointer",
};