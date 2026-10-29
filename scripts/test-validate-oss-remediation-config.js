#!/usr/bin/env node
const assert = require('assert');
const { validateOssRemediationConfig } = require('./validate-oss-remediation-config');

const fullShaA = '1111111111111111111111111111111111111111';
const fullShaB = '2222222222222222222222222222222222222222';
const alternateShaA = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const alternateShaB = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

const semgrep = `rules:
  - id: shell-interpolation
    mode: taint
    pattern-sources:
      - pattern: req.body.content
    pattern-sinks:
      - pattern: exec('identify ' + $URL
`;

function dependabot(updates) {
  return JSON.stringify({ version: 2, updates }, null, 2);
}

function npmUpdate(interval = 'daily') {
  return {
    'package-ecosystem': 'npm',
    directory: '/',
    schedule: {
      interval,
      time: '09:00',
      timezone: 'Etc/UTC'
    },
    'open-pull-requests-limit': 3,
    'versioning-strategy': 'increase-if-necessary',
    'commit-message': { prefix: 'deps' },
    labels: ['dependencies', 'security-remediation']
  };
}

function actionsUpdate(interval = 'daily', cap = 2) {
  return {
    'package-ecosystem': 'github-actions',
    directory: '/',
    schedule: {
      interval,
      time: '09:30',
      timezone: 'Etc/UTC'
    },
    'open-pull-requests-limit': cap,
    'commit-message': { prefix: 'ci' },
    labels: ['dependencies', 'github-actions']
  };
}

function workflowObject(checkoutSha = fullShaA, uploadSha = fullShaB) {
  return {
    name: 'OSS remediation scan',
    on: {
      workflow_dispatch: {},
      schedule: [{ cron: '17 8 * * *' }]
    },
    permissions: {
      contents: 'read'
    },
    jobs: {
      semgrep: {
        name: 'Semgrep OSS taint baseline',
        'runs-on': 'ubuntu-latest',
        'timeout-minutes': 15,
        steps: [
          {
            name: 'Checkout',
            uses: `actions/checkout@${checkoutSha}`
          },
          {
            name: 'Install pinned Semgrep OSS CLI',
            run: 'echo "uses: actions/checkout@v4 inside run block is not an action"\npython3 -m venv .semgrep-venv\n.semgrep-venv/bin/python -m pip install setuptools==80.9.0 semgrep==1.92.0\n.semgrep-venv/bin/semgrep --disable-version-check --version\n'
          },
          {
            name: 'Run Semgrep JSON evidence',
            id: 'semgrep-json',
            shell: 'bash',
            run: 'set +e\n.semgrep-venv/bin/semgrep scan --disable-version-check --metrics=off --error --config .semgrep.yml --json --output semgrep-results.json routes app.js mongoose-db.js typeorm-db.js utils.js service public\necho "status=$?" >> "$GITHUB_OUTPUT"\nexit 0\n'
          },
          {
            name: 'Run Semgrep SARIF evidence',
            id: 'semgrep-sarif',
            shell: 'bash',
            run: 'set +e\n.semgrep-venv/bin/semgrep scan --disable-version-check --metrics=off --error --config .semgrep.yml --sarif --output semgrep-results.sarif routes app.js mongoose-db.js typeorm-db.js utils.js service public\necho "status=$?" >> "$GITHUB_OUTPUT"\nexit 0\n'
          },
          {
            name: 'Upload scan artifacts',
            if: 'always()',
            uses: `actions/upload-artifact@${uploadSha}`,
            with: {
              name: 'semgrep-oss-results',
              path: 'semgrep-results.json\nsemgrep-results.sarif\n',
              'if-no-files-found': 'error'
            }
          },
          {
            name: 'Fail when Semgrep found issues or failed',
            if: "steps.semgrep-json.outputs.status != '0' || steps.semgrep-sarif.outputs.status != '0'",
            run: 'echo "Semgrep did not return a clean status. Inspect semgrep-oss-results before treating the scan as clean."\nexit 1\n'
          }
        ]
      }
    }
  };
}

function workflow(checkoutSha = fullShaA, uploadSha = fullShaB) {
  return JSON.stringify(workflowObject(checkoutSha, uploadSha), null, 2);
}

function passes(name, config) {
  assert.doesNotThrow(() => validateOssRemediationConfig(config), name);
}

