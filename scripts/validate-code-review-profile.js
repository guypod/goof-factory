#!/usr/bin/env node
const fs = require('fs');
const assert = require('assert');

function parseFrontmatter(text, file) {
  assert(text.startsWith('---\n'), `${file} missing frontmatter`);
  const end = text.indexOf('\n---\n', 4);
  assert(end > 0, `${file} unterminated frontmatter`);
  const data = {};
  for (const line of text.slice(4, end).split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (m) data[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return data;
}

function parseProfile(text) {
  const refs = [];
  const ignores = [];
  for (const line of text.split('\n')) {
    let m = line.match(/^\s*- ref:\s*(\S+)\s*$/);
    if (m) refs.push(m[1]);
    m = line.match(/^\s*- (.+)$/);
    if (m && !m[1].startsWith('ref:') && refs.length === 0) ignores.push(m[1].replace(/^['"]|['"]$/g, ''));
  }
  return { refs, ignores };
}

const profileText = fs.readFileSync('.tessl-code-review.yml', 'utf8');
const { refs, ignores } = parseProfile(profileText);
const expected = [
  'tessl/code-review@0.5.0#review-correctness-and-data-integrity',
  'tessl/code-review@0.5.0#review-security-and-privacy',
  'tessl/code-review@0.5.0#review-maintainability-and-code-quality',
  'tessl/code-review@0.5.0#review-scale-and-resilience',
  './review-lenses/review-remediation-correctness/SKILL.md',
  './review-lenses/review-dependency-compatibility/SKILL.md',
  './review-lenses/review-demo-automation-isolation/SKILL.md'
];
assert.deepStrictEqual(refs, expected, 'profile must preserve four standard lenses then three focused lenses');
assert(profileText.includes('schemaVersion: 1'), 'profile schemaVersion must be 1');
assert(profileText.includes('requestChangesAt: major'), 'profile must keep major threshold');
assert(!ignores.includes('.tessl/**'), 'profile must not globally ignore all .tessl runtime config');
assert(ignores.includes('.tessl/plugins/**'), 'profile should ignore managed plugin cache');
assert(ignores.includes('.agents/**'), 'profile should ignore managed agent links');

for (const ref of refs.filter((r) => r.startsWith('./'))) {
  const file = ref.replace(/^\.\//, '');
  assert(fs.existsSync(file), `local lens missing: ${file}`);
  const text = fs.readFileSync(file, 'utf8');
  const meta = parseFrontmatter(text, file);
  const dir = file.split('/').at(-2);
  assert.strictEqual(meta.name, dir, `${file} frontmatter name must match directory`);
  for (const section of ['## Scope', '## Method', '## Threshold', '## Reporting']) {
    assert(text.includes(section), `${file} missing ${section}`);
  }
  assert(!text.includes('/home/agent/.codex/sessions'), `${file} must not reference private session paths`);
}

console.log('Code review profile and focused lens checks passed');
