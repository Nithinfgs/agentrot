import { formatTokens } from '../tokens.js';
import type { Finding, Rule } from '../types.js';

const VAGUE: RegExp[] = [
  /\b(?:write|produce|generate)\s+(?:clean|good|high[- ]quality|readable|maintainable|elegant)\s+code\b/i,
  /\bfollow\s+(?:best|good)\s+practices\b/i,
  /\bbe\s+(?:careful|thorough|smart|helpful|accurate)\b/i,
  /\b(?:don'?t|do not)\s+(?:make|introduce)\s+(?:any\s+)?(?:bugs|mistakes|errors)\b/i,
  /\buse\s+common\s+sense\b/i,
  /\bensure\s+(?:high\s+)?quality\b/i,
  /\bthink\s+(?:carefully|deeply|hard)\b/i,
];

const SECRETS: { name: string; re: RegExp }[] = [
  { name: 'OpenAI/Anthropic-style API key', re: /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}/ },
  {
    name: 'GitHub token',
    re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{30,}/,
  },
  { name: 'AWS access key id', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: 'private key block', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  {
    name: 'hard-coded password',
    re: /\b(?:password|passwd|secret)\s*[:=]\s*['"]?(?!<|\$|your|xxx|changeme|\*+)[^\s'"]{8,}/i,
  },
];

function mask(s: string): string {
  return s.replace(/([A-Za-z0-9_-]{4})[A-Za-z0-9_-]{6,}/g, '$1…');
}

export const bloat: Rule = {
  id: 'context-bloat',
  description:
    'Instruction files exceed a token budget. Everything in them is paid for on every session.',
  run(ctx) {
    const out: Finding[] = [];
    for (const f of ctx.files) {
      if (f.tokens > ctx.config.maxTokens) {
        out.push({
          rule: 'context-bloat',
          severity: 'warn',
          file: f.path,
          line: 1,
          message: `~${formatTokens(f.tokens)} tokens (budget ${formatTokens(ctx.config.maxTokens)})`,
          hint: 'Move reference material to docs/ and link it; keep only rules an agent must always follow.',
        });
      }
    }
    const root = ctx.files.filter((f) => f.dir === '');
    const total = root.reduce((n, f) => n + f.tokens, 0);
    const first = root[0];
    if (first && root.length > 1 && total > ctx.config.maxTotalTokens) {
      out.push({
        rule: 'context-bloat',
        severity: 'warn',
        file: first.path,
        line: 1,
        message: `Root instruction files total ~${formatTokens(total)} tokens (budget ${formatTokens(ctx.config.maxTotalTokens)})`,
        hint: `Files: ${root.map((f) => f.path).join(', ')}`,
      });
    }
    return out;
  },
};

export const vagueRule: Rule = {
  id: 'vague-rule',
  description: 'Generic filler ("write clean code") that costs tokens and changes nothing.',
  run(ctx) {
    const out: Finding[] = [];
    for (const f of ctx.files) {
      for (const l of f.doc.proseLines) {
        if (VAGUE.some((re) => re.test(l.text))) {
          out.push({
            rule: 'vague-rule',
            severity: 'info',
            file: f.path,
            line: l.line,
            message: 'Generic instruction the agent already follows',
            evidence: l.text.trim(),
            hint: 'Replace with a concrete, checkable rule, or delete it.',
          });
        }
      }
    }
    return out;
  },
};

export const secrets: Rule = {
  id: 'secret-exposure',
  description: 'A credential-looking string is committed inside an instruction file.',
  run(ctx) {
    const out: Finding[] = [];
    for (const f of [...ctx.files, ...ctx.skills]) {
      f.content.split(/\r?\n/).forEach((text, i) => {
        for (const s of SECRETS) {
          if (s.re.test(text)) {
            out.push({
              rule: 'secret-exposure',
              severity: 'error',
              file: f.path,
              line: i + 1,
              message: `Possible credential: ${s.name}`,
              evidence: mask(text.trim()),
              hint: 'Instruction files are read by every agent and every contributor. Rotate it and use env vars.',
            });
            break;
          }
        }
      });
    }
    return out;
  },
};

const DOCUMENTED = ['test', 'lint', 'build', 'typecheck'] as const;

export const undocumentedCommand: Rule = {
  id: 'undocumented-command',
  description:
    'package.json defines test/lint/build scripts that no instruction file tells the agent about.',
  run(ctx) {
    const root = ctx.project.rootPackage;
    const rootFiles = ctx.files.filter((f) => f.dir === '');
    const first = rootFiles[0];
    if (!root || !first) return [];
    const text = rootFiles.map((f) => f.content).join('\n');
    const missing = DOCUMENTED.filter((name) => {
      const body = root.scripts[name];
      if (!body) return false;
      const pm = /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?/;
      const named = new RegExp(`${pm.source}${name}\\b`).test(text);
      return !named && !text.includes(body);
    });
    if (missing.length === 0) return [];
    return [
      {
        rule: 'undocumented-command',
        severity: 'info',
        file: first.path,
        line: 1,
        message: `package.json has ${missing.map((m) => `"${m}"`).join(', ')} but the instructions never say how to run ${missing.length > 1 ? 'them' : 'it'}`,
        hint: 'Agents that cannot find a command tend to guess one.',
      } satisfies Finding,
    ];
  },
};
