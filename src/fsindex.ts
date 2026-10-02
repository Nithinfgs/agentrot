import { readdirSync } from 'node:fs';
import path from 'node:path';

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'target',
  '.venv',
  'venv',
  '__pycache__',
  '.next',
  '.turbo',
  'coverage',
  '.gradle',
  'vendor',
]);
const MAX_ENTRIES = 100_000;

export interface RepoIndex {
  files: string[];
  /** Every path and every trailing sub-path ("a/b/c.ts" -> "a/b/c.ts", "b/c.ts", "c.ts"). */
  suffixes: Set<string>;
}

export function indexRepo(root: string): RepoIndex {
  const files: string[] = [];
  const suffixes = new Set<string>();
  let count = 0;

  const add = (rel: string) => {
    const parts = rel.split('/');
    for (let i = 0; i < parts.length; i++) suffixes.add(parts.slice(i).join('/'));
  };

  const walk = (abs: string, rel: string) => {
    if (count > MAX_ENTRIES) return;
    let entries: import('node:fs').Dirent[];
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      count++;
      if (e.isDirectory()) {
        add(childRel);
        if (!SKIP_DIRS.has(e.name)) walk(path.join(abs, e.name), childRel);
      } else {
        files.push(childRel);
        add(childRel);
      }
    }
  };
  walk(root, '');
  return { files, suffixes };
}
