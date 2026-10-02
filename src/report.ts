import type { Report } from './engine.js';
import { formatTokens } from './tokens.js';
import type { Finding, Severity } from './types.js';

export type Format = 'text' | 'json' | 'github' | 'markdown';

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  green: '\x1b[32m',
  underline: '\x1b[4m',
};

export function counts(findings: Finding[]): Record<Severity, number> {
  const c = { error: 0, warn: 0, info: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function summaryLine(r: Report): string {
  const n = r.files.length;
  const aliases = r.files.reduce((a, f) => a + f.aliases.length, 0);
  const load =
    r.rootTokens > 0 ? ` · ~${formatTokens(r.rootTokens)} tokens loaded per session` : '';
  return `Scanned ${plural(n, 'instruction file')}${aliases ? ` (+${aliases} identical)` : ''}${load}`;
}

function groundedLine(r: Report): string | undefined {
  if (r.stats.checked === 0) return undefined;
  const pct = Math.round((r.stats.verified / r.stats.checked) * 100);
  return `Grounded: ${r.stats.verified} of ${r.stats.checked} checkable claims match the repo (${pct}%)`;
}

export function renderText(r: Report, version: string, color: boolean, compact = false): string {
  const c = (code: string, s: string) => (color ? `${code}${s}${C.reset}` : s);
  const out: string[] = [];
  out.push(`${c(C.bold, `agentrot ${version}`)} ${c(C.dim, `· ${summaryLine(r)}`)}`);
  out.push('');

  if (r.files.length === 0) {
    out.push(
      'No agent instruction files found (AGENTS.md, CLAUDE.md, GEMINI.md, .cursor/rules, SKILL.md, ...).',
    );
    return out.join('\n');
  }

  const byFile = new Map<string, Finding[]>();
  for (const f of r.findings) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f]);
  const sev = {
    error: c(C.red, 'error'),
    warn: c(C.yellow, 'warn '),
    info: c(C.blue, 'info '),
  };
  const lineWidth = Math.max(2, ...r.findings.map((f) => String(f.line).length));

  for (const file of r.files) {
    const list = byFile.get(file.path) ?? [];
    const alias = file.aliases.length ? c(C.dim, `  (same as ${file.aliases.join(', ')})`) : '';
    out.push(`${c(C.underline, file.path)}${alias}`);
    if (list.length === 0) out.push(`  ${c(C.green, '✓')} no problems`);
    for (const f of list) {
      out.push(
        `  ${sev[f.severity]}  ${c(C.dim, String(f.line).padStart(lineWidth))}  ${f.message}  ${c(C.dim, f.rule)}`,
      );
      if (compact) continue;
      if (f.evidence)
        out.push(
          `  ${' '.repeat(5)}  ${' '.repeat(lineWidth)}  ${c(C.dim, `│ ${truncate(f.evidence, 90)}`)}`,
        );
      if (f.hint)
        out.push(`  ${' '.repeat(5)}  ${' '.repeat(lineWidth)}  ${c(C.dim, `↳ ${f.hint}`)}`);
    }
    out.push('');
  }

  const k = counts(r.findings);
  const total = r.findings.length;
  const g = groundedLine(r);
  if (total === 0) out.push(c(C.green, '✓ No problems found'));
  else
    out.push(
      c(
        k.error ? C.red : C.yellow,
        `✖ ${plural(total, 'problem')} (${plural(k.error, 'error')}, ${plural(k.warn, 'warning')}, ${k.info} info)`,
      ),
    );
  if (g) out.push(c(C.dim, g));
  return out.join('\n');
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}

export function renderJson(r: Report, version: string): string {
  return JSON.stringify(
    {
      version,
      files: r.files.map((f) => ({ path: f.path, tokens: f.tokens, aliases: f.aliases })),
      rootTokens: r.rootTokens,
      claims: r.stats,
      summary: counts(r.findings),
      findings: r.findings,
    },
    null,
    2,
  );
}

export function renderGithub(r: Report): string {
  const esc = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return r.findings
    .map((f) => {
      const level = f.severity === 'error' ? 'error' : f.severity === 'warn' ? 'warning' : 'notice';
      return `::${level} file=${f.file},line=${f.line},title=${f.rule}::${esc(f.message + (f.hint ? ` — ${f.hint}` : ''))}`;
    })
    .join('\n');
}

export function renderMarkdown(r: Report): string {
  const k = counts(r.findings);
  const out = ['### agentrot', '', summaryLine(r), ''];
  if (r.findings.length === 0) out.push('No problems found.');
  else {
    out.push(
      `**${plural(r.findings.length, 'problem')}** (${k.error} errors, ${k.warn} warnings, ${k.info} info)`,
      '',
    );
    out.push('| Severity | Location | Problem | Rule |', '|---|---|---|---|');
    for (const f of r.findings)
      out.push(
        `| ${f.severity} | \`${f.file}:${f.line}\` | ${f.message.replace(/\|/g, '\\|')} | ${f.rule} |`,
      );
  }
  const g = groundedLine(r);
  if (g) out.push('', g);
  return out.join('\n');
}
