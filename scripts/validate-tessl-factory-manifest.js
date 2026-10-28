#!/usr/bin/env node
const fs = require('fs');
const assert = require('assert');

const manifest = JSON.parse(fs.readFileSync('tessl.json', 'utf8'));
const REPO_ID = 1437575754;
const OWNER_ID = 1106394;
const REVIEWER_BOT_ID = 325629464;
const TESSL_APP_BOT_ID = 295179765;

function get(obj, path) {
  const parts = path.split('.');
  function step(cur, index) {
    if (cur == null) return undefined;
    if (index >= parts.length) return cur;
    const part = parts[index];
    if (part === '*') {
      if (!Array.isArray(cur)) return undefined;
      return cur.map((entry) => step(entry, index + 1));
    }
    if (/^\d+$/.test(part)) return step(cur[Number(part)], index + 1);
    return step(cur[part], index + 1);
  }
  return step(obj, 0);
}

function matchesCondition(actual, cond) {
  if (cond && typeof cond === 'object' && !Array.isArray(cond)) {
    if ('any' in cond) {
      assert(Array.isArray(actual), `any requires an array, got ${typeof actual}`);
      return actual.some((entry) => matchesCondition(entry, cond.any));
    }
    if ('equals' in cond) return actual === cond.equals;
    if ('in' in cond) return cond.in.includes(actual);
    if ('matches' in cond) return typeof actual === 'string' && new RegExp(cond.matches).test(actual);
    if ('exists' in cond) return cond.exists ? actual !== undefined && actual !== null : actual === undefined || actual === null;
    if ('not' in cond) return !matchesCondition(actual, cond.not);
    throw new Error(`Unsupported condition ${JSON.stringify(cond)}`);
  }
  return actual === cond;
}

function eligible(triggerName, event) {
  const trigger = manifest.triggers[triggerName];
  assert(trigger, `missing trigger ${triggerName}`);
  return Object.entries(trigger.when || {}).every(([path, cond]) => matchesCondition(get(event, path), cond));
}

function labels(names) {
  return names.map((name) => ({ name }));
}

function baseReviewEvent(overrides = {}) {
  return {
    event: {
      repository: { id: REPO_ID },
      sender: { id: OWNER_ID },
      pull_request: {
        state: 'open',
        labels: labels(['tessl']),
        head: { ref: 'tessl/issue-1', repo: { id: REPO_ID } },
        number: 1
      }
    },
    ...overrides
  };
}

function deepMerge(target, patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      target[key] = deepMerge(target[key] || {}, value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function reviewEvent(patch = {}) {
  return deepMerge(baseReviewEvent(), patch);
}

function issueLabelEvent(patch = {}) {
  return deepMerge({
    event: {
      repository: { id: REPO_ID },
      sender: { id: OWNER_ID },
      label: { name: 'tessl' },
      issue: { state: 'open', number: 1 }
    }
  }, patch);
}

function check(name, expected, actual) {
  assert.strictEqual(actual, expected, `${name}: expected ${expected}, got ${actual}`);
}

// Owner can start implementation by applying the label in this exact repo.
check('owner label starts implement', true, eligible('github-issue-labelled', issueLabelEvent()));
check('outsider label cannot start implement', false, eligible('github-issue-labelled', issueLabelEvent({ event: { sender: { id: 42 } } })));
check('wrong repo label cannot start implement', false, eligible('github-issue-labelled', issueLabelEvent({ event: { repository: { id: 999 } } })));

for (const trigger of ['shepherd-pr-review', 'shepherd-pr-review-comment']) {
  check(`${trigger}: owner feedback eligible`, true, eligible(trigger, reviewEvent({ event: { sender: { id: OWNER_ID } } })));
  check(`${trigger}: Tessl reviewer bot feedback eligible`, true, eligible(trigger, reviewEvent({ event: { sender: { id: REVIEWER_BOT_ID } } })));
  check(`${trigger}: outsider feedback rejected`, false, eligible(trigger, reviewEvent({ event: { sender: { id: 42 } } })));
  check(`${trigger}: tessl app bot rejected`, false, eligible(trigger, reviewEvent({ event: { sender: { id: TESSL_APP_BOT_ID } } })));
  check(`${trigger}: wrong repository rejected`, false, eligible(trigger, reviewEvent({ event: { repository: { id: 999 } } })));
  check(`${trigger}: fork PR rejected`, false, eligible(trigger, reviewEvent({ event: { pull_request: { head: { repo: { id: 999 } } } } })));
  check(`${trigger}: non-tessl branch rejected`, false, eligible(trigger, reviewEvent({ event: { pull_request: { head: { ref: 'feature/not-tessl' } } } })));
  check(`${trigger}: missing tessl label rejected`, false, eligible(trigger, reviewEvent({ event: { pull_request: { labels: labels(['bug']) } } })));
}

// Check-result triggers remain repo and same-head-repo guarded, but senderless.
assert.strictEqual(manifest.triggers['shepherd-checks-failed'].when['event.sender.id'], undefined, 'check_run trigger must stay senderless');
assert.strictEqual(manifest.triggers['shepherd-checks-passed'].when['event.sender.id'], undefined, 'check_suite trigger must stay senderless');

console.log('Tessl factory manifest guard tests passed');
