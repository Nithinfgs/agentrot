import path from 'node:path';
import type { Context, Finding, Item, Rule } from '../types.js';

const EXTS =
  'ts|tsx|js|jsx|mjs|cjs|json|md|mdx|mdc|py|rs|go|yml|yaml|toml|sh|rb|java|kt|swift|css|scss|html|sql|txt|cfg|ini|lock|c|h|cpp|cs|php|vue|svelte|ex|exs';
const EXT_RE = new RegExp(`\\.(?:${EXTS})$`, 'i');
const SEGMENT = /^[\w.@\-[\]()]+$/;
const FRAMEWORK_STEMS = new Set([
  'next',
  'node',
  'vue',
  'nuxt',
  'react',
  'three',
  'chart',
  'd3',
  'express',
  'nest',
  'ember',
  'alpine',
  'p5',
  'socket',
  'svelte',
  'angular',
  'backbone',
  'moment',
  'deno',
]);
const GENERATED =
  /^(?:dist|build|out|coverage|target)\/|(?:^|\/)(?:node_modules|\.next|\.venv|__pycache__)(?:\/|$)/;
const GENERATED_FILES =
  /^(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|Cargo\.lock|poetry\.lock|uv\.lock|Gemfile\.lock|composer\.lock)$/;
const EXAMPLE =
  /\b(e\.g\.|eg:|if exists|if it exists|if present|optional|for example|for instance|such as|example|like)\b/i;
const NEGATION =
  /\b(don'?t|do not|not|never|avoid|instead of|rather than|no longer|deprecated|removed|legacy)\b/i;
const CREATION =
  /\b(create|creates|created|add|adds|new|generate|generates|generated|output|outputs|write|writes|emit|emits|save|saves|produce|produces)\b/i;

export function normalizePathCandidate(text: string): string | undefined {
  let t = text
    .trim()
    .replace(/:\d+(?::\d+)?$/, '')
    .replace(/#L\d+(?:-L?\d+)?$/, '');
  if (!t || /\s|:\/\/|[*<>{}$?|=~,;!]|\.\.\./.test(t)) return undefined;
  if (/^[-/~@]/.test(t)) return undefined;
  t = t.replace(/^\.\//, '');
  const base = path.posix.basename(t.replace(/\/$/, ''));
  if (!t || GENERATED.test(t) || GENERATED_FILES.test(base) || /^\.env/.test(base))
    return undefined;
  const parts = t.replace(/\/$/, '').split('/');
  if (!parts.every((p) => SEGMENT.test(p))) return undefined;
  return t;
}

function classify(t: string, ctx: Context): 'path' | 'bare' | undefined {
  const parts = t.replace(/\/$/, '').split('/');
  const last = parts[parts.length - 1] ?? '';
  if (parts.length === 1) {
    if (!EXT_RE.test(last)) return undefined;
    const stem = last.replace(/\.[^.]+$/, '').toLowerCase();
    if (FRAMEWORK_STEMS.has(stem) && /\.js$/i.test(last)) return undefined;
    if (/^v?\d+(\.\d+)+$/.test(last)) return undefined;
    if (stem === '' || (stem.startsWith('.') && stem.length <= 6)) return undefined;
    return 'bare';
  }
  const first = parts[0] ?? '';
  // `owner/repo`, `next/server`, `origin/main`: only a path when the first segment is a real directory.
  if (EXT_RE.test(last) || t.endsWith('/') || parts.length >= 3) {
    return ctx.project.exists(first, '') ? 'path' : undefined;
  }
  return ctx.project.isTopLevel(first) ? 'path' : undefined;
}

function suggest(t: string, ctx: Context): string | undefined {
  const base = path.posix.basename(t.replace(/\/$/, ''));
  const hits = ctx.project.index.files.filter((f) => path.posix.basename(f) === base);
  if (hits.length === 0) return undefined;
  return `Did you mean ${hits
    .slice(0, 3)
    .map((h) => `\`${h}\``)
    .join(' or ')}?`;
}

function checkPath(
  item: Item,
  text: string,
  kind: 'path' | 'bare',
  dir: string,
  file: string,
  ctx: Context,
  out: Finding[],
) {
  if (ctx.project.isGitignored(text)) return;
  ctx.stats.checked++;
  if (ctx.project.exists(text, dir)) {
    ctx.stats.verified++;
    return;
  }
  out.push({
    rule: 'missing-path',
    severity: kind === 'bare' ? 'warn' : 'error',
    file,
    line: item.line,
    message: `\`${text}\` does not exist in the repo`,
    evidence: item.context.trim(),
    hint: suggest(text, ctx) ?? 'Remove the reference or update it to the current location.',
  });
}

export const missingPath: Rule = {
  id: 'missing-path',
  description: 'A file or directory mentioned in backticks or a relative link does not exist.',
  run(ctx) {
    const out: Finding[] = [];
    for (const f of ctx.files) {
      for (const item of f.doc.inlineCodes) {
        if (
          NEGATION.test(item.context) ||
          CREATION.test(item.context) ||
          EXAMPLE.test(item.context)
        )
          continue;
        const t = normalizePathCandidate(item.text);
        if (!t) continue;
        const kind = classify(t, ctx);
        if (kind) checkPath(item, t, kind, f.dir, f.path, ctx, out);
      }
      for (const item of f.doc.links) {
        if (/^[a-z][a-z0-9+.-]*:/i.test(item.text) || /^[#/]/.test(item.text)) continue;
        const clean = item.text.split(/[#?]/)[0] ?? '';
        const t = normalizePathCandidate(clean);
        if (t) checkPath(item, t, 'path', f.dir, f.path, ctx, out);
      }
    }
    return out;
  },
};

export const missingImport: Rule = {
  id: 'missing-import',
  description:
    'An `@path/to/file.md` import does not resolve, so the agent silently loses that context.',
  run(ctx) {
    const out: Finding[] = [];
    for (const f of [...ctx.files, ...ctx.skills]) {
      for (const item of f.doc.imports) {
        const rel = path.posix.normalize(path.posix.join(f.dir, item.text));
        ctx.stats.checked++;
        if (ctx.project.has(rel) || ctx.project.has(item.text)) {
          ctx.stats.verified++;
          continue;
        }
        out.push({
          rule: 'missing-import',
          severity: 'error',
          file: f.path,
          line: item.line,
          message: `Import \`@${item.text}\` does not resolve`,
          evidence: item.context.trim(),
          hint:
            suggest(item.text, ctx) ?? 'Imports resolve relative to the file that contains them.',
        });
      }
    }
    return out;
  },
};
