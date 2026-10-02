import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PKG, rulesOf, run } from './helpers.js';

test('flags oversized files against the token budget', () => {
  const r = run({ 'AGENTS.md': `${'word '.repeat(400)}\n` }, { maxTokens: 100 });
  assert.ok(r.findings.some((f) => f.rule === 'context-bloat'));
});

test('flags vague filler but not concrete rules', () => {
  const r = run({ 'AGENTS.md': 'Write clean code.\nPublic APIs need a doc comment.\n' });
  assert.deepEqual(rulesOf(r), ['vague-rule']);
});

test('flags credential-like strings and masks them in the output', () => {
  const fake = `ghp_${'a1B2c3D4e5'.repeat(4)}`;
  const r = run({ 'AGENTS.md': `token: ${fake}\n` });
  const f = r.findings.find((x) => x.rule === 'secret-exposure');
  assert.ok(f);
  assert.ok(!f.evidence?.includes(fake));
});

test('placeholder passwords are not secrets', () => {
  const r = run({ 'AGENTS.md': 'password: <your-password>\nsecret = $SECRET\n' });
  assert.deepEqual(rulesOf(r), []);
});

test('reports package.json scripts the instructions never mention', () => {
  const r = run({ 'AGENTS.md': 'Run `npm run build`.\n', 'package.json': PKG });
  const f = r.findings.find((x) => x.rule === 'undocumented-command');
  assert.ok(f);
  assert.match(f.message, /"test"/);
});

test('config ignore and inline suppression work', () => {
  const files = {
    'AGENTS.md': 'Write clean code.\n<!-- agentrot-ignore missing-path -->\n`nope/x.ts`\n',
  };
  assert.deepEqual(rulesOf(run(files, { ignore: ['vague-rule'] })), []);
  const r = run({ 'AGENTS.md': '<!-- agentrot-ignore -->\nWrite clean code.\n' });
  assert.deepEqual(rulesOf(r), []);
});

test('ignorePaths excludes files from the scan', () => {
  const r = run({ 'examples/AGENTS.md': '`nope/x.ts`\n' }, { ignorePaths: ['examples/**'] });
  assert.equal(r.files.length, 0);
});
