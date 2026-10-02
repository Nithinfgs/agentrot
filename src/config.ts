import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { Config } from './types.js';

export const DEFAULT_CONFIG: Config = {
  ignore: [],
  ignorePaths: [],
  maxTokens: 3000,
  maxTotalTokens: 6000,
  files: [],
  checkSkills: false,
};

export function loadConfig(root: string, explicit?: string): Config {
  const file = explicit ? path.resolve(explicit) : path.join(root, '.agentrotrc.json');
  if (!existsSync(file)) {
    if (explicit) throw new Error(`Config file not found: ${explicit}`);
    return { ...DEFAULT_CONFIG };
  }
  let raw: Partial<Config>;
  try {
    raw = JSON.parse(readFileSync(file, 'utf8')) as Partial<Config>;
  } catch (e) {
    throw new Error(`Could not parse ${path.basename(file)}: ${(e as Error).message}`);
  }
  const cfg = { ...DEFAULT_CONFIG, ...raw };
  for (const k of ['ignore', 'ignorePaths', 'files'] as const) {
    if (!Array.isArray(cfg[k]) || cfg[k].some((v) => typeof v !== 'string')) {
      throw new Error(`${path.basename(file)}: "${k}" must be an array of strings`);
    }
  }
  for (const k of ['maxTokens', 'maxTotalTokens'] as const) {
    if (typeof cfg[k] !== 'number' || cfg[k] <= 0) {
      throw new Error(`${path.basename(file)}: "${k}" must be a positive number`);
    }
  }
  return cfg;
}

/** Minimal glob: `**` matches across directories, `*` within one segment. */
export function globToRegExp(glob: string): RegExp {
  const re = glob
    .split(/(\*\*\/|\*\*|\*)/)
    .map((part) => {
      if (part === '**/') return '(?:.*/)?';
      if (part === '**') return '.*';
      if (part === '*') return '[^/]*';
      return part.replace(/[.+^${}()|[\]\\?]/g, '\\$&');
    })
    .join('');
  return new RegExp(`^${re}$`);
}
