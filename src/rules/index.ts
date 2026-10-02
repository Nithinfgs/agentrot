import type { Rule } from '../types.js';
import { missingManifest, missingScript, missingTool, packageManagerMismatch } from './commands.js';
import { conflictingInstructions, duplicatedContent, staleVersion } from './consistency.js';
import { bloat, secrets, undocumentedCommand, vagueRule } from './hygiene.js';
import { missingImport, missingPath } from './references.js';

export const RULES: Rule[] = [
  missingPath,
  missingImport,
  missingScript,
  missingManifest,
  packageManagerMismatch,
  missingTool,
  staleVersion,
  conflictingInstructions,
  duplicatedContent,
  bloat,
  secrets,
  vagueRule,
  undocumentedCommand,
];
