import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { test } from 'node:test';
import { analyze } from '../src/engine.js';
import { PKG, link, makeRepo, rulesOf, run } from './helpers.js';

test('detects conflicting package managers across files and within a file', () => {
  const r = run({
    'AGENTS.md': '`pnpm install`\n',
    'CLAUDE.md': '`yarn install`\n',
    'package.json': PKG,
  });
  assert.ok(rulesOf(r).includes('conflicting-instructions'));

  const single = run({ 'AGENTS.md': '`pnpm install`\n`npm run test`\n', 'package.json': PKG });
  assert.ok(single.findings.some((f) => f.message.startsWith('Mixes package managers')));
});

test('detects tabs-vs-spaces conflicts', () => {
  const r = run({
    'AGENTS.md': 'Use tabs for indentation.\n',
    'CLAUDE.md': 'Use 2 spaces for indentation.\n',
  });
  assert.ok(r.findings.some((f) => f.message.includes('indent with')));
});

test('detects duplicated content between different files', () => {
  const body = Array.from(
    { length: 8 },
    (_, i) => `- Rule number ${i} that is long enough to count.`,
  ).join('\n');
  const r = run({
    'AGENTS.md': `# A\n${body}\n`,
    'CLAUDE.md': `# B\n${body}\nExtra line only here for B.\n`,
  });
  assert.ok(r.findings.some((f) => f.rule === 'duplicated-content'));
});

test(
  'byte-identical files and symlinks collapse into one',
  { skip: process.platform === 'win32' },
  () => {
    const root = makeRepo({
      'AGENTS.md': '# Same\n`npm run nope`\n',
      'package.json': PKG,
      'CLAUDE.md': '# Same\n`npm run nope`\n',
    });
    link(root, 'AGENTS.md', 'GEMINI.md');
    try {
      const r = analyze(root);
      assert.equal(r.files.length, 1);
      assert.deepEqual(r.files[0]?.aliases.sort(), ['CLAUDE.md', 'GEMINI.md']);
      assert.equal(r.findings.filter((f) => f.rule === 'missing-script').length, 1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);

test('flags stale Node and Python versions', () => {
  const node = run({ 'AGENTS.md': 'Requires Node 16.\n', '.nvmrc': 'v22\n' });
  assert.ok(node.findings.some((f) => f.rule === 'stale-version'));
  const ok = run({ 'AGENTS.md': 'Requires Node 22.\n', '.nvmrc': 'v22\n' });
  assert.deepEqual(rulesOf(ok), []);
  const eng = run({
    'AGENTS.md': 'Use Node 20.\n',
    'package.json': JSON.stringify({ engines: { node: '>=18' } }),
  });
  assert.deepEqual(
    rulesOf(eng).filter((x) => x === 'stale-version'),
    [],
  );
  const py = run({ 'AGENTS.md': 'Python 3.8 only.\n', '.python-version': '3.12\n' });
  assert.ok(py.findings.some((f) => f.rule === 'stale-version'));
});
