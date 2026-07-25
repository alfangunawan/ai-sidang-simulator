import { createElement, type ReactNode } from "react";

const TOKEN = /\*\*([^*]+)\*\*|\*([^*]+)\*/g;

// Renders the examiner's light markup: **x** -> bold, *x* -> italic. Everything
// else (including newlines, handled by CSS white-space: pre-wrap) passes through
// as literal text; an unmatched marker is left as-is.
export function renderInline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let last = 0;
  let key = 0;
  let m: RegExpExecArray | null;
  TOKEN.lastIndex = 0;
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      nodes.push(createElement("strong", { key: key++ }, m[1]));
    } else {
      nodes.push(createElement("em", { key: key++ }, m[2]));
    }
    last = TOKEN.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

// Plain text for TTS — drops the markup characters so the voice does not spell
// out "bintang bintang".
export function stripMarkdown(text: string): string {
  return text.replace(/\*\*|\*|`/g, "");
}
