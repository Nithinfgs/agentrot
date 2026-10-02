import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PKG, rulesOf, run } from './helpers.js';

test('flags a path that does not exist and suggests the real one', () => {
  const r = run({
    'AGENTS.md': 'Helpers are in `src/utils/format.ts`.\n',
    'src/lib/format.ts': '',
  });
  const f = r.findings.find((x) => x.rule === 'missing-path');
  assert.ok(f);
  assert.equal(f.line, 1);
  assert.match(f.hint ?? '', /src\/lib\/format\.ts/);
});

test('accepts existing paths, suffix paths, directories and links', () => {
  const r = run({
    'AGENTS.md':
      'See `src/lib/format.ts`, `lib/format.ts`, `src/lib/`, [guide](docs/guide.md#top) and `package.json`.\n',
    'src/lib/format.ts': '',
    'docs/guide.md': '',
    'package.json': PKG,
  });
  assert.deepEqual(
    rulesOf(r).filter((x) => x === 'missing-path'),
    [],
  );
  assert.ok(r.stats.verified >= 5);
});

test('ignores prose, urls, globs, placeholders, framework names and generated output', () => {
  const r = run({
    'AGENTS.md': [
      'Uses `Next.js`, `client/server`, `https://example.com/a.md`, `src/**/*.ts`,',
      '`<file>.ts`, `dist/index.js`, `.env.local`, `@types/node` and `read/write`.',
    ].join('\n'),
  });
  assert.deepEqual(rulesOf(r), []);
});

test('skips lines that create things or say never/avoid', () => {
  const r = run({
    'AGENTS.md': 'Create `src/new/thing.ts` for new features.\nNever use `src/old/legacy.ts`.\n',
  });
  assert.deepEqual(rulesOf(r), []);
});

test('flags unresolved @imports but accepts resolvable ones', () => {
  const r = run({
    'AGENTS.md': 'Read @docs/missing.md and @docs/there.md\n',
    'docs/there.md': '',
  });
  const f = r.findings.filter((x) => x.rule === 'missing-import');
  assert.equal(f.length, 1);
  assert.match(f[0]?.message ?? '', /missing\.md/);
});

test('does not treat code-fence tree listings as path claims', () => {
  const r = run({ 'AGENTS.md': '```\nsrc/ghost/file.ts\n```\n' });
  assert.deepEqual(rulesOf(r), []);
});

test('skips hedged, gitignored and non-directory slash strings', () => {
  const r = run({
    'AGENTS.md':
      'See `docs/maybe.md` (if exists), `tmp/scratch/out.txt`, `origin/main` and `owner/repo`.\n',
    '.gitignore': 'tmp/\n',
  });
  assert.deepEqual(rulesOf(r), []);
});

test('SKILL.md files only get secret/import checks by default', () => {
  const files = {
    'skills/x/SKILL.md': 'Run `scripts/ghost.py` and `npm run nope`.\n',
    'scripts/real.py': '',
    'package.json': PKG,
  };
  assert.deepEqual(rulesOf(run(files)), []);
  assert.ok(rulesOf(run(files, { checkSkills: true })).includes('missing-path'));
});
