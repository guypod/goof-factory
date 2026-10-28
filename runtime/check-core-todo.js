#!/usr/bin/env node
'use strict';

const http = require('http');
const assert = require('assert');

const port = Number(process.env.PORT || 3007);
const host = '127.0.0.1';
const marker = `factory-core-todo-${Date.now()}`;

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? Buffer.from(body) : null;
    const req = http.request({
      host,
      port,
      path,
      method,
      headers: {
        ...(payload ? {
          'content-type': 'application/x-www-form-urlencoded',
          'content-length': String(payload.length)
        } : {}),
        ...headers
      }
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        statusCode: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.setTimeout(5000, () => {
      req.destroy(new Error(`${method} ${path} timed out`));
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function extractTodoId(html, content) {
  const itemBlocks = html.match(/<div class="item">[\s\S]*?<\/div>/g) || [];
  for (const block of itemBlocks) {
    if (!block.includes(content)) continue;
    const edit = block.match(/href="\/edit\/([a-f0-9]{24})"/i);
    if (edit) return edit[1];
    const destroy = block.match(/href="\/destroy\/([a-f0-9]{24})"/i);
    if (destroy) return destroy[1];
  }
  return null;
}

(async () => {
  const initial = await request('GET', '/');
  assert.strictEqual(initial.statusCode, 200, 'home page should load');

  const created = await request('POST', '/create', `content=${encodeURIComponent(marker)}`);
  assert([200, 302].includes(created.statusCode), `create returned ${created.statusCode}`);

  const afterCreate = await request('GET', '/');
  assert(afterCreate.body.includes(marker), 'created todo should be visible');
  const id = extractTodoId(afterCreate.body, marker);
  assert(id, 'created todo id should be discoverable from rendered item links');

  const updatedText = `${marker}-updated`;
  const updated = await request('POST', `/update/${id}`, `content=${encodeURIComponent(updatedText)}`);
  assert([200, 302].includes(updated.statusCode), `update returned ${updated.statusCode}`);

  const afterUpdate = await request('GET', '/');
  assert(afterUpdate.body.includes(updatedText), 'updated todo should be visible');
  assert(!afterUpdate.body.includes(`${marker}</a>`), 'old todo text should not remain as a rendered item');

  const destroyed = await request('GET', `/destroy/${id}`);
  assert([200, 302].includes(destroyed.statusCode), `destroy returned ${destroyed.statusCode}`);

  const afterDestroy = await request('GET', '/');
  assert(!afterDestroy.body.includes(updatedText), 'deleted todo should be absent');

  console.log(JSON.stringify({ ok: true, coverage: 'core todo create/edit/delete over loopback MongoDB', port }));
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
