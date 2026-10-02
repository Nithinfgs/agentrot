import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from './config.js';
import { parseMarkdown } from './parse.js';
import type { Project } from './project.js';
import { estimateTokens } from './tokens.js';
import type { Config, InstructionFile } from './types.js';

const BASENAMES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'CLAUDE.local.md',
  'GEMINI.md',
  'CONVENTIONS.md',
  'SKILL.md',
  '.cursorrules',
  '.windsurfrules',
]);

function isInstructionPath(rel: string): boolean {
  const base = path.posix.basename(rel);
  if (BASENAMES.has(base)) return true;
  if (rel === '.github/copilot-instructions.md') return true;
  if (/^\.github\/instructions\/[^/]+\.md$/.test(rel)) return true;
  if (/^(?:.*\/)?\.cursor\/rules\/[^/]+\.mdc?$/.test(rel)) return true;
  return false;
}

export function discoverInstructionFiles(
  root: string,
  project: Project,
  config: Config,
): InstructionFile[] {
  const ignore = config.ignorePaths.map(globToRegExp);
  const wanted = new Set<string>();
  for (const f of project.index.files) if (isInstructionPath(f)) wanted.add(f);
  for (const f of config.files) if (project.has(f)) wanted.add(f);

  const byHash = new Map<string, InstructionFile>();
  const out: InstructionFile[] = [];
  for (const rel of [...wanted].sort()) {
    if (ignore.some((re) => re.test(rel))) continue;
    const abs = path.join(root, rel);
    let content: string;
    try {
      content = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    let linkTarget: string | undefined;
    try {
      if (lstatSync(abs).isSymbolicLink()) {
        linkTarget = path.relative(root, realpathSync(abs)).split(path.sep).join('/');
      }
    } catch {
      /* ignore */
    }
    const hash = createHash('sha1').update(content).digest('hex');
    const twin =
      byHash.get(hash) ?? (linkTarget ? out.find((f) => f.path === linkTarget) : undefined);
    if (twin) {
      twin.aliases.push(rel);
      continue;
    }
    const file: InstructionFile = {
      path: rel,
      kind: path.posix.basename(rel) === 'SKILL.md' ? 'skill' : 'instructions',
      dir: path.posix.dirname(rel) === '.' ? '' : path.posix.dirname(rel),
      content,
      tokens: estimateTokens(content),
      doc: parseMarkdown(content),
      aliases: [],
    };
    byHash.set(hash, file);
    out.push(file);
  }
  return out;
}
