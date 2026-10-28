'use strict';

const http = require('http');
const originalListen = http.Server.prototype.listen;

function isNumericPort(value) {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0 && value <= 65535;
  if (typeof value !== 'string') return false;
  if (!/^[0-9]+$/.test(value)) return false;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 65535;
}

function normalizePort(value, label) {
  if (!isNumericPort(value)) {
    throw new Error(`Refusing to start server with invalid ${label || 'port'}: ${value}`);
  }
  return typeof value === 'number' ? value : Number(value);
}

http.Server.prototype.listen = function patchedListen(...args) {
  const defaultPort = normalizePort(process.env.PORT || 3001, 'PORT');

  if (args.length === 0) {
    return originalListen.call(this, defaultPort, '127.0.0.1');
  }

  if (args.length === 1 && typeof args[0] === 'function') {
    return originalListen.call(this, defaultPort, '127.0.0.1', args[0]);
  }

  if (isNumericPort(args[0])) {
    const port = normalizePort(args[0], 'listen port');
    if (args.length === 1) {
      return originalListen.call(this, port, '127.0.0.1');
    }
    if (args.length === 2 && typeof args[1] === 'function') {
      return originalListen.call(this, port, '127.0.0.1', args[1]);
    }
    if (args.length === 2 && typeof args[1] === 'number') {
      return originalListen.call(this, port, '127.0.0.1', args[1]);
    }
    if (args.length === 3 && typeof args[1] === 'number' && typeof args[2] === 'function') {
      return originalListen.call(this, port, '127.0.0.1', args[1], args[2]);
    }
  }

  throw new Error(`Refusing to start server without an explicit loopback bind for listen(${args.map((arg) => typeof arg).join(', ')})`);
};
