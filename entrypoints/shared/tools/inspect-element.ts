export interface InspectElementInput {
  selector: string;
}

export interface InspectElementResult {
  selector: string;
  found: boolean;
  tag?: string;
  id?: string;
  classes?: string[];
  attributes?: Record<string, string>;
  rect?: { x: number; y: number; w: number; h: number };
  visible?: boolean;
  ancestorSelector?: string;
  error?: string;
}

const MAX_SELECTOR_LEN = 256;
const FORBIDDEN_TOKENS = [":root", "html", "body", "*"];

export function validateSelector(raw: string): string {
  const s = (raw ?? "").trim().slice(0, MAX_SELECTOR_LEN);
  if (!s) throw new Error("selector is empty");
  const lower = s.toLowerCase();
  for (const tok of FORBIDDEN_TOKENS) {
    if (
      lower === tok ||
      lower.startsWith(`${tok} `) ||
      lower.startsWith(`${tok}>`) ||
      lower.startsWith(`${tok}.`)
    ) {
      throw new Error(`selector targets forbidden token: ${tok}`);
    }
  }
  return s;
}

export function buildAncestorSelector(el: Element, depth: number): string {
  const parts: string[] = [];
  let cur: Element | null = el;
  let n = 0;
  while (cur && n < depth) {
    const tag = cur.tagName ? cur.tagName.toLowerCase() : "";
    if (!tag) break;
    const id = cur.id ? `#${cur.id}` : "";
    parts.unshift(`${tag}${id}`);
    cur = cur.parentElement;
    n += 1;
  }
  return parts.join(" > ");
}