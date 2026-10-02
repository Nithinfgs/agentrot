import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PKG, rulesOf, run } from './helpers.js';

test('flags a missing npm script and lists the real ones', () => {
  const r = run({
    'AGENTS.md': 'Run `npm run lint`.\nRun `npm run build`.\n',
    'package.json': PKG,
  });
  const f = r.findings.filter((x) => x.rule === 'missing-script');
  assert.equal(f.length, 1);
  assert.match(f[0]?.hint ?? '', /dev, test, build/);
});

test('handles pnpm/yarn shorthand, npm test, and builtins', () => {
  const r = run({
    'AGENTS.md': '```bash\npnpm dev\npnpm install\nyarn build\nnpm test\npnpm deploy-now\n```\n',
    'package.json': PKG,
  });
  const f = r.findings.filter((x) => x.rule === 'missing-script');
  assert.equal(f.length, 1);
  assert.match(f[0]?.message ?? '', /deploy-now/);
});

test('skips workspace-filtered commands and placeholders', () => {
  const r = run({
    'AGENTS.md': '`pnpm --filter web lint` and `npm run <script>` and `npm run build:*`\n',
    'package.json': PKG,
  });
  assert.deepEqual(
    rulesOf(r).filter((x) => x === 'missing-script'),
    [],
  );
});

test('checks make targets and just recipes', () => {
  const r = run({
    'AGENTS.md': 'Use `make test` and `make deploy`. Also `just fmt` and `just nope`.\n',
    Makefile: 'test:\n\techo hi\n',
    justfile: 'fmt:\n  echo\n',
  });
  const msgs = r.findings.filter((x) => x.rule === 'missing-script').map((x) => x.message);
  assert.equal(msgs.length, 2);
  assert.ok(msgs.some((m) => m.includes('make deploy')));
  assert.ok(msgs.some((m) => m.includes('just nope')));
});

test('flags documented ecosystems that have no manifest', () => {
  const r = run({
    'AGENTS.md': 'Run `cargo test` and `go test ./...` and `npm ci`.\n',
    'package.json': PKG,
  });
  const msgs = r.findings.filter((x) => x.rule === 'missing-manifest').map((x) => x.message);
  assert.equal(msgs.length, 2);
  assert.ok(msgs.some((m) => m.includes('Cargo.toml')));
  assert.ok(msgs.some((m) => m.includes('go.mod')));
});

test('flags package-manager mismatch against the lockfile, ignoring negations and -g', () => {
  const r = run({
    'AGENTS.md': "Use `npm install`.\nDon't use `yarn add`.\n`npm i -g tsx`\n",
    'pnpm-lock.yaml': '',
    'package.json': PKG,
  });
  const f = r.findings.filter((x) => x.rule === 'package-manager-mismatch');
  assert.equal(f.length, 1);
  assert.match(f[0]?.message ?? '', /npm \(1 command\)/);
});

test('does not guess when lockfiles are ambiguous', () => {
  const r = run({
    'AGENTS.md': '`npm install`\n',
    'pnpm-lock.yaml': '',
    'yarn.lock': '',
    'package.json': PKG,
  });
  assert.deepEqual(
    rulesOf(r).filter((x) => x === 'package-manager-mismatch'),
    [],
  );
});

test('flags tools that are not dependencies (js and python)', () => {
  const js = run({ 'AGENTS.md': 'Test with `npx jest`; types via `tsc`.\n', 'package.json': PKG });
  const m = js.findings.filter((x) => x.rule === 'missing-tool');
  assert.equal(m.length, 1);
  assert.match(m[0]?.message ?? '', /jest/);

  const py = run({
    'AGENTS.md': 'Run `pytest` then `ruff check .`\n',
    'pyproject.toml': '[tool.ruff]\n',
  });
  const p = py.findings.filter((x) => x.rule === 'missing-tool');
  assert.equal(p.length, 1);
  assert.match(p[0]?.message ?? '', /pytest/);
});

test('pnpm/yarn shorthand for a dependency binary is not a missing script', () => {
  const r = run({ 'AGENTS.md': '`pnpm vitest` and `yarn tsc`\n', 'package.json': PKG });
  assert.deepEqual(
    rulesOf(r).filter((x) => x === 'missing-script'),
    [],
  );
});
