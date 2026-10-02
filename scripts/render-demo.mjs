// Renders real agentrot output to an SVG "terminal screenshot" for the README.
// Usage: node scripts/render-demo.mjs   (run `npm run build` first)
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const cli = path.join(root, 'dist', 'src', 'cli.js');
const outDir = path.join(root, 'docs', 'assets');
mkdirSync(outDir, { recursive: true });

const ESC = String.fromCharCode(27);
const SGR = new RegExp(`(${ESC}\\[[0-9;]*m)`);
const SGR_ONE = new RegExp(`^${ESC}\\[([0-9;]*)m$`);
const COLORS = { 31: '#ff7b72', 32: '#7ee787', 33: '#e3b341', 34: '#79c0ff' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function ansiToSvg(command, ansi) {
  const lines = [
    {
      plain: `$ ${command}`,
      spans: [
        { t: '$ ', c: '#7ee787' },
        { t: command, c: '#e6edf3' },
      ],
    },
  ];
  for (const raw of ansi.replace(/\n$/, '').split('\n')) {
    const spans = [];
    let state = { c: '#c9d1d9', b: false, d: false, u: false };
    let plain = '';
    for (const part of raw.split(SGR)) {
      const m = SGR_ONE.exec(part);
      if (m) {
        for (const code of m[1].split(';').map(Number)) {
          if (code === 0) state = { c: '#c9d1d9', b: false, d: false, u: false };
          else if (code === 1) state.b = true;
          else if (code === 2) state.d = true;
          else if (code === 4) state.u = true;
          else if (COLORS[code]) state.c = COLORS[code];
        }
      } else if (part) {
        spans.push({ t: part, c: state.d ? '#8b949e' : state.c, b: state.b, u: state.u });
        plain += part;
      }
    }
    lines.push({ plain, spans });
  }
  const fs = 14;
  const cw = fs * 0.6;
  const lh = 21;
  const cols = Math.max(...lines.map((l) => [...l.plain].length), 60);
  const width = Math.ceil(cols * cw + 56);
  const height = lines.length * lh + 76;
  const body = lines
    .map((l, i) => {
      const y = 62 + i * lh;
      const tspans = l.spans
        .map(
          (s) =>
            `<tspan fill="${s.c}"${s.b ? ' font-weight="700"' : ''}${s.u ? ' text-decoration="underline"' : ''}>${esc(s.t)}</tspan>`,
        )
        .join('');
      return `<text x="24" y="${y}" textLength="${Math.round([...l.plain].length * cw * 100) / 100}" lengthAdjust="spacing" xml:space="preserve">${tspans}</text>`;
    })
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Terminal output of: ${esc(command)}">
  <rect width="${width}" height="${height}" rx="10" fill="#0d1117"/>
  <rect width="${width}" height="34" rx="10" fill="#161b22"/>
  <rect y="24" width="${width}" height="10" fill="#161b22"/>
  <circle cx="20" cy="17" r="6" fill="#ff5f56"/><circle cx="40" cy="17" r="6" fill="#ffbd2e"/><circle cx="60" cy="17" r="6" fill="#27c93f"/>
  <g font-family="ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace" font-size="${fs}">
  ${body}
  </g>
</svg>
`;
}

function render(name, args) {
  const r = spawnSync(process.execPath, [cli, 'rotted-repo', ...args], {
    cwd: path.join(root, 'examples'),
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '1', NO_COLOR: '' },
  });
  if (r.status !== 1) throw new Error(`unexpected exit ${r.status}: ${r.stderr}`);
  const shown = ['npx agentrot', ...args].join(' ');
  writeFileSync(path.join(outDir, name), ansiToSvg(shown, r.stdout));
  console.log(`wrote docs/assets/${name}`);
}

render('demo.svg', ['--compact']);
render('demo-full.svg', []);
