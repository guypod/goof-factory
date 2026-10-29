#!/usr/bin/env node
'use strict';

// Renders /about_new through routes/index.js and the hbs engine the way
// app.js wires them, with mongoose stubbed so no database is needed.

const assert = require('assert');
const http = require('http');
const path = require('path');
const express = require('express');
const hbs = require('hbs');

const mongoosePath = require.resolve('mongoose');
require.cache[mongoosePath] = {
  id: mongoosePath,
  filename: mongoosePath,
  loaded: true,
  exports: { model: () => function () {} }
};

const routes = require(path.join(__dirname, '..', 'routes'));

const app = express();
app.engine('ejs', require('ejs-locals'));
app.engine('hbs', hbs.__express);
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view engine', 'ejs');
app.get('/about_new', routes.about_new);

function get(server, rawPath) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: server.address().port, path: rawPath }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        type: res.headers['content-type'],
        body: Buffer.concat(chunks).toString()
      }));
    }).on('error', reject);
  });
}

const tests = {
  async 'renders title, subhead and copy'(server) {
    const res = await get(server, '/about_new?device=Desktop');
    assert.strictEqual(res.status, 200);
    assert.ok(/text\/html/.test(res.type));
    assert.ok(res.body.includes('<h1 id="page-title">Patch TODO List</h1>'));
    assert.ok(res.body.includes('<h2 id="page-title">Vulnerabilities at their best</h2>'));
    assert.ok(res.body.includes('The BESTest todo app evar'));
  },

  async 'Desktop device gets the desktop body style'(server) {
    const res = await get(server, '/about_new?device=Desktop');
    assert.ok(res.body.includes('<body style="font-size: medium; text-align: center;">'));
    assert.ok(!res.body.includes('font-size: x-large'));
    assert.ok(res.body.includes('Device string (debug): Desktop</div>'));
  },

  async 'other device gets the mobile body style'(server) {
    const res = await get(server, '/about_new?device=Mobile');
    assert.ok(res.body.includes('<body style="font-size: x-large; text-align: center;">'));
    assert.ok(!res.body.includes('font-size: medium'));
    assert.ok(res.body.includes('Device string (debug): Mobile</div>'));
  },

  async 'missing device defaults to mobile style and empty debug string'(server) {
    const res = await get(server, '/about_new');
    assert.strictEqual(res.status, 200);
    assert.ok(res.body.includes('font-size: x-large'));
    assert.ok(res.body.includes('Device string (debug): </div>'));
  },

  async 'device text is HTML-escaped'(server) {
    const res = await get(server, '/about_new?device=' + encodeURIComponent('Tom & Jerry "tab"'));
    assert.ok(res.body.includes('Device string (debug): Tom &amp; Jerry &quot;tab&quot;</div>'));
  },

  async 'page is standalone, without the hbs layout'(server) {
    const res = await get(server, '/about_new?device=Desktop');
    assert.strictEqual((res.body.match(/<html>/g) || []).length, 1);
    assert.ok(!res.body.includes('id="layout"'));
  }
};

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  let failed = 0;
  for (const [name, fn] of Object.entries(tests)) {
    try {
      await fn(server);
      console.log('ok - ' + name);
    } catch (err) {
      failed++;
      console.log('not ok - ' + name + '\n  ' + err.message);
    }
  }
  server.close();
  if (failed) process.exit(1);
})();
