# Launch kit (drafts, not posted)

Nothing here has been posted anywhere. Edit to taste, post under your own account, and reply to feedback yourself. Do not post to several communities at the same minute.

## Hacker News (Show HN)

**Title:** Show HN: agentrot – find stale claims in your AGENTS.md / CLAUDE.md

**Text:**

Coding agents trust the instruction file at the root of your repo. Those files rot: the script gets renamed, the team moves from npm to pnpm, someone pastes a template that says `cargo test` into a Node project. The agent follows it anyway.

agentrot checks that these files are true rather than well-formed. It extracts every path, `@import`, npm/pnpm/yarn script, make target, tool and Node/Python version the file mentions and verifies it against package.json, lockfiles, the Makefile, .nvmrc and the file tree. It also flags conflicting files (CLAUDE.md says yarn, AGENTS.md says npm), duplicated lines that get loaded twice, token bloat, and committed secrets.

It's a deterministic, offline Node CLI with zero runtime dependencies, so it runs in CI next to your linter: `npx github:Nithinfgs/agentrot`. Exit code 1 on errors, GitHub annotations output.

I tuned the heuristics against a handful of public repos to cut false positives (it skips negations, "e.g." lines, gitignored paths, SKILL.md bundled resources), but it will still be wrong sometimes. The false-positive issue template is the thing I most want to see. Repo: https://github.com/Nithinfgs/agentrot

## Reddit (r/ClaudeAI, r/ChatGPTCoding, r/programming: check each sub's self-promo rules first)

**Title:** I wrote a linter that checks whether your AGENTS.md / CLAUDE.md is still true

**Body:**

Problem: agent instruction files get written once and then drift. I kept finding `npm run lint` in files for repos with no lint script, wrong package managers, paths that moved, and the same 40 lines duplicated in CLAUDE.md and AGENTS.md (so they load twice).

What it does: reads the instruction files, pulls out every file path, script, tool and version, and checks each against the actual repo. No LLM, no network. Output ends with "Grounded: 28 of 28 checkable claims match the repo".

How: Markdown → claims with line numbers, repo facts from package.json/lockfiles/Makefile/.nvmrc, 13 small rules. Zero runtime deps, MIT.

Feedback I want: lines it flags wrongly (or misses) in your own repos, and which ecosystems to add next (Gradle? Taskfile? uv?). Repo: https://github.com/Nithinfgs/agentrot

## X / Twitter

**Short:**
Your AGENTS.md says `npm run lint`. Your repo has no lint script.

agentrot checks every path, script and tool in your agent instruction files against the real repo. Offline, no LLM, CI-friendly.

npx github:Nithinfgs/agentrot

**Technical:**
agentrot: deterministic checks for AGENTS.md / CLAUDE.md. Parses Markdown into claims (paths, @imports, scripts, make/just targets, tools, Node/Python versions), resolves them against package.json, lockfiles, Makefile, .nvmrc and a file index. Zero runtime deps, exit codes + GitHub annotations. https://github.com/Nithinfgs/agentrot

**Thread:**
1/ Agent instruction files (AGENTS.md, CLAUDE.md, Cursor rules) are read at the start of every session and trusted completely. They also rot.
2/ Common rot: a script that no longer exists, `npm install` in a pnpm repo, a path that moved, `cargo test` pasted from a template into a Node project.
3/ Existing linters check that the file is well-formed. agentrot checks that it is *true*, by verifying each claim against the repo.
4/ It also finds conflicting files, duplicated lines loaded twice, over-budget token counts, and API keys pasted into instructions.
5/ Deterministic and offline, so it fits in CI. Heuristics skip negations and examples, but it can be wrong. False-positive reports welcome: https://github.com/Nithinfgs/agentrot

## LinkedIn

I kept running into the same small failure with AI coding agents: the instruction file at the repo root was wrong. It told the agent to run a lint script that no longer existed, or to use npm in a pnpm repo, or pointed at a directory that had moved. The agent believed it every time.

So I wrote agentrot, a small CLI that checks those files against the repository. It pulls out every path, script, tool and version mentioned in AGENTS.md / CLAUDE.md and verifies it against package.json, lockfiles, the Makefile and the file tree. No LLM, no network, so it can run in CI.

The part I found most useful was not the dead paths, it was the duplication: the same 40 lines in two files that both get loaded into every session.

It is open source (MIT) and the heuristics are deliberately conservative, but they are not perfect. If you have an instruction file it gets wrong, I would like to see it: https://github.com/Nithinfgs/agentrot

## GitHub

- **Description:** Find stale claims in your AGENTS.md / CLAUDE.md: verifies paths, scripts, tools and versions against the repo. Offline, no LLM.
- **Topics:** `agents-md`, `claude-md`, `ai-agents`, `coding-agents`, `claude-code`, `linter`, `developer-tools`, `cli`, `typescript`, `context-engineering`
