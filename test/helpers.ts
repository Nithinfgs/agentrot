import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { analyze } from '../src/engine.js';
import type { Config } from '../src/types.js';

/** Creates a throwaway repo from a { path: content } map and returns its root. */
export function makeRepo(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'agentrot-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = path.join(root, rel);
    mkdirSync(path.dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

export function link(root: string, target: string, name: string): void {
  symlinkSync(target, path.join(root, name));
}

export function run(files: Record<string, string>, config?: Partial<Config>) {
  const root = makeRepo(files);
  try {
    const cfg = config
      ? {
          ignore: [],
          ignorePaths: [],
          maxTokens: 3000,
          maxTotalTokens: 6000,
          files: [],
          checkSkills: false,
          ...config,
        }
      : undefined;
    return analyze(root, cfg);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export function rulesOf(report: ReturnType<typeof run>): string[] {
  return report.findings.map((f) => f.rule);
}

export const PKG = JSON.stringify({
  scripts: { dev: 'vite', test: 'vitest run', build: 'tsc' },
  devDependencies: { vitest: '1', typescript: '5' },
});
