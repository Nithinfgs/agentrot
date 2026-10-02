#!/usr/bin/env node
import { readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyze } from './engine.js';
import {
  type Format,
  counts,
  renderGithub,
  renderJson,
  renderMarkdown,
  renderText,
} from './report.js';
import { RULES } from './rules/index.js';
import type { Severity } from './types.js';

const HELP = `agentrot - find the rot in your AGENTS.md / CLAUDE.md

Usage: agentrot [dir] [options]

Checks every path, script, tool and version your agent instruction files
mention against the actual repository. Runs offline; no API keys.

Options:
  -f, --format <fmt>   text (default) | json | github | markdown
      --fail-on <lvl>  error (default) | warn | info | none
  -c, --config <file>  config file (default: .agentrotrc.json in dir)
      --compact        one line per finding (no evidence or hints)
      --no-color       disable colors
      --rules          list all rules
  -v, --version
  -h, --help

Exit codes: 0 clean, 1 findings at or above --fail-on, 2 usage or runtime error.
Suppress a finding with <!-- agentrot-ignore [rule-id] --> on or above the line.`;

function version(): string {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(path.join(here, '..', '..', 'package.json'), 'utf8')) as {
      version: string;
    };
    return pkg.version;
  } catch {
    return 'unknown';
  }
}

function fail(msg: string): never {
  process.stderr.write(`agentrot: ${msg}\n`);
  process.exit(2);
}

function main(argv: string[]): void {
  let dir = '.';
  let format: Format = 'text';
  let failOn: Severity | 'none' = 'error';
  let config: string | undefined;
  let compact = false;
  let color = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') color = true;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? '';
    const next = () => argv[++i] ?? fail(`${a} requires a value`);
    switch (a) {
      case '-h':
      case '--help':
        process.stdout.write(`${HELP}\n`);
        return;
      case '-v':
      case '--version':
        process.stdout.write(`${version()}\n`);
        return;
      case '--rules':
        for (const r of RULES) process.stdout.write(`${r.id.padEnd(26)}${r.description}\n`);
        return;
      case '-f':
      case '--format': {
        const v = next();
        if (!['text', 'json', 'github', 'markdown'].includes(v)) fail(`unknown format "${v}"`);
        format = v as Format;
        break;
      }
      case '--fail-on': {
        const v = next();
        if (!['error', 'warn', 'info', 'none'].includes(v)) fail(`unknown --fail-on level "${v}"`);
        failOn = v as Severity | 'none';
        break;
      }
      case '-c':
      case '--config':
        config = next();
        break;
      case '--compact':
        compact = true;
        break;
      case '--no-color':
        color = false;
        break;
      default:
        if (a.startsWith('-')) fail(`unknown option "${a}" (see --help)`);
        dir = a;
    }
  }

  const root = path.resolve(dir);
  try {
    if (!statSync(root).isDirectory()) fail(`${dir} is not a directory`);
  } catch {
    fail(`cannot read directory "${dir}"`);
  }

  let report: ReturnType<typeof analyze>;
  try {
    report = analyze(root, config);
  } catch (e) {
    fail((e as Error).message);
  }

  const v = version();
  const text =
    format === 'json'
      ? renderJson(report, v)
      : format === 'github'
        ? renderGithub(report)
        : format === 'markdown'
          ? renderMarkdown(report)
          : renderText(report, v, color, compact);
  if (text) process.stdout.write(`${text}\n`);

  const k = counts(report.findings);
  const hit =
    failOn === 'none'
      ? 0
      : failOn === 'error'
        ? k.error
        : failOn === 'warn'
          ? k.error + k.warn
          : report.findings.length;
  process.exitCode = hit > 0 ? 1 : 0;
}

main(process.argv.slice(2));
