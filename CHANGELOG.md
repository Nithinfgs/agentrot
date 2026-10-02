# Changelog

All notable changes are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/).

## Unreleased

## 0.1.0 - 2026-10-02

First release.

- 13 rules: `missing-path`, `missing-import`, `missing-script`, `missing-manifest`, `package-manager-mismatch`, `missing-tool`, `stale-version`, `conflicting-instructions`, `duplicated-content`, `context-bloat`, `secret-exposure`, `vague-rule`, `undocumented-command`.
- Scans AGENTS.md, CLAUDE.md, GEMINI.md, Cursor rules, Copilot instructions, `.cursorrules`, `.windsurfrules`, and SKILL.md.
- Output formats: text, json, github annotations, markdown. `--compact`, `--fail-on`.
- `.agentrotrc.json` configuration and inline `<!-- agentrot-ignore -->` suppression.
- Reusable GitHub Action.
