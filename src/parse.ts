import type { Item, ParsedDoc } from './types.js';

const SHELL_LANGS = new Set(['', 'bash', 'sh', 'shell', 'zsh', 'console', 'shell-session', 'fish']);
const FENCE = /^\s*(`{3,}|~{3,})\s*([\w+-]*)/;

export function parseMarkdown(content: string): ParsedDoc {
  const doc: ParsedDoc = {
    inlineCodes: [],
    commandLines: [],
    links: [],
    imports: [],
    proseLines: [],
  };
  const lines = content.split(/\r?\n/);
  let fence: { marker: string; lang: string } | null = null;
  let pending: { text: string; line: number } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i] ?? '';
    const line = i + 1;
    const fenceMatch = FENCE.exec(raw);

    if (fence) {
      if (fenceMatch && fenceMatch[1]?.[0] === fence.marker[0] && !fenceMatch[2]) {
        fence = null;
        pending = null;
        continue;
      }
      if (!SHELL_LANGS.has(fence.lang.toLowerCase())) continue;
      let text = raw.trim();
      if (pending) {
        text = `${pending.text} ${text}`;
        pending = null;
      }
      if (text.endsWith('\\')) {
        pending = { text: text.slice(0, -1).trim(), line };
        continue;
      }
      text = text.replace(/^[$>]\s+/, '');
      if (text && !text.startsWith('#')) doc.commandLines.push({ text, line, context: raw });
      continue;
    }

    if (fenceMatch) {
      fence = { marker: fenceMatch[1] ?? '```', lang: fenceMatch[2] ?? '' };
      continue;
    }

    doc.proseLines.push({ text: raw, line, context: raw });

    for (const m of raw.matchAll(/(`+)([^`\n]+?)\1/g)) {
      const text = (m[2] ?? '').trim();
      if (text) doc.inlineCodes.push({ text, line, context: raw });
    }
    for (const m of raw.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      if (m[1]) doc.links.push({ text: m[1], line, context: raw });
    }
    const noCode = raw.replace(/`[^`]*`/g, '');
    for (const m of noCode.matchAll(/(?:^|\s)@([\w./-]+\.(?:md|mdc|txt|json|ya?ml|toml))\b/g)) {
      if (m[1]) doc.imports.push({ text: m[1], line, context: raw });
    }
  }
  return doc;
}

/** Splits a shell line into simple command segments and strips env-var prefixes. */
export function splitCommands(text: string): string[][] {
  return text
    .split(/\s*(?:&&|\|\||;|\|)\s*/)
    .map((seg) => seg.trim().split(/\s+/).filter(Boolean))
    .map((tokens) => {
      let i = 0;
      while (tokens[i] && /^[A-Z_][A-Z0-9_]*=/.test(tokens[i] ?? '')) i++;
      return tokens.slice(i);
    })
    .filter((t) => t.length > 0);
}

export function allCommandItems(doc: ParsedDoc): Item[] {
  return [...doc.commandLines, ...doc.inlineCodes];
}
