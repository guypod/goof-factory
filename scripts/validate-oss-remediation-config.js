#!/usr/bin/env node
const fs = require('fs');
const assert = require('assert');

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new assert.AssertionError({
      message: `${label} must be strict JSON content: ${error.message}`
    });
  }
}

function parseDependabot(text) {
  return parseJson(text, 'Dependabot config');
}

function parseWorkflow(text) {
  return parseJson(text, 'OSS remediation workflow');
}

function assertNoGroups(value) {
  if (!value || typeof value !== 'object') return;
  assert(!Object.prototype.hasOwnProperty.call(value, 'groups'), 'Do not group unrelated dependency fixes');
  for (const nested of Object.values(value)) {
    if (nested && typeof nested === 'object') assertNoGroups(nested);
  }
}

function assertUpdateShape(update) {
  assert(update && typeof update === 'object' && !Array.isArray(update), 'Dependabot update entries must be objects');
  assert.strictEqual(typeof update['package-ecosystem'], 'string', 'Dependabot update entries must name a package ecosystem');
  assert.strictEqual(update.directory, '/', `${update['package-ecosystem']} Dependabot update must target repository root`);
  assert(update.schedule && typeof update.schedule === 'object' && !Array.isArray(update.schedule), `${update['package-ecosystem']} Dependabot update must define a schedule`);
  assert.strictEqual(typeof update.schedule.interval, 'string', `${update['package-ecosystem']} Dependabot update must define a schedule interval`);
  assert.strictEqual(typeof update['open-pull-requests-limit'], 'number', `${update['package-ecosystem']} Dependabot update must define a numeric PR cap`);
}

function assertDependabotConfig(text) {
  const config = parseDependabot(text);
  assert.strictEqual(config.version, 2, 'Dependabot version must be 2');
  assert(Array.isArray(config.updates), 'Dependabot updates must be an array');
  assertNoGroups(config);

  for (const update of config.updates) assertUpdateShape(update);

  const ecosystems = config.updates.map((update) => update['package-ecosystem']);
  assert.deepStrictEqual([...ecosystems].sort(), ['github-actions', 'npm'], 'Dependabot must contain exactly one npm update and one github-actions update');

  const npm = config.updates.find((update) => update['package-ecosystem'] === 'npm');
  const actions = config.updates.find((update) => update['package-ecosystem'] === 'github-actions');
  assert.strictEqual(npm.schedule.interval, 'daily', 'Dependabot npm update must run daily');
  assert.strictEqual(npm['open-pull-requests-limit'], 3, 'Dependabot npm PR cap must remain low');
  assert.strictEqual(actions.schedule.interval, 'daily', 'Dependabot github-actions update must run daily');
  assert.strictEqual(actions['open-pull-requests-limit'], 2, 'Dependabot github-actions PR cap must remain low');
}

function workflowSteps(workflow) {
  assert(workflow && typeof workflow === 'object' && !Array.isArray(workflow), 'Workflow must be a JSON object');
  assert(workflow.on && typeof workflow.on === 'object' && !Array.isArray(workflow.on), 'Workflow must define triggers');
  assert(Object.prototype.hasOwnProperty.call(workflow.on, 'workflow_dispatch'), 'Workflow must support manual validation');
  assert(Array.isArray(workflow.on.schedule), 'Workflow must define a schedule array');
  assert(workflow.on.schedule.some((entry) => entry && entry.cron === '17 8 * * *'), 'Workflow cadence must be daily');
  assert(workflow.permissions && workflow.permissions.contents === 'read', 'Workflow contents permission must remain read-only');
  assert(workflow.jobs && typeof workflow.jobs === 'object' && !Array.isArray(workflow.jobs), 'Workflow must define jobs');

  const steps = [];
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    assert(job && typeof job === 'object' && !Array.isArray(job), `Workflow job ${jobName} must be an object`);
    assert(Array.isArray(job.steps), `Workflow job ${jobName} must define steps`);
    for (const step of job.steps) {
      assert(step && typeof step === 'object' && !Array.isArray(step), `Workflow job ${jobName} steps must be objects`);
      steps.push(step);
    }
  }
  return steps;
}

function assertPinnedAction(steps, action) {
  const matches = steps.filter((step) => typeof step.uses === 'string' && step.uses.startsWith(`${action}@`));
  assert(matches.length > 0, `${action} action must be used`);
  for (const step of matches) {
    const ref = step.uses.slice(action.length + 1);
    assert(/^[0-9a-f]{40}$/i.test(ref), `${action} action must be pinned to a full 40-hex commit SHA`);
  }
}

function stepText(steps) {
  return steps.map((step) => Object.values(step).filter((value) => typeof value === 'string').join('\n')).join('\n');
}

function validateWorkflowConfig(text) {
  const workflow = parseWorkflow(text);
  const steps = workflowSteps(workflow);
  const textFromSteps = stepText(steps);

  assertPinnedAction(steps, 'actions/checkout');
  assertPinnedAction(steps, 'actions/upload-artifact');
  assert(textFromSteps.includes('semgrep==1.92.0'), 'Semgrep CLI version must be pinned');
  assert(textFromSteps.includes('setuptools==80.9.0'), 'Pinned Semgrep requires pkg_resources compatibility');
  assert(textFromSteps.includes('.semgrep-venv/bin/semgrep --disable-version-check --version'), 'Verify scanner starts before running scans');
  assert(textFromSteps.includes('--metrics=off'), 'Semgrep metrics must be off');
  assert(textFromSteps.includes('routes app.js mongoose-db.js typeorm-db.js utils.js service public'), 'Semgrep workflow must scan scoped production source paths, not the whole repo');
  assert(textFromSteps.includes('--error'), 'Semgrep must fail on findings/errors');
  assert(!text.includes('SEMGREP_APP_TOKEN'), 'Workflow must not use Semgrep service token');
  assert(!text.includes('SNYK_TOKEN'), 'Workflow must not use Snyk service');
  assert(!text.includes('returntocorp/semgrep-action'), 'Workflow must not use Semgrep service action');
  assert(!textFromSteps.includes(' .\n'), 'Workflow must not scan the whole repository root');
  assert(steps.some((step) => step.with && step.with['if-no-files-found'] === 'error'), 'Missing scan artifacts must fail');
}

function validateOssRemediationConfig({ dependabot, semgrep, workflow }) {
  assertDependabotConfig(dependabot);

  assert(semgrep.includes('mode: taint'), 'Semgrep shell interpolation rule must remain taint-mode');
  assert(semgrep.includes('req.body.content'), 'Semgrep source must target request-controlled todo content');
  assert(semgrep.includes("exec('identify ' + $URL"), 'Semgrep sink must target identify exec interpolation');
  assert(!semgrep.includes('nosemgrep'), 'No suppression-only baseline');

  validateWorkflowConfig(workflow);
}

if (require.main === module) {
  validateOssRemediationConfig({
    dependabot: fs.readFileSync('.github/dependabot.yml', 'utf8'),
    semgrep: fs.readFileSync('.semgrep.yml', 'utf8'),
    workflow: fs.readFileSync('.github/workflows/oss-remediation-scan.yml', 'utf8')
  });
  console.log('OSS remediation configuration checks passed');
}

module.exports = { validateOssRemediationConfig };
