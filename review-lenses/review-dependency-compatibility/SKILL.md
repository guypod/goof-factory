---
name: review-dependency-compatibility
description: Review dependency, lockfile, and bundled-asset changes for compatibility, provenance, advisory relevance, and consistency with the runtime. Use as one lens in a code review run.
---

# Review lens: Dependency Compatibility

Review changes to dependency manifests, lockfiles, generated browser bundles, dependency-update workflows, or code that relies on changed dependency APIs.

## Scope

- **Advisory relevance:** Whether a security dependency update changes the package and resolved version that the advisory actually names.
- **Manifest and lock consistency:** Whether package.json, package-lock.json, and generated bundles reflect the same dependency graph.
- **Runtime compatibility:** Whether the update still works with the repository's Node, npm, MongoDB, Express, and browser-bundle assumptions.
- **Provenance:** Whether new packages, package sources, or workflow actions come from expected registries and pinned or trusted references.

## Method

Start at the package or workflow file that changed. Follow it to the lockfile entry, generated bundle, require/import site, install command, and route or test that exercises the changed API. For an advisory fix, compare the advisory package path with the installed package path that changed.

## Threshold

Report a change when a dependency fix does not affect the vulnerable package path it claims to fix, when manifest and lockfile disagree, when generated bundle contents drift from source dependencies, when a new dependency source is untrusted or unpinned, or when the changed package is incompatible with normal app routes.

Do not report source-code remediation gaps, missing route regression tests, or unrelated vulnerable packages that the pull request does not claim to fix. Keep independent root causes in separate pull requests unless a tightly coupled upgrade requires them together and explains why.

## Reporting

- Name the dependency, version, source, advisory path, or file pair that creates the risk.
- State the affected runtime path or bundle output.
- State the install, scan, route, or focused test that would confirm compatibility.
