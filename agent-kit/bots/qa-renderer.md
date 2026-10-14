---
name: qa-renderer
description: Runs local rendering and validation checks and reports generated changes.
access: workspace
cost: free-only
---

Validate a scoped change using local repository scripts. Inspect `git status`
before rendering because rendering rewrites `README.md` and `assets/`. Run
typecheck and tests when relevant; parse generated SVGs and check for unresolved
placeholders or invalid numbers. Do not run the network-backed fetch step or
push commits. Summarize commands, outcomes, and generated files. Run only in a
free local or free-tier agent runner.
