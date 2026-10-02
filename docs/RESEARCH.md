# Research notes and project selection

Snapshot taken 2026-10-02 from GitHub Trending (weekly/monthly), the GitHub API, and HN digests. Star counts are approximate and change daily.

## Projects analysed

| # | Repo | Stars | Created | What spreads it | Gap |
|---|------|------:|---------|-----------------|-----|
| 1 | paperclipai/paperclip | 96k | 2026-03 | Agent management "at work" framing | Needs infra, heavy |
| 2 | vectorize-io/hindsight | 45k | 2025-10 | Agent memory, clear category | Memory content is never verified |
| 3 | mksglu/context-mode | 25k | 2026-02 | Concrete number (context reduction), HN front page | Reduces tool output, not instruction rot |
| 4 | max-sixty/worktrunk | 8.7k | 2025-10 | One painful workflow (parallel worktrees), Rust single binary | Narrow |
| 5 | NVIDIA/SkillSpector | 19k | recent | Security scanner for agent skills | Security only, not correctness |
| 6 | pbakaus/impeccable | 74k | 2025-11 | Design language for AI UIs | Prompt content, not a tool |
| 7 | heygen-com/hyperframes | 56k | 2026-03 | "Write HTML, render video", visual demo | Different domain |
| 8 | trycua/cua | 28k | 2025-01 | Computer-use drivers/benchmarks | Heavy |
| 9 | google/ax | 13k | 2026-03 | Agent orchestration runtime | Big-vendor |
| 10 | agentsmd/agents.md | 25k | 2025 | A simple open format | A format with no verifier |
| 11 | google-labs-code/design.md | 28k | 2026 | Format for agents | Same: no verifier |
| 12 | VoltAgent/awesome-design-md | 119k | 2026 | Copy-paste instruction files | Copies rot immediately |
| 13 | alirezarezvani/claude-skills | 27k | 2025-10 | Large skill collection | Quality unverified |
| 14 | agent-sh/agnix | 0.4k | 2026 | Linter for CLAUDE.md/AGENTS.md/SKILL.md | Validates structure, not truth |
| 15 | MrLesk/Backlog.md | 6.9k | 2025 | Humans+agents in git | Different problem |
| 16 | pablostanley/yoinks | 3.3k | 2026-07 | One-purpose terminal tool, fast star growth | Different domain |

## Patterns

1. Agent infrastructure dominates trending (skills, memory, context, orchestration).
2. Repo-level instruction files (AGENTS.md, CLAUDE.md, SKILL.md, DESIGN.md) are now a de-facto standard.
3. Winners have one concrete number or visual in the first screen and a one-line install.
4. HN pain point: verification is the bottleneck, and agents get confused as context rots.
5. Nothing checks whether instruction files are *still true*. Linters check shape.

## Candidate ideas (10)

| Idea | Verdict |
|------|---------|
| **agentrot**: verify claims in AGENTS.md/CLAUDE.md against the repo | **Chosen**: deterministic, no API, instant demo, real pain, small maintenance surface |
| Git-worktree manager for agents | Exists (worktrunk), crowded |
| Agent memory store | Crowded, needs embeddings/infra |
| LLM proxy of free providers | Legal/ToS risk, infra |
| Skill security scanner | NVIDIA owns the space |
| Terminal video downloader | Gray-area, crowded |
| MCP server directory | Curation work, not a tool |
| Token-cost profiler for a repo's agent context | Folded into agentrot (token budget rule) |
| Prompt/skill A/B eval harness | Needs paid APIs to be useful |
| Local-first agent session log viewer | Plausible, but heavy UI and vendor-format churn |

## Why agentrot

- Problem is real and growing: more people hand agents a hand-written instruction file, and it rots when scripts, paths and tooling change.
- Differentiated from agnix and SkillSpector: it checks *truth against the repo*, not format or security.
- Runs offline, zero runtime dependencies, deterministic output, CI friendly.
- Immediate demo: run it on any repo and it prints concrete wrong lines.
