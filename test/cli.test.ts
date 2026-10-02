import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { PKG, makeRepo } from './helpers.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const cli = path.join(root, 'dist', 'src', 'cli.js');
const demo = path.join(root, 'examples', 'rotted-repo');

function cliRun(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

test('exits 1 and prints findings for the rotted demo repo', () => {
  const r = cliRun(demo, '--no-color');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /missing-script/);
  assert.match(r.stdout, /Grounded:/);
});

test('--fail-on none exits 0; json output is valid', () => {
  assert.equal(cliRun(demo, '--fail-on', 'none').status, 0);
  const j = JSON.parse(cliRun(demo, '--format', 'json').stdout);
  assert.ok(j.findings.length > 5);
  assert.equal(typeof j.claims.checked, 'number');
});

test('github format emits workflow annotations', () => {
  assert.match(cliRun(demo, '--format', 'github').stdout, /^::error file=AGENTS\.md,line=\d+/m);
});

test('a clean repo exits 0', () => {
  const dir = makeRepo({
    'AGENTS.md': 'Run `npm test`.\nRun `npm run build`.\n',
    'package.json': PKG,
  });
  try {
    const r = cliRun(dir, '--no-color');
    assert.equal(r.status, 0);
    assert.match(r.stdout, /No problems found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a repo without instruction files exits 0 with guidance', () => {
  const dir = makeRepo({ 'README.md': '# hi\n' });
  try {
    const r = cliRun(dir);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /No agent instruction files found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('usage errors exit 2', () => {
  assert.equal(cliRun('--bogus').status, 2);
  assert.equal(cliRun('/definitely/not/here').status, 2);
  assert.equal(cliRun('--format', 'xml').status, 2);
});

test('--version and --rules work', () => {
  assert.match(cliRun('--version').stdout, /^\d+\.\d+\.\d+/);
  assert.match(cliRun('--rules').stdout, /missing-path/);
});
