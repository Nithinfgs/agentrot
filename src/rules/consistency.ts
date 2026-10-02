import type { Context, Finding, InstructionFile, Rule } from '../types.js';
import { pmUses } from './commands.js';

function overlaps(a: InstructionFile, b: InstructionFile): boolean {
  return (
    a.dir === b.dir ||
    a.dir === '' ||
    b.dir === '' ||
    a.dir.startsWith(`${b.dir}/`) ||
    b.dir.startsWith(`${a.dir}/`)
  );
}

function indentStyle(f: InstructionFile): { style: 'tabs' | 'spaces'; line: number } | undefined {
  for (const l of f.doc.proseLines) {
    if (
      /\b(?:use|prefer|indent(?:ation)?(?: with)?)\s+tabs\b/i.test(l.text) &&
      !/not\s+tabs/i.test(l.text)
    )
      return { style: 'tabs', line: l.line };
    if (
      /\b(?:use|prefer|indent(?:ation)?(?: with)?)\s+(?:\d\s+)?spaces\b|\b\d[- ]space indent/i.test(
        l.text,
      ) &&
      !/not\s+spaces/i.test(l.text)
    )
      return { style: 'spaces', line: l.line };
  }
  return undefined;
}

export const conflictingInstructions: Rule = {
  id: 'conflicting-instructions',
  description: 'Instruction files (or one file) tell the agent to do incompatible things.',
  run(ctx) {
    const out: Finding[] = [];
    const uses = ctx.files.map((f) => ({ f, uses: pmUses(f) }));

    for (const { f, uses: u } of uses) {
      const pms = [...new Set(u.map((x) => x.pm))];
      if (pms.length > 1) {
        const second = u.find((x) => x.pm !== u[0]?.pm);
        out.push({
          rule: 'conflicting-instructions',
          severity: 'warn',
          file: f.path,
          line: second?.line ?? 1,
          message: `Mixes package managers: ${pms.join(', ')}`,
          hint: 'Pick one; agents will pick whichever they read last.',
        });
      }
    }
    for (let i = 0; i < uses.length; i++) {
      for (let j = i + 1; j < uses.length; j++) {
        const a = uses[i];
        const b = uses[j];
        if (!a || !b || !overlaps(a.f, b.f)) continue;
        const pa = new Set(a.uses.map((x) => x.pm));
        const pb = new Set(b.uses.map((x) => x.pm));
        if (pa.size !== 1 || pb.size !== 1) continue;
        const [x] = pa;
        const [y] = pb;
        if (x && y && x !== y) {
          out.push({
            rule: 'conflicting-instructions',
            severity: 'warn',
            file: b.f.path,
            line: b.uses[0]?.line ?? 1,
            message: `Uses ${y}, but ${a.f.path} (line ${a.uses[0]?.line}) uses ${x}`,
            hint: 'Both files are read by agents. Keep one source of truth.',
          });
        }
      }
    }
    for (let i = 0; i < ctx.files.length; i++) {
      for (let j = i + 1; j < ctx.files.length; j++) {
        const a = ctx.files[i];
        const b = ctx.files[j];
        if (!a || !b || !overlaps(a, b)) continue;
        const ia = indentStyle(a);
        const ib = indentStyle(b);
        if (ia && ib && ia.style !== ib.style) {
          out.push({
            rule: 'conflicting-instructions',
            severity: 'warn',
            file: b.path,
            line: ib.line,
            message: `Says to indent with ${ib.style}, but ${a.path} (line ${ia.line}) says ${ia.style}`,
          });
        }
      }
    }
    return out;
  },
};

function normalizedLines(f: InstructionFile): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of f.doc.proseLines) {
    const t = l.text.trim().toLowerCase().replace(/\s+/g, ' ');
    if (t.length >= 25 && !t.startsWith('#') && !m.has(t)) m.set(t, l.line);
  }
  return m;
}

export const duplicatedContent: Rule = {
  id: 'duplicated-content',
  description:
    'Two instruction files repeat the same lines, so agents load them twice and they drift apart.',
  run(ctx) {
    const out: Finding[] = [];
    const lines = ctx.files.map((f) => ({ f, lines: normalizedLines(f) }));
    for (let i = 0; i < lines.length; i++) {
      for (let j = i + 1; j < lines.length; j++) {
        const a = lines[i];
        const b = lines[j];
        if (!a || !b || !overlaps(a.f, b.f)) continue;
        const shared = [...b.lines.keys()].filter((k) => a.lines.has(k));
        if (shared.length < 6) continue;
        const chars = shared.reduce((n, k) => n + k.length, 0);
        out.push({
          rule: 'duplicated-content',
          severity: 'warn',
          file: b.f.path,
          line: b.lines.get(shared[0] ?? '') ?? 1,
          message: `${shared.length} lines (~${Math.ceil(chars / 4)} tokens) are also in ${a.f.path}`,
          hint: `Keep one file and symlink or @import it: \`ln -sf ${a.f.path} ${b.f.path}\``,
        });
      }
    }
    return out;
  },
};

export const staleVersion: Rule = {
  id: 'stale-version',
  description:
    'The Node or Python version named in the instructions disagrees with the repo config.',
  run(ctx: Context) {
    const out: Finding[] = [];
    const node = ctx.project.nodeRequirement;
    const py = ctx.project.pythonMin;
    for (const f of ctx.files) {
      for (const l of f.doc.proseLines) {
        if (/\b(don'?t|never|avoid|instead of|legacy|migrat)/i.test(l.text)) continue;
        const nm = /\bnode(?:\.js)?\s*(?:v|version\s*|>=\s*)?(\d{2})\b/i.exec(l.text);
        if (nm && node) {
          const claim = Number(nm[1]);
          ctx.stats.checked++;
          const bad = node.kind === 'exact' ? claim !== node.major : claim < node.major;
          if (!bad) ctx.stats.verified++;
          else {
            out.push({
              rule: 'stale-version',
              severity: 'warn',
              file: f.path,
              line: l.line,
              message: `Says Node ${claim}, but the repo requires ${node.kind === 'exact' ? '' : '>= '}${node.major}`,
              evidence: l.text.trim(),
              hint: 'Check .nvmrc / .node-version / engines.node.',
            });
          }
        }
        const pm = /\bpython\s*(3)\.(\d+)\b/i.exec(l.text);
        if (pm && py) {
          const minor = Number(pm[2]);
          ctx.stats.checked++;
          if (minor >= py[1]) ctx.stats.verified++;
          else {
            out.push({
              rule: 'stale-version',
              severity: 'warn',
              file: f.path,
              line: l.line,
              message: `Says Python 3.${minor}, but the repo requires >= ${py[0]}.${py[1]}`,
              evidence: l.text.trim(),
              hint: 'Check .python-version / requires-python.',
            });
          }
        }
      }
    }
    return out;
  },
};
