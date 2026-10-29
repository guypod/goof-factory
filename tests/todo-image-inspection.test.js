#!/usr/bin/env node
'use strict';

// Exercises routes/index.js create() with a stubbed child_process boundary.
// Nothing is executed and no network is contacted.

const assert = require('assert');
const path = require('path');
const childProcess = require('child_process');

const saved = [];

function FakeTodo(doc) {
  this.content = doc.content;
}
FakeTodo.prototype.save = function (cb) {
  saved.push(this.content);
  cb(null, { content: Buffer.from(String(this.content)) }, 1);
};

// Stub mongoose before loading routes so no database is needed.
const mongoosePath = require.resolve('mongoose');
require.cache[mongoosePath] = {
  id: mongoosePath,
  filename: mongoosePath,
  loaded: true,
  exports: { model: () => FakeTodo }
};

const calls = { exec: [], execFile: [] };
let execFileBehavior = (cb) => cb(null, '', '');
childProcess.exec = function () {
  calls.exec.push(Array.from(arguments));
};
childProcess.execFile = function (file, args, options, cb) {
  calls.execFile.push({ file, args, options });
  execFileBehavior(cb);
};

const originalLog = console.log;
console.log = () => {};
const routes = require(path.join(__dirname, '..', 'routes', 'index.js'));

function create(content) {
  calls.exec.length = 0;
  calls.execFile.length = 0;
  saved.length = 0;
  const res = {
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    send(body) { this.body = body; }
  };
  let nextErr;
  routes.create({ body: { content } }, res, (err) => { nextErr = err; });
  assert.strictEqual(nextErr, undefined, 'create should not call next with an error');
  assert.strictEqual(res.statusCode, 302, 'create should redirect');
  assert.strictEqual(res.headers.Location, '/');
  assert.strictEqual(calls.exec.length, 0, 'child_process.exec must never be used');
  return res;
}

function image(url) {
  return '![alt text](' + url + ' "title")';
}

function assertSingleDataArg(url) {
  assert.strictEqual(calls.execFile.length, 1, 'identify should run once');
  const call = calls.execFile[0];
  assert.strictEqual(call.file, 'identify');
  assert.deepStrictEqual(call.args, [url], 'URL must be one unchanged argument');
  assert.strictEqual(call.options.shell, false, 'shell must be disabled');
  assert.ok(call.options.timeout > 0, 'subprocess must have a timeout');
  assert.ok(call.options.maxBuffer > 0, 'subprocess output must be bounded');
}

const tests = {
  'normal image URL is inspected through execFile'() {
    const url = 'https://example.test/cat.png';
    create(image(url));
    assertSingleDataArg(url);
    assert.deepStrictEqual(saved, [image(url)], 'todo content is saved unchanged');
  },

  'already percent-encoded URL is passed unchanged'() {
    const url = 'http://example.test/a%20b%2Fc.png?q=%3B%7C';
    create(image(url));
    assertSingleDataArg(url);
  },

  'shell metacharacters stay inside a single data argument'() {
    const url = 'https://example.test/x.png;touch${IFS}/tmp/pwned|id&`id`$(id)';
    create(image(url));
    assertSingleDataArg(url);
  },

  'URL with whitespace is rejected without running identify'() {
    create(image('https://example.test/x.png; rm -rf /tmp/x'));
    assert.strictEqual(calls.execFile.length, 0);
    assert.strictEqual(saved.length, 1, 'todo is still saved');
  },

  'URL with control characters is rejected'() {
    create(image('https://example.test/x.png\tfoo'));
    assert.strictEqual(calls.execFile.length, 0);
  },

  'malformed or non-http URL is rejected'() {
    create(image('http//not-a-url'));
    assert.strictEqual(calls.execFile.length, 0);
    create(image('httpx://example.test/a.png'));
    assert.strictEqual(calls.execFile.length, 0);
  },

  'non-image Markdown text is saved without inspection'() {
    create('see https://example.test/page');
    assert.strictEqual(calls.execFile.length, 0);
    assert.deepStrictEqual(saved, ['see https://example.test/page']);
  },

  'process error is handled and the todo is still saved'() {
    execFileBehavior = (cb) => cb(new Error('identify: no decode delegate'), '', 'bad image');
    try {
      create(image('https://example.test/not-an-image.txt'));
    } finally {
      execFileBehavior = (cb) => cb(null, '', '');
    }
    assert.strictEqual(saved.length, 1);
  },

  'process timeout is handled and the todo is still saved'() {
    execFileBehavior = (cb) => {
      const err = new Error('Command failed: identify');
      err.killed = true;
      err.signal = 'SIGKILL';
      cb(err, '', '');
    };
    try {
      create(image('https://example.test/slow.png'));
    } finally {
      execFileBehavior = (cb) => cb(null, '', '');
    }
    assert.strictEqual(saved.length, 1);
  },

  'plain text todo is unchanged and runs no process'() {
    create('buy milk');
    assert.strictEqual(calls.execFile.length, 0);
    assert.deepStrictEqual(saved, ['buy milk']);
  },

  'plain text reminder parsing is unchanged'() {
    create('call mom in 2 hours');
    assert.strictEqual(calls.execFile.length, 0);
    assert.deepStrictEqual(saved, ['call mom [2h]']);
  }
};

let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try {
    fn();
    originalLog('ok - ' + name);
  } catch (err) {
    failed++;
    originalLog('not ok - ' + name + '\n  ' + err.message);
  }
}
if (failed) {
  originalLog(failed + ' test(s) failed');
  process.exit(1);
}
originalLog('all ' + Object.keys(tests).length + ' tests passed');
