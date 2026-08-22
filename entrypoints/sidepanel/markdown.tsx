import { Fragment, type ReactNode } from "react";

type Inline = ReactNode;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderInline(text: string): Inline[] {
  const parts: Inline[] = [];
  const pattern = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = pattern.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1]) {
      parts.push(<code key={key++}>{m[1].slice(1, -1)}</code>);
    } else if (m[2]) {
      parts.push(<strong key={key++}>{m[2].slice(2, -2)}</strong>);
    } else if (m[3] && m[4]) {
      const label = m[3].slice(1, m[3].indexOf("]"));
      parts.push(
        <a key={key++} href={m[4]} target="_blank" rel="noreferrer noopener">
          {label}
        </a>,
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

type BlockType = "code" | "heading" | "li" | "p" | "table";

interface BaseBlock {
  type: BlockType;
}

interface HeadingBlock extends BaseBlock {
  type: "heading";
  level?: number;
  text: string;
}

interface CodeBlock extends BaseBlock {
  type: "code";
  lang?: string;
  text: string;
}

interface ListBlock extends BaseBlock {
  type: "li";
  ordered?: boolean;
  text: string;
}

interface ParagraphBlock extends BaseBlock {
  type: "p";
  text: string;
}

interface TableBlock extends BaseBlock {
  type: "table";
  headers: string[];
  rows: string[][];
}

type Block = HeadingBlock | CodeBlock | ListBlock | ParagraphBlock | TableBlock;

const SEPARATOR_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?\s*$/;
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/;

function splitCells(row: string): string[] {
  const trimmed = row.trim().replace(/^\|/, "").replace(/\|\s*$/, "");
  return trimmed.split("|").map((c) => c.trim());
}

function parseBlocks(src: string): Block[] {
  const lines = src.split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.startsWith("```")) {
      const lang = line.slice(3).trim() || undefined;
      const buf: string[] = [];
      i += 1;
      while (i < lines.length && !(lines[i] ?? "").startsWith("```")) {
        buf.push(lines[i] ?? "");
        i += 1;
      }
      i += 1;
      blocks.push({ type: "code", lang, text: buf.join("\n") });
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      blocks.push({ type: "heading", level: h[1]?.length, text: h[2] ?? "" });
      i += 1;
      continue;
    }
    const ul = /^\s*[-*]\s+(.*)$/.exec(line);
    if (ul) {
      blocks.push({ type: "li", ordered: false, text: ul[1] ?? "" });
      i += 1;
      continue;
    }
    const ol = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (ol) {
      blocks.push({ type: "li", ordered: true, text: ol[1] ?? "" });
      i += 1;
      continue;
    }
    if (TABLE_ROW_RE.test(line) && i + 1 < lines.length && SEPARATOR_RE.test(lines[i + 1] ?? "")) {
      const headers = splitCells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && TABLE_ROW_RE.test(lines[i] ?? "")) {
        rows.push(splitCells(lines[i] ?? ""));
        i += 1;
      }
      blocks.push({ type: "table", headers, rows });
      continue;
    }
    if (line.trim() === "") {
      i += 1;
      continue;
    }
    const buf: string[] = [line];
    i += 1;
    while (i < lines.length && (lines[i] ?? "").trim() !== "" && !/^(#{1,4}\s|```|\s*[-*]\s|\s*\d+[.)]\s|\s*\|)/.test(lines[i] ?? "")) {
      buf.push(lines[i] ?? "");
      i += 1;
    }
    blocks.push({ type: "p", text: buf.join(" ") });
  }
  return blocks;
}

export function Markdown({ source }: { source: string }): ReactNode {
  const blocks = parseBlocks(source);
  const out: ReactNode[] = [];
  let listBuf: Array<{ ordered: boolean; items: ReactNode[] }> = [];
  let key = 0;

  function flushList() {
    for (const group of listBuf) {
      const Tag = group.ordered ? "ol" : "ul";
      out.push(
        <Tag key={`l${key++}`}>{group.items.map((item, idx) => <li key={idx}>{item}</li>)}</Tag>,
      );
    }
    listBuf = [];
  }

  for (const b of blocks) {
    if (b.type === "li") {
      const lastGroup = listBuf[listBuf.length - 1];
      if (lastGroup && lastGroup.ordered === b.ordered) {
        lastGroup.items.push(renderInline(b.text));
      } else {
        listBuf.push({ ordered: Boolean(b.ordered), items: [renderInline(b.text)] });
      }
      continue;
    }
    flushList();
    if (b.type === "code") {
      out.push(
        <pre key={`c${key++}`} data-lang={b.lang ?? ""}>
          <code>{b.text}</code>
        </pre>,
      );
    } else if (b.type === "heading") {
      const Tag = (`h${Math.min((b.level ?? 2) + 2, 6)}`) as "h3" | "h4" | "h5" | "h6";
      out.push(<Tag key={`h${key++}`}>{renderInline(b.text)}</Tag>);
    } else if (b.type === "table") {
      out.push(
        <table key={`t${key++}`}>
          <thead>
            <tr>
              {b.headers.map((h, idx) => (
                <th key={idx}>{renderInline(h)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((row, ridx) => (
              <tr key={ridx}>
                {row.map((cell, cidx) => (
                  <td key={cidx}>{renderInline(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
    } else {
      out.push(<p key={`p${key++}`}>{renderInline(b.text)}</p>);
    }
  }
  flushList();

  return <Fragment>{out}</Fragment>;
}

export { escapeHtml };