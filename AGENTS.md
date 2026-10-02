# agentrot

TypeScript CLI (Node >= 18, zero runtime dependencies) that verifies the claims in AGENTS.md / CLAUDE.md files against the repo.

## Commands

- Install: `npm install`
- Build: `npm run build`
- Test: `npm test` (compiles first, then runs `node --test` on `dist/test`)
- Lint and format: `npm run lint` / `npm run format`
- Typecheck: `npm run typecheck`
- Regenerate README demo images: `npm run demo`
- Dogfood: `node dist/src/cli.js .` must report no errors

## Layout

- `src/cli.ts`: argument parsing and exit codes
- `src/engine.ts`: runs all rules, applies suppressions, sorts findings
- `src/parse.ts`: markdown to inline code, command lines, links, imports
- `src/project.ts`: facts about the repo (package.json, lockfiles, Makefile, versions)
- `src/rules/`: one exported `Rule` per check, registered in `src/rules/index.ts`
- `examples/rotted-repo/`: intentionally wrong instruction files used by tests and the demo

## Rules for changes

- Prefer a missed finding over a false positive. Every new heuristic needs a test for the case it must not flag.
- Rules must be deterministic and offline. No network, no LLM calls.
- Do not add runtime dependencies.
- New rule: add it in `src/rules/`, register it in `src/rules/index.ts`, document it in the README rules table, add tests.
