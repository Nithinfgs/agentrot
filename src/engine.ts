import { loadConfig } from './config.js';
import { discoverInstructionFiles } from './discover.js';
import { Project } from './project.js';
import { RULES } from './rules/index.js';
import type { Config, Finding, InstructionFile, Severity, Stats } from './types.js';

export interface Report {
  root: string;
  files: InstructionFile[];
  findings: Finding[];
  stats: Stats;
  /** Tokens in root-level instruction files, i.e. loaded on every session. */
  rootTokens: number;
}

const ORDER: Record<Severity, number> = { error: 0, warn: 1, info: 2 };

function suppressed(f: Finding, files: InstructionFile[]): boolean {
  const file = files.find((x) => x.path === f.file);
  if (!file) return false;
  const lines = file.content.split(/\r?\n/);
  for (const idx of [f.line - 1, f.line - 2]) {
    const m = /<!--\s*agentrot-ignore(?:\s+([\w\s,-]+?))?\s*-->/.exec(lines[idx] ?? '');
    if (!m) continue;
    const ids = (m[1] ?? '').split(/[\s,]+/).filter(Boolean);
    if (ids.length === 0 || ids.includes(f.rule)) return true;
  }
  return false;
}

function dedupe(findings: Finding[]): Finding[] {
  const seen = new Map<string, Finding & { extra: number }>();
  for (const f of findings) {
    const key = `${f.file}\0${f.rule}\0${f.message}`;
    const prev = seen.get(key);
    if (prev) prev.extra++;
    else seen.set(key, { ...f, extra: 0 });
  }
  return [...seen.values()].map(({ extra, ...f }) =>
    extra > 0 ? { ...f, message: `${f.message} (+${extra} more)` } : f,
  );
}

export function analyze(root: string, configOverride?: Config | string): Report {
  const config =
    typeof configOverride === 'object' ? configOverride : loadConfig(root, configOverride);
  const project = new Project(root);
  const files = discoverInstructionFiles(root, project, config);
  const stats: Stats = { checked: 0, verified: 0 };
  const full = files.filter((f) => f.kind === 'instructions' || config.checkSkills);
  const skills = files.filter((f) => !full.includes(f));
  const ctx = { root, files: full, skills, project, config, stats };

  let findings: Finding[] = [];
  for (const rule of RULES) {
    if (config.ignore.includes(rule.id)) continue;
    findings.push(...rule.run(ctx));
  }
  findings = dedupe(findings.filter((f) => !suppressed(f, files)));
  findings.sort(
    (a, b) =>
      a.file.localeCompare(b.file) || a.line - b.line || ORDER[a.severity] - ORDER[b.severity],
  );
  const rootTokens = full.filter((f) => f.dir === '').reduce((n, f) => n + f.tokens, 0);
  return { root, files, findings, stats, rootTokens };
}
