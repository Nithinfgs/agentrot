import { allCommandItems, splitCommands } from '../parse.js';
import type { Context, Finding, InstructionFile, Item, Rule } from '../types.js';

const NEGATION =
  /\b(don'?t|do not|not|never|avoid|instead of|rather than|no longer|deprecated|removed|legacy)\b/i;
const PMS = new Set(['npm', 'pnpm', 'yarn', 'bun']);
const PM_BUILTINS = new Set([
  'install',
  'i',
  'ci',
  'add',
  'remove',
  'rm',
  'uninstall',
  'up',
  'update',
  'upgrade',
  'dlx',
  'exec',
  'create',
  'init',
  'link',
  'unlink',
  'publish',
  'pack',
  'audit',
  'outdated',
  'why',
  'list',
  'ls',
  'info',
  'view',
  'config',
  'cache',
  'store',
  'workspaces',
  'workspace',
  'set',
  'version',
  'login',
  'logout',
  'prune',
  'rebuild',
  'import',
  'fetch',
  'patch',
  'deploy',
  'env',
  'help',
  'dedupe',
  'licenses',
  'self-update',
  'run',
  'run-script',
  'x',
  'pm',
  'node',
  'global',
  'bin',
  'check',
  'tag',
  'team',
]);
const INSTALL_LIKE = new Set([
  'install',
  'i',
  'ci',
  'add',
  'remove',
  'rm',
  'uninstall',
  'update',
  'up',
  'upgrade',
]);
const WORKSPACE_FLAGS = new Set([
  '--filter',
  '-F',
  '-C',
  '--dir',
  '--cwd',
  '--prefix',
  '--workspace',
  '-w',
  '--workspaces',
  '-r',
  '--recursive',
  '--workspace-root',
  '-W',
]);

const JS_TOOLS: Record<string, string[]> = {
  jest: ['jest'],
  vitest: ['vitest'],
  mocha: ['mocha'],
  eslint: ['eslint'],
  prettier: ['prettier'],
  biome: ['@biomejs/biome'],
  tsc: ['typescript'],
  playwright: ['@playwright/test', 'playwright'],
  cypress: ['cypress'],
  webpack: ['webpack'],
  vite: ['vite'],
  rollup: ['rollup'],
  esbuild: ['esbuild'],
  turbo: ['turbo'],
  nx: ['nx'],
  tsx: ['tsx'],
  'ts-node': ['ts-node'],
  stylelint: ['stylelint'],
};
const PY_TOOLS = [
  'pytest',
  'ruff',
  'black',
  'mypy',
  'flake8',
  'isort',
  'pylint',
  'tox',
  'nox',
  'pyright',
];

const MANIFESTS: Record<string, { label: string; test: (c: Context) => boolean }> = {
  cargo: {
    label: 'Cargo.toml',
    test: (c) => c.project.has('Cargo.toml') || c.project.hasBasename('Cargo.toml'),
  },
  go: { label: 'go.mod', test: (c) => c.project.hasBasename('go.mod') },
  bundle: { label: 'Gemfile', test: (c) => c.project.hasBasename('Gemfile') },
  mvn: { label: 'pom.xml', test: (c) => c.project.hasBasename('pom.xml') },
  gradle: {
    label: 'build.gradle',
    test: (c) =>
      c.project.hasAny([
        'build.gradle',
        'build.gradle.kts',
        'settings.gradle',
        'settings.gradle.kts',
      ]),
  },
  dotnet: { label: '*.csproj / *.sln', test: (c) => c.project.hasSuffix(/\.(csproj|fsproj|sln)$/) },
  composer: { label: 'composer.json', test: (c) => c.project.hasBasename('composer.json') },
  mix: { label: 'mix.exs', test: (c) => c.project.hasBasename('mix.exs') },
  make: { label: 'Makefile', test: (c) => c.project.makeTargets !== undefined },
  just: { label: 'justfile', test: (c) => c.project.justRecipes !== undefined },
  pytest: {
    label: 'a Python project (pyproject.toml, requirements.txt, ...)',
    test: pythonProject,
  },
  poetry: { label: 'a Python project (pyproject.toml, ...)', test: pythonProject },
  ...Object.fromEntries(
    ['npm', 'pnpm', 'yarn', 'bun'].map((pm) => [
      pm,
      { label: 'package.json', test: (c: Context) => c.project.hasPackageJson },
    ]),
  ),
};

function pythonProject(c: Context): boolean {
  return c.project.pythonDeps !== undefined || c.project.hasSuffix(/\.py$/);
}

interface Cmd {
  tokens: string[];
  item: Item;
  inline: boolean;
}

function commandsOf(file: InstructionFile): Cmd[] {
  const out: Cmd[] = [];
  const inlineSet = new Set(file.doc.inlineCodes);
  for (const item of allCommandItems(file.doc)) {
    const inline = inlineSet.has(item);
    if (inline && NEGATION.test(item.context)) continue;
    for (const tokens of splitCommands(item.text)) out.push({ tokens, item, inline });
  }
  return out;
}

function isPlaceholder(s: string): boolean {
  return /^[<[$({]|[*>\]})]$|\.\.\./.test(s);
}

interface Parsed {
  bin: string;
  sub?: string;
  script?: string;
  workspace: boolean;
  global: boolean;
}

function parsePm(tokens: string[]): Parsed {
  const bin = tokens[0] ?? '';
  const rest = tokens.slice(1);
  const global = rest.includes('-g') || rest.includes('--global');
  const workspace = rest.some((t) => WORKSPACE_FLAGS.has(t) || t.startsWith('--filter='));
  const pos: string[] = [];
  for (let i = 0; i < rest.length; i++) {
    const t = rest[i] ?? '';
    if (
      WORKSPACE_FLAGS.has(t) &&
      !['-r', '--recursive', '-w', '--workspaces', '-W', '--workspace-root'].includes(t)
    ) {
      i++;
      continue;
    }
    if (t.startsWith('-')) continue;
    pos.push(t);
  }
  const sub = pos[0];
  let script: string | undefined;
  if (sub === 'run' || sub === 'run-script') script = pos[1];
  else if (bin === 'npm' && (sub === 'test' || sub === 'start'))
    script = sub === 'test' ? 'test' : undefined;
  else if ((bin === 'pnpm' || bin === 'yarn') && sub && !PM_BUILTINS.has(sub)) script = sub;
  return { bin, sub, script, workspace, global };
}

/** Package-manager commands that change or run project state, with their lines. */
export function pmUses(file: InstructionFile): { pm: string; line: number }[] {
  const uses: { pm: string; line: number }[] = [];
  for (const { tokens, item } of commandsOf(file)) {
    const bin = tokens[0] ?? '';
    if (!PMS.has(bin)) continue;
    const p = parsePm(tokens);
    if (p.global) continue;
    const devCmd =
      (p.sub !== undefined && INSTALL_LIKE.has(p.sub)) ||
      p.sub === 'run' ||
      p.sub === 'test' ||
      p.script !== undefined;
    if (devCmd) uses.push({ pm: bin, line: item.line });
  }
  return uses;
}

export const missingScript: Rule = {
  id: 'missing-script',
  description: 'A documented npm/pnpm/yarn/bun script, make target or just recipe does not exist.',
  run(ctx) {
    const out: Finding[] = [];
    for (const f of ctx.files) {
      for (const { tokens, item } of commandsOf(f)) {
        const bin = tokens[0] ?? '';
        if (PMS.has(bin) && ctx.project.hasPackageJson) {
          const p = parsePm(tokens);
          if (!p.script || p.workspace || isPlaceholder(p.script) || !/^[\w:.-]+$/.test(p.script))
            continue;
          // `pnpm prettier` / `yarn tsc` run a dependency's binary when no such script exists.
          if (p.sub !== 'run' && (p.script in JS_TOOLS || ctx.project.hasDep(p.script))) continue;
          ctx.stats.checked++;
          if (ctx.project.hasScript(p.script)) {
            ctx.stats.verified++;
            continue;
          }
          const names = [...new Set(ctx.project.packages.flatMap((x) => Object.keys(x.scripts)))];
          out.push({
            rule: 'missing-script',
            severity: 'error',
            file: f.path,
            line: item.line,
            message: `\`${bin} ${p.sub === 'run' ? 'run ' : ''}${p.script}\` — no "${p.script}" script in any package.json`,
            evidence: item.context.trim(),
            hint: names.length
              ? `Available scripts: ${names.slice(0, 8).join(', ')}`
              : 'package.json defines no scripts.',
          });
        } else if (bin === 'make' || bin === 'just') {
          const set = bin === 'make' ? ctx.project.makeTargets : ctx.project.justRecipes;
          if (!set) continue;
          if (
            tokens.some((t) => ['-C', '-f', '--justfile', '-d', '--working-directory'].includes(t))
          )
            continue;
          const names = tokens.slice(1).filter((t) => !t.startsWith('-') && !/[=$<]/.test(t));
          for (const name of bin === 'just' ? names.slice(0, 1) : names) {
            if (isPlaceholder(name)) continue;
            ctx.stats.checked++;
            if (set.has(name)) {
              ctx.stats.verified++;
              continue;
            }
            out.push({
              rule: 'missing-script',
              severity: 'error',
              file: f.path,
              line: item.line,
              message: `\`${bin} ${name}\` — no "${name}" ${bin === 'make' ? 'target' : 'recipe'} found`,
              evidence: item.context.trim(),
              hint: `Available: ${[...set].slice(0, 8).join(', ') || 'none'}`,
            });
          }
        }
      }
    }
    return out;
  },
};

export const missingManifest: Rule = {
  id: 'missing-manifest',
  description:
    'Commands for an ecosystem are documented but the repo has no matching manifest (copy-pasted template).',
  run(ctx) {
    const out: Finding[] = [];
    for (const f of ctx.files) {
      const seen = new Set<string>();
      for (const { tokens, item } of commandsOf(f)) {
        let key = tokens[0] ?? '';
        if (tokens.length < 2) continue;
        if (
          key === 'go' &&
          !['test', 'build', 'run', 'vet', 'mod', 'fmt'].includes(tokens[1] ?? '')
        )
          continue;
        if (key === './gradlew' || key === 'gradlew') key = 'gradle';
        if (
          (key === 'pip' || key === 'uv' || key === 'python' || key === 'python3') &&
          key !== 'uv'
        )
          continue;
        if (key === 'uv' && !['run', 'sync', 'add'].includes(tokens[1] ?? '')) continue;
        if (key === 'uv') key = 'poetry';
        const m = MANIFESTS[key];
        if (!m || seen.has(key)) continue;
        ctx.stats.checked++;
        if (m.test(ctx)) {
          ctx.stats.verified++;
          continue;
        }
        seen.add(key);
        out.push({
          rule: 'missing-manifest',
          severity: 'error',
          file: f.path,
          line: item.line,
          message: `\`${tokens.slice(0, 3).join(' ')}\` is documented but the repo has no ${m.label}`,
          evidence: item.context.trim(),
          hint: 'This usually means the instructions were copied from another project.',
        });
      }
    }
    return out;
  },
};

export const packageManagerMismatch: Rule = {
  id: 'package-manager-mismatch',
  description:
    'Instructions use a different package manager than the lockfile / packageManager field.',
  run(ctx) {
    const actual = ctx.project.packageManager;
    if (!actual) return [];
    const out: Finding[] = [];
    for (const f of ctx.files) {
      const bad = pmUses(f).filter((u) => u.pm !== actual);
      const good = pmUses(f).length - bad.length;
      ctx.stats.checked += bad.length + good;
      ctx.stats.verified += good;
      const first = bad[0];
      if (!first) continue;
      const names = [...new Set(bad.map((b) => b.pm))].join(', ');
      out.push({
        rule: 'package-manager-mismatch',
        severity: 'warn',
        file: f.path,
        line: first.line,
        message: `Uses ${names} (${bad.length} command${bad.length > 1 ? 's' : ''}) but the repo is set up for ${actual}`,
        evidence:
          f.doc.proseLines.find((l) => l.line === first.line)?.text.trim() ??
          f.doc.commandLines.find((l) => l.line === first.line)?.text,
        hint: `Agents will follow this and create a second lockfile. Use \`${actual}\` instead.`,
      });
    }
    return out;
  },
};

export const missingTool: Rule = {
  id: 'missing-tool',
  description: 'A dev tool is invoked that is not declared as a dependency.',
  run(ctx) {
    const out: Finding[] = [];
    const py = ctx.project.pythonDeps;
    for (const f of ctx.files) {
      const seen = new Set<string>();
      for (const { tokens, item } of commandsOf(f)) {
        let tool = tokens[0] ?? '';
        if (tool === 'npx' || tool === 'bunx')
          tool = tokens.slice(1).find((t) => !t.startsWith('-')) ?? '';
        else if (
          ['pnpm', 'yarn', 'npm', 'bun'].includes(tool) &&
          ['dlx', 'exec', 'x'].includes(tokens[1] ?? '')
        ) {
          tool = tokens.slice(2).find((t) => !t.startsWith('-')) ?? '';
        }
        if (seen.has(tool)) continue;
        const jsPkgs = JS_TOOLS[tool];
        if (jsPkgs && ctx.project.hasPackageJson) {
          ctx.stats.checked++;
          if (ctx.project.hasDep(...jsPkgs) || ctx.project.hasBasename(`${tool}.config.js`)) {
            ctx.stats.verified++;
            continue;
          }
          seen.add(tool);
          out.push({
            rule: 'missing-tool',
            severity: 'warn',
            file: f.path,
            line: item.line,
            message: `\`${tool}\` is invoked but ${jsPkgs.map((p) => `\`${p}\``).join(' / ')} is not in any package.json`,
            evidence: item.context.trim(),
            hint: 'The instructions may describe a tool the project no longer uses.',
          });
        } else if (py !== undefined && PY_TOOLS.includes(tool)) {
          ctx.stats.checked++;
          if (new RegExp(`\\b${tool}\\b`, 'i').test(py)) {
            ctx.stats.verified++;
            continue;
          }
          seen.add(tool);
          out.push({
            rule: 'missing-tool',
            severity: 'warn',
            file: f.path,
            line: item.line,
            message: `\`${tool}\` is invoked but does not appear in the Python dependency files`,
            evidence: item.context.trim(),
            hint: 'The instructions may describe a tool the project no longer uses.',
          });
        }
      }
    }
    return out;
  },
};
