---
name: review-remediation-correctness
description: Review source-code vulnerability fixes for whether they address the validated root cause without hiding evidence, removing intended demo behavior, or weakening regression coverage. Use as one lens in a code review run.
---

# Review lens: Remediation Correctness

Review source-code changes that claim to fix a validated security behavior in the Goof demo application.

## Scope

- **Validated dataflow:** Whether the change explains the actual untrusted input, sensitive operation, and path between them.
- **Root-cause fix:** Whether the vulnerable behavior is removed, constrained, or made safe at the right boundary instead of only renamed, hidden, or suppressed.
- **Regression proof:** Whether tests or scan evidence would fail before the fix and pass after it for the same root cause.
- **Preserved demo behavior:** Whether normal todo create, edit, delete, display, and documented non-malicious feature behavior still work.

## Method

Start from the changed source path, validation, process boundary, or test. Trace backward to the user-controlled input and forward to the operation it can influence. Compare the claimed before/after evidence with the path the changed code actually exercises.

## Threshold

Report a change when the validated source-code issue can still occur, when the fix only suppresses the scanner or removes the feature rather than making it safe, when the evidence does not exercise the fixed path, or when the remediation breaks core todo behavior.

Do not report dependency version problems, lockfile drift, generic formatting failures, or unrelated audit warnings: those belong to dependency or deterministic checks. Do not require adding cookie Domain; missing Domain can be safer. Account for defaults such as express-session httpOnly when judging whether a cookie hardening change is real.

## Reporting

- Name the source, sink or sensitive operation, and code path the change claims to fix.
- State the remaining vulnerable path, missing evidence, suppression, or behavior regression.
- State the smallest regression test or scan evidence that would prove the fix.
