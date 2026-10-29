#!/usr/bin/env node
'use strict';

// Regression for GHSA-c6rp-wrp9-qr4q / CVE-2021-4264 (Dust compiler prototype
// pollution) and rendering of views/about_new.dust after dustjs-helpers was
// removed. The compiler probe pollutes Object.prototype with an inert marker
// in a separate child process. Rendering goes through routes.about_new with
// the same consolidate Dust engine app.js uses, over loopback only.

const assert = require('assert');
const childProcess = require('child_process');
const http = require('http');
const path = require('path');
const express = require('express');
const cons = require('consolidate');

const MARKER = 'TESSL_INERT_MARK_' + process.pid;

// Stub mongoose before loading routes so no database is needed.
const mongoosePath = require.resolve('mongoose');
require.cache[mongoosePath] = {
  id: mongoosePath,
  filename: mongoosePath,
  loaded: true,
  exports: { model: () => function () {} }
};

const originalLog = console.log;
console.log = () => {};
const routes = require(path.join(__dirname, '..', 'routes', 'index.js'));
console.log = originalLog;

const app = express();
app.engine('dust', cons.dust);
app.set('views', path.join(__dirname, '..', 'views'));
app.get('/about_new', (req, res, next) => {
  const log = console.log;
  console.log = () => {};
  try {
    routes.about_new(req, res, next);
  } finally {
    console.log = log;
  }
});

function compileWithPollutedPrototype() {
  const probe = [
    "const dust = require('dustjs-linkedin');",
    'Object.prototype[process.argv[1]] = "inert";',
    "const src = dust.compile('{username}!', 'probe');",
    'delete Object.prototype[process.argv[1]];',
    'process.stdout.write(JSON.stringify({ src }));'
  ].join('\n');
  const out = childProcess.execFileSync(process.execPath, ['-e', probe, MARKER], {
    cwd: path.join(__dirname, '..'),
    shell: false,
    timeout: 10000
  });
  return JSON.parse(out.toString()).src;
}

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

const DESKTOP_BODY = '<body style="font-size: medium; text-align: center;">';
const OTHER_BODY = '<body style="font-size: x-large; text-align: center;">';

async function render(server, rawPath) {
  const res = await get(server, rawPath);
  assert.strictEqual(res.status, 200, rawPath + ' should render, got ' + res.status + ' ' + res.body);
  assert.ok(res.body.includes('<h1 id="page-title">Patch TODO List</h1>'), 'title should render');
  assert.ok(res.body.includes('<h2 id="page-title">Vulnerabilities at their best</h2>'), 'subhead should render');
  return res.body;
}

const tests = {
  'compiler does not emit inherited Object.prototype keys as blocks'() {
    const src = compileWithPollutedPrototype();
    assert.ok(src.indexOf(MARKER) === -1, 'compiled template contains the polluted prototype key');
  },

  async 'Desktop device uses the desktop body'(server) {
    const body = await render(server, '/about_new?device=Desktop');
    assert.ok(body.includes(DESKTOP_BODY));
    assert.ok(!body.includes(OTHER_BODY));
    assert.ok(body.includes('Device string (debug): Desktop<'));
  },

  async 'non-Desktop device uses the other body'(server) {
    for (const device of ['Mobile', 'desktop', 'Desktop ']) {
      const body = await render(server, '/about_new?device=' + encodeURIComponent(device));
      assert.ok(body.includes(OTHER_BODY), device + ' should not be treated as Desktop');
      assert.ok(!body.includes(DESKTOP_BODY));
    }
  },

  async 'absent device uses the other body'(server) {
    const body = await render(server, '/about_new');
    assert.ok(body.includes(OTHER_BODY));
    assert.ok(!body.includes(DESKTOP_BODY));
    assert.ok(body.includes('Device string (debug): <'));
  },

  async 'markup-like device is HTML escaped'(server) {
    const body = await render(server, '/about_new?device=' + encodeURIComponent('<b>x</b>"\'&'));
    assert.ok(body.includes(OTHER_BODY));
    assert.ok(!body.includes('<b>x</b>'), 'markup must not be rendered raw');
    assert.ok(body.includes('Device string (debug): &lt;b&gt;x&lt;/b&gt;&quot;&#39;&amp;<'));
  },

  async 'array device is not treated as Desktop'(server) {
    const body = await render(server, '/about_new?device[]=Desktop');
    assert.ok(body.includes(OTHER_BODY));
    assert.ok(!body.includes(DESKTOP_BODY));
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
