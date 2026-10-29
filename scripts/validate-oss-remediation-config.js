#!/usr/bin/env node
const fs = require('fs');
const assert = require('assert');

const dependabot = fs.readFileSync('.github/dependabot.yml', 'utf8');
assert(dependabot.includes('package-ecosystem: npm'), 'Dependabot must be configured for npm');
assert(dependabot.includes('interval: daily'), 'Dependabot must run daily');
assert(dependabot.includes('open-pull-requests-limit: 3'), 'Dependabot PR cap must remain low');
assert(!dependabot.includes('groups:'), 'Do not group unrelated dependency fixes');

const semgrep = fs.readFileSync('.semgrep.yml', 'utf8');
assert(semgrep.includes('mode: taint'), 'Semgrep shell interpolation rule must remain taint-mode');
assert(semgrep.includes('req.body.content'), 'Semgrep source must target request-controlled todo content');
assert(semgrep.includes("exec('identify ' + $URL"), 'Semgrep sink must target identify exec interpolation');
assert(!semgrep.includes('nosemgrep'), 'No suppression-only baseline');

const workflow = fs.readFileSync('.github/workflows/oss-remediation-scan.yml', 'utf8');
assert(workflow.includes('workflow_dispatch:'), 'Workflow must support manual validation');
assert(workflow.includes("cron: '17 8 * * *'"), 'Workflow cadence must be daily');
assert(workflow.includes('actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683'), 'checkout action must be pinned');
assert(workflow.includes('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02'), 'upload-artifact action must be pinned');
assert(workflow.includes('semgrep==1.92.0'), 'Semgrep CLI version must be pinned');
assert(workflow.includes('setuptools==80.9.0'), 'Pinned Semgrep requires pkg_resources compatibility');
assert(workflow.includes('.semgrep-venv/bin/semgrep --disable-version-check --version'), 'Verify scanner starts before running scans');
assert(workflow.includes('--metrics=off'), 'Semgrep metrics must be off');
assert(workflow.includes('routes app.js mongoose-db.js typeorm-db.js utils.js service public'), 'Semgrep workflow must scan scoped production source paths, not the whole repo');
assert(workflow.includes('--error'), 'Semgrep must fail on findings/errors');
assert(!workflow.includes('SEMGREP_APP_TOKEN'), 'Workflow must not use Semgrep service token');
assert(!workflow.includes('SNYK_TOKEN'), 'Workflow must not use Snyk service');
assert(!workflow.includes('returntocorp/semgrep-action'), 'Workflow must not use Semgrep service action');
assert(!workflow.includes(' .\n'), 'Workflow must not scan the whole repository root');
assert(workflow.includes('if-no-files-found: error'), 'Missing scan artifacts must fail');

console.log('OSS remediation configuration checks passed');
