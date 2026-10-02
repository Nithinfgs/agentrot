import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globToRegExp } from './config.js';
import { type RepoIndex, indexRepo } from './fsindex.js';

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export interface PackageInfo {
  path: string;
  scripts: Record<string, string>;
  deps: Set<string>;
  engines: Record<string, string>;
  packageManager?: string;
}

function readText(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** Facts about the repository that instruction files can be checked against. */
export class Project {
  readonly index: RepoIndex;
  readonly packages: PackageInfo[] = [];
  private fileSet: Set<string>;

  constructor(readonly root: string) {
    this.index = indexRepo(root);
    this.fileSet = new Set(this.index.files);
    for (const f of this.index.files) {
      if (path.posix.basename(f) !== 'package.json') continue;
      const text = readText(path.join(root, f));
      if (!text) continue;
      try {
        const j = JSON.parse(text) as Record<string, unknown>;
        const deps = new Set<string>();
        for (const k of [
          'dependencies',
          'devDependencies',
          'peerDependencies',
          'optionalDependencies',
        ]) {
          for (const d of Object.keys((j[k] as Record<string, string>) ?? {})) deps.add(d);
        }
        this.packages.push({
          path: f,
          scripts: (j.scripts as Record<string, string>) ?? {},
          deps,
          engines: (j.engines as Record<string, string>) ?? {},
          packageManager: typeof j.packageManager === 'string' ? j.packageManager : undefined,
        });
      } catch {
        /* malformed package.json is not our problem */
      }
    }
  }

  has(file: string): boolean {
    return this.fileSet.has(file);
  }

  hasBasename(name: string): boolean {
    return this.index.files.some((f) => path.posix.basename(f) === name);
  }

  hasAny(names: string[]): boolean {
    return names.some((n) => this.hasBasename(n));
  }

  hasSuffix(pattern: RegExp): boolean {
    return this.index.files.some((f) => pattern.test(f));
  }

  isTopLevel(name: string): boolean {
    return existsSync(path.join(this.root, name));
  }

  private ignoreRes?: RegExp[];

  /** True when a root .gitignore entry covers this path (generated or local-only files). */
  isGitignored(candidate: string): boolean {
    if (!this.ignoreRes) {
      const text = readText(path.join(this.root, '.gitignore')) ?? '';
      this.ignoreRes = text
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#') && !l.startsWith('!'))
        .map((l) => {
          const anchored = l.startsWith('/') || l.replace(/\/$/, '').includes('/');
          const body = globToRegExp(l.replace(/^\//, '').replace(/\/$/, '')).source.slice(1, -1);
          return new RegExp(anchored ? `^${body}(?:/|$)` : `(?:^|/)${body}(?:/|$)`);
        });
    }
    const c = candidate.replace(/^\.\//, '');
    return this.ignoreRes.some((re) => re.test(c));
  }

  /** Resolves a path mentioned in an instruction file. */
  exists(candidate: string, fromDir: string): boolean {
    let c = candidate.replace(/^\.\//, '').replace(/\/+$/, '');
    if (c.startsWith('../')) c = path.posix.normalize(path.posix.join(fromDir, c));
    if (!c || c.startsWith('../')) return false;
    return this.index.suffixes.has(c) || existsSync(path.join(this.root, c));
  }

  get rootPackage(): PackageInfo | undefined {
    return this.packages.find((p) => p.path === 'package.json');
  }

  hasScript(name: string): boolean {
    return this.packages.some((p) => name in p.scripts);
  }

  hasDep(...names: string[]): boolean {
    return this.packages.some((p) => names.some((n) => p.deps.has(n)));
  }

  get hasPackageJson(): boolean {
    return this.packages.length > 0;
  }

  /** The package manager the repo actually uses, or undefined when unknown or ambiguous. */
  get packageManager(): PackageManager | undefined {
    const field = this.rootPackage?.packageManager?.split('@')[0];
    if (field === 'npm' || field === 'pnpm' || field === 'yarn' || field === 'bun') return field;
    const found: PackageManager[] = [];
    if (this.has('pnpm-lock.yaml')) found.push('pnpm');
    if (this.has('yarn.lock')) found.push('yarn');
    if (this.has('bun.lock') || this.has('bun.lockb')) found.push('bun');
    if (this.has('package-lock.json') || this.has('npm-shrinkwrap.json')) found.push('npm');
    return found.length === 1 ? found[0] : undefined;
  }

  private targets(names: string[], pattern: RegExp): Set<string> | undefined {
    const files = this.index.files.filter((f) => names.includes(path.posix.basename(f)));
    if (files.length === 0) return undefined;
    const out = new Set<string>();
    for (const f of files) {
      const text = readText(path.join(this.root, f)) ?? '';
      for (const m of text.matchAll(pattern)) if (m[1]) out.add(m[1]);
    }
    return out;
  }

  /** Makefile targets across the repo, or undefined when there is no Makefile. */
  get makeTargets(): Set<string> | undefined {
    return this.targets(['Makefile', 'makefile', 'GNUmakefile'], /^([A-Za-z0-9_.-]+)\s*:(?!=)/gm);
  }

  /** justfile recipes across the repo, or undefined when there is no justfile. */
  get justRecipes(): Set<string> | undefined {
    return this.targets(
      ['justfile', 'Justfile', '.justfile'],
      /^@?([A-Za-z0-9_-]+)[^:=\n]*:(?!=)/gm,
    );
  }

  /** Concatenated Python dependency files, or undefined when this is not a Python project. */
  get pythonDeps(): string | undefined {
    const names = ['pyproject.toml', 'setup.py', 'setup.cfg', 'tox.ini', 'Pipfile', 'noxfile.py'];
    const files = this.index.files.filter(
      (f) => names.includes(path.posix.basename(f)) || /(^|\/)requirements[\w.-]*\.txt$/.test(f),
    );
    if (files.length === 0) return undefined;
    return files.map((f) => readText(path.join(this.root, f)) ?? '').join('\n');
  }

  /** Required major Node version: [kind, major]. */
  get nodeRequirement(): { kind: 'exact' | 'min'; major: number } | undefined {
    for (const f of ['.nvmrc', '.node-version']) {
      const m = /(\d+)/.exec(readText(path.join(this.root, f)) ?? '');
      if (m) return { kind: 'exact', major: Number(m[1]) };
    }
    const eng = this.rootPackage?.engines.node;
    const m = eng ? /^\s*>=?\s*v?(\d+)/.exec(eng) : null;
    if (m) return { kind: 'min', major: Number(m[1]) };
    const exact = eng ? /^\s*v?(\d+)(?:\.\d+)*\s*$/.exec(eng) : null;
    return exact ? { kind: 'exact', major: Number(exact[1]) } : undefined;
  }

  /** Minimum Python as [major, minor]. */
  get pythonMin(): [number, number] | undefined {
    const pv = /(\d+)\.(\d+)/.exec(readText(path.join(this.root, '.python-version')) ?? '');
    if (pv) return [Number(pv[1]), Number(pv[2])];
    const py = /requires-python\s*=\s*"[^"]*?>=\s*(\d+)\.(\d+)/.exec(
      readText(path.join(this.root, 'pyproject.toml')) ?? '',
    );
    return py ? [Number(py[1]), Number(py[2])] : undefined;
  }
}