function rejects(name, config, message) {
  assert.throws(() => validateOssRemediationConfig(config), message, name);
}

const baseline = {
  dependabot: dependabot([npmUpdate(), actionsUpdate()]),
  semgrep,
  workflow: workflow()
};

passes('baseline config passes', baseline);

rejects(
  'commented/deactivated npm config rejects even when github-actions is daily',
  {
    ...baseline,
    dependabot: `{
  "version": 2,
  "updates": [
    // {
    //   "package-ecosystem": "npm",
    //   "directory": "/",
    //   "schedule": { "interval": "daily" },
    //   "open-pull-requests-limit": 3
    // },
    ${JSON.stringify(actionsUpdate(), null, 4)}
  ]
}`
  },
  /strict JSON|exactly one npm update/
);

rejects(
  'valid JSON without npm config rejects even when github-actions is daily',
  { ...baseline, dependabot: dependabot([actionsUpdate()]) },
  /exactly one npm update/
);

rejects(
  'npm-only weekly config rejects',
  { ...baseline, dependabot: dependabot([npmUpdate('weekly'), actionsUpdate()]) },
  /npm update must run daily/
);

rejects(
  'github-actions weekly config rejects',
  { ...baseline, dependabot: dependabot([npmUpdate(), actionsUpdate('weekly')]) },
  /github-actions update must run daily/
);

rejects(
  'github-actions cap changes reject',
  { ...baseline, dependabot: dependabot([npmUpdate(), actionsUpdate('daily', 3)]) },
  /github-actions PR cap must remain low/
);

rejects(
  'duplicate npm ecosystem config rejects',
  { ...baseline, dependabot: dependabot([npmUpdate(), npmUpdate(), actionsUpdate()]) },
  /exactly one npm update/
);

rejects(
  'malformed dependabot entry rejects',
  { ...baseline, dependabot: dependabot([npmUpdate(), actionsUpdate(), null]) },
  /entries must be objects/
);

passes('alternate full 40-hex action pins pass', {
  ...baseline,
  workflow: workflow(alternateShaA, alternateShaB)
});

rejects(
  'moving action tags reject even when comments mention full SHAs',
  {
    ...baseline,
    workflow: JSON.stringify({ ...workflowObject('v4', 'v4'), comment: `actions/checkout@${fullShaA} actions/upload-artifact@${fullShaB}` }, null, 2)
  },
  /full 40-hex commit SHA/
);

rejects(
  'unsupported non-JSON commented-only checkout pin rejects',
  {
    ...baseline,
    workflow: `name: OSS remediation scan\n# uses: actions/checkout@${fullShaA}\n`
  },
  /must be strict JSON/
);

rejects(
  'unsupported flow-style YAML action mapping rejects',
  {
    ...baseline,
    workflow: `{name: OSS remediation scan, jobs: {semgrep: {steps: [{uses: actions/checkout@${fullShaA}}]}}}`
  },
  /must be strict JSON/
);

rejects(
  'duplicate unpinned checkout action instance rejects',
  {
    ...baseline,
    workflow: JSON.stringify((() => {
      const candidate = workflowObject(fullShaA, fullShaB);
      candidate.jobs.semgrep.steps.push({ uses: 'actions/checkout@v4' });
      return candidate;
    })(), null, 2)
  },
  /full 40-hex commit SHA/
);

rejects(
  'duplicate unpinned upload-artifact action instance rejects',
  {
    ...baseline,
    workflow: JSON.stringify((() => {
      const candidate = workflowObject(fullShaA, fullShaB);
      candidate.jobs.semgrep.steps.push({ uses: 'actions/upload-artifact@v4' });
      return candidate;
    })(), null, 2)
  },
  /full 40-hex commit SHA/
);

rejects(
  'extra unpinned checkout action rejects even when encoded as a quoted JSON property value',
  {
    ...baseline,
    workflow: JSON.stringify((() => {
      const candidate = workflowObject(fullShaA, fullShaB);
      candidate.jobs.semgrep.steps.push({ name: 'Extra checkout', uses: 'actions/checkout@main' });
      return candidate;
    })(), null, 2)
  },
  /full 40-hex commit SHA/
);

console.log('OSS remediation configuration regression checks passed');
