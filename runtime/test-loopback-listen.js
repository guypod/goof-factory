#!/usr/bin/env node
'use strict';

const assert = require('assert');
const http = require('http');

const calls = [];
http.Server.prototype.listen = function fakeOriginalListen(...args) {
  calls.push(args);
  return this;
};

process.env.PORT = '3009';
require('./loopback-listen');

function lastCall() {
  assert(calls.length > 0, 'expected listen call');
  return calls[calls.length - 1];
}

let server = new http.Server();
server.listen(3007, function onListen() {});
assert.strictEqual(lastCall()[0], 3007, 'numeric port is preserved');
assert.strictEqual(lastCall()[1], '127.0.0.1', 'numeric port binds loopback');
assert.strictEqual(typeof lastCall()[2], 'function', 'numeric port callback is preserved');

server = new http.Server();
server.listen('3008', function onListen() {});
assert.strictEqual(lastCall()[0], 3008, 'numeric string port is normalized');
assert.strictEqual(lastCall()[1], '127.0.0.1', 'numeric string port binds loopback');
assert.strictEqual(typeof lastCall()[2], 'function', 'numeric string callback is preserved');

server = new http.Server();
server.listen(function onListen() {});
assert.strictEqual(lastCall()[0], 3009, 'callback-only listen uses env port');
assert.strictEqual(lastCall()[1], '127.0.0.1', 'callback-only listen binds loopback');

server = new http.Server();
assert.throws(() => server.listen(70000), /Refusing to start server/, 'numeric port above 65535 is rejected');
assert.throws(() => server.listen('70000'), /Refusing to start server/, 'numeric string port above 65535 is rejected');
assert.throws(() => server.listen('not-a-port'), /Refusing to start server/, 'non-numeric string port is rejected');
assert.throws(() => server.listen('/tmp/app.sock'), /Refusing to start server/, 'unix socket listen is rejected');
assert.throws(() => server.listen({ port: 3007 }), /Refusing to start server/, 'options listen is rejected');
assert.throws(() => server.listen(3007, '0.0.0.0'), /Refusing to start server/, 'explicit non-loopback host signature is rejected');

process.env.PORT = '70000';
server = new http.Server();
assert.throws(() => server.listen(function onListen() {}), /invalid PORT/, 'invalid default env port is rejected');
process.env.PORT = '3009';

console.log('loopback listen tests passed');
