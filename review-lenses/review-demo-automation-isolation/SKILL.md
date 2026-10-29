---
name: review-demo-automation-isolation
description: Review changes for whether the intentionally vulnerable public demo, Tessl factory automation, and OSS remediation loop stay isolated to guypod/goof-factory without broadening access, deployment, or execution from untrusted input. Use as one lens in a code review run.
---

# Review lens: Demo and Automation Isolation

Review changes that affect repository automation, factory configuration, GitHub workflows, scanner configuration, environment setup, deployment paths, or instructions for running the Goof demo.

## Scope

- **Repository boundary:** Whether automation is bound to `guypod/goof-factory` and cannot affect upstream, another fork, or another experiment.
- **External input boundary:** Whether issue comments, review comments, scanner output, or workflow inputs are treated as data rather than executable instructions.
- **Access boundary:** Whether tokens, environments, GitHub Apps, and workflows grant only the access needed for this repository's demo and remediation loop.
- **Demo exposure:** Whether the intentionally vulnerable app remains local-only unless a human explicitly chooses otherwise.

## Method

Start from the changed automation, workflow, environment, or instruction. Follow what event can start it, whose identity can start it, what repository it can affect, what branch or ref it can write when the event carries one, what text it reads from outside contributors, and whether it can deploy or expose the vulnerable app.

## Threshold

Report a change when automation can run from arbitrary external comment text, when a trigger lacks exact repository or actor constraints, when a branch-bearing trigger lacks same-repository branch or ref constraints, when write-capable automation lacks explicit write-target constraints, when permissions or secrets broaden beyond this repo's factory/remediation purpose, when scan failures are reported as clean, or when the vulnerable app is intentionally exposed beyond local demo use.

Do not report normal repository-bound read access needed by a scanner or reviewer, a repository-bound pull-request permission used only to create fix PRs, or local-only instructions for disposable demo data.

## Reporting

- Name the event, workflow, environment, or instruction that crosses the boundary.
- State who or what can trigger it and what it can write or expose.
- State the missing repository, actor, branch, permission, failed-run, or local-only guard.
