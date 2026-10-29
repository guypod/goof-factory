#!/usr/bin/env node
'use strict';

// Regression for GHSA-69rr-wvh9-6c4q / CVE-2014-3744 (st directory traversal).
// Mounts st the way app.js does, but on a disposable fixture directory, and
// sends raw request paths over loopback so no client normalizes them.

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const express = require('express');
const st = require('st');

const MARKER = 'tessl-outside-marker-' + process.pid + '-' + Date.now();
const ASSET = 'legitimate public asset\n';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'st-traversal-'));
const publicDir = path.join(root, 'public');
fs.mkdirSync(path.join(publicDir, 'css'), { recursive: true });
fs.writeFileSync(path.join(publicDir, 'hello.txt'), ASSET);
fs.writeFileSync(path.join(publicDir, 'css', 'site.css'), 'body { color: black; }\n');
fs.writeFileSync(path.join(root, 'outside-marker.txt'), MARKER);

const app = express();
app.use(st({ path: publicDir, url: '/public' }));
app.use((req, res) => res.status(404).send('not found'));

function get(server, rawPath) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: server.address().port,
      method: 'GET',
      path: rawPath
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, body: Buffer.concat(chunks).toString() }));
    });
    req.on('error', reject);
    req.end();
  });
}

function assertNoLeak(res, rawPath) {
  assert.ok(res.body.indexOf(MARKER) === -1, rawPath + ' leaked the outside marker');
  assert.ok(res.status >= 400, rawPath + ' should be rejected, got ' + res.status);
}

const tests = {
  async 'serves a legitimate public asset'(server) {
    const res = await get(server, '/public/hello.txt');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body, ASSET);
  },

  async 'serves a nested public asset'(server) {
    const res = await get(server, '/public/css/site.css');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.indexOf('body') === 0);
  },

  async 'missing public asset is 404'(server) {
    const res = await get(server, '/public/does-not-exist.txt');
    assert.strictEqual(res.status, 404);
  },

  async 'advisory encoded traversal does not leak outside file'(server) {
    const rawPath = '/public/%2e%2e/outside-marker.txt';
    assertNoLeak(await get(server, rawPath), rawPath);
  },

  async 'uppercase and mixed encoded traversal does not leak outside file'(server) {
    for (const rawPath of [
      '/public/%2E%2E/outside-marker.txt',
      '/public/.%2e/outside-marker.txt',
      '/public/%2e%2e%2foutside-marker.txt',
      '/public/css/%2e%2e/%2e%2e/outside-marker.txt'
    ]) {
      assertNoLeak(await get(server, rawPath), rawPath);
    }
  }
};

async function main() {
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  let failed = 0;
  try {
    for (const [name, fn] of Object.entries(tests)) {
      try {
        await fn(server);
        console.log('ok - ' + name);
      } catch (err) {
        failed++;
        console.log('not ok - ' + name + '\n  ' + err.message);
      }
    }
  } finally {
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  }
  if (failed) {
    console.log(failed + ' test(s) failed');
    process.exit(1);
  }
  console.log('all ' + Object.keys(tests).length + ' tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
