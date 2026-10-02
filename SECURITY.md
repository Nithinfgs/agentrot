# Security policy

## Supported versions

Only the latest release receives fixes.

## Reporting a vulnerability

Please do **not** open a public issue. Use GitHub's private vulnerability reporting: **Security → Report a vulnerability** on this repository.

Include what you found, how to reproduce it, and the impact. You should get a response within a week.

## Threat model

agentrot reads local files and prints a report. It makes no network requests, executes no code from the repositories it scans, and has no runtime dependencies. Relevant issues include path traversal outside the scanned directory, unsafe handling of crafted Markdown (for example catastrophic regex backtracking), and secrets echoed in output (credential-like strings are masked in findings).
