# Contributing to agentrot

Thanks for helping. The most useful contribution is a **false positive or false negative** with the exact instruction line and the repo facts that contradict (or support) it. Use the issue template.

## Setup

```bash
git clone https://github.com/Nithinfgs/agentrot && cd agentrot
npm install
npm test            # builds, then runs the test suite
npm run lint        # Biome
npm run typecheck
node dist/src/cli.js .   # dogfood: must report no errors
```

Node 18+. There are no runtime dependencies and we want to keep it that way.

## Adding a rule

1. Create or extend a file in `src/rules/` exporting a `Rule` (`id`, `description`, `run(ctx)`).
2. Register it in `src/rules/index.ts`.
3. Use `ctx.project` for facts about the repo and `ctx.stats` to count claims checked and verified.
4. Add tests in `test/`. Every heuristic needs a test for what it must **not** flag, not just what it does.
5. Add a row to the README rules table.

Principles: deterministic, offline, and biased toward missing a problem rather than crying wolf. A noisy rule gets disabled by users, which helps nobody.

## Pull requests

- Keep PRs focused. Conventional-style commit messages (`feat:`, `fix:`, `docs:`, `test:`) are appreciated.
- CI must pass on Linux, macOS and Windows.
- Update `CHANGELOG.md` under "Unreleased".

## Conduct

See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
