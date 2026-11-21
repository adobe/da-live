/* Harness-only transport check. The local sink is not Source or Worker acceptance. */
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startNotificationGate } = require('./notification-gate.cjs');

test('notification gate holds, forwards once and preserves the request', async () => {
  const seen = [];
  const sink = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    seen.push({ method: req.method, url: req.url, authorization: req.headers.authorization, body: Buffer.concat(chunks).toString() });
    if (req.url.includes('redirect.html')) { res.writeHead(307, { location: 'https://example.invalid/blocked' }).end(); return; }
    res.writeHead(204).end();
  });
  await new Promise((resolve, reject) => sink.once('error', reject).listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${sink.address().port}`;
  const secret = 'synthetic-notification-test';
  const gate = await startNotificationGate(origin, origin, secret);
  const headers = { 'x-h6-notice': gate.nonce };
  const control = async (path, method = 'GET') => {
    const response = await fetch(`${gate.origin}/__notice__/${path}`, { method, headers, redirect: 'manual' });
    assert.equal(response.status, 200);
    return response.json();
  };
  try {
    const doc = `${origin}/source/h6test/work/race.html`;
    const endpoint = `${gate.origin}/api/v1/syncadmin?doc=${encodeURIComponent(doc)}`;
    assert.equal((await fetch(endpoint, { method: 'POST', headers: { authorization: 'token wrong' } })).status, 403);
    await control('arm?name=race', 'POST');
    const pending = fetch(endpoint, { method: 'POST', headers: { authorization: `token ${secret}` }, body: 'fixture' });
    let status;
    for (let i = 0; i < 100; i += 1) {
      status = await control('status');
      if (status.state === 'pending') break;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(status.state, 'pending');
    assert.equal(status.received, 1);
    assert.equal(status.forwarded, 0);
    assert.equal(seen.length, 0);
    await control('release', 'POST');
    assert.equal((await pending).status, 204);
    assert.deepEqual(seen, [{ method: 'POST', url: `/api/v1/syncadmin?doc=${encodeURIComponent(doc)}`, authorization: `token ${secret}`, body: 'fixture' }]);
    status = await control('status');
    assert.equal(status.state, 'complete');
    assert.equal(status.received, 1);
    assert.equal(status.forwarded, 1);
    assert.equal(status.status, 204);
    const redirectDoc = `${origin}/source/h6test/work/redirect.html`;
    const redirect = await fetch(`${gate.origin}/api/v1/syncadmin?doc=${encodeURIComponent(redirectDoc)}`, { method: 'POST', headers: { authorization: `token ${secret}` }, redirect: 'manual' });
    assert.equal(redirect.status, 307);
    assert.equal(redirect.headers.get('location'), 'https://example.invalid/blocked');
    assert.equal(seen.length, 2);
  } finally {
    await gate.dispose();
    await new Promise((resolve) => sink.close(resolve));
  }
});
