export type Severity = 'error' | 'warn' | 'info';

export interface Finding {
  rule: string;
  severity: Severity;
  /** Repo-relative, posix-style path of the instruction file. */
  file: string;
  /** 1-based line number. */
  line: number;
  message: string;
  /** The offending text, when there is one. */
  evidence?: string;
  hint?: string;
}

export interface Item {
  text: string;
  line: number;
  /** Full source line, used for context heuristics. */
  context: string;
}

export interface ParsedDoc {
  inlineCodes: Item[];
  commandLines: Item[];
  links: Item[];
  imports: Item[];
  /** Lines outside code fences, for prose checks. */
  proseLines: Item[];
}

export interface InstructionFile {
  /** Repo-relative posix path. */
  path: string;
  kind: 'instructions' | 'skill';
  dir: string;
  content: string;
  tokens: number;
  doc: ParsedDoc;
  /** Other files that are byte-identical or symlinks to this one. */
  aliases: string[];
}

export interface Config {
  ignore: string[];
  ignorePaths: string[];
  maxTokens: number;
  maxTotalTokens: number;
  files: string[];
  /** Run path/command checks on SKILL.md files too (off by default: they reference bundled resources). */
  checkSkills: boolean;
}

export interface Stats {
  checked: number;
  verified: number;
}

export interface Rule {
  id: string;
  description: string;
  run(ctx: Context): Finding[];
}

export interface Context {
  root: string;
  /** Files that get the full rule set. */
  files: InstructionFile[];
  /** SKILL.md files: only secrets, imports and links are checked. */
  skills: InstructionFile[];
  project: import('./project.js').Project;
  config: Config;
  stats: Stats;
}
