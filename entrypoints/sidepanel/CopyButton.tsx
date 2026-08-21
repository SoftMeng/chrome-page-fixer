import { useEffect, useRef, useState } from "react";

type Status = "idle" | "ok" | "fail";

const RESET_MS = 1200;

interface Props {
  getText: () => string;
  label: string;
}

export function CopyButton({ getText, label }: Props) {
  const [status, setStatus] = useState<Status>("idle");
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  async function onClick() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    try {
      await navigator.clipboard.writeText(getText());
      setStatus("ok");
    } catch {
      setStatus("fail");
    }
    timerRef.current = window.setTimeout(() => setStatus("idle"), RESET_MS);
  }

  const text =
    status === "ok" ? "已复制" :
    status === "fail" ? "复制失败" :
    label;

  return (
    <button
      type="button"
      className="copy-button"
      data-status={status}
      onClick={onClick}
    >
      {text}
    </button>
  );
}