/* Test-only transport gate. It delays one real collab PUT; it never invents Source responses. */
const http = require('node:http');
const { randomBytes } = require('node:crypto');

const gatedPath = '/source/poclate/campaign~work/page.html';

async function startGate(sourcePort) {
  const nonce = randomBytes(24).toString('hex');
  let state = 'idle';
  let match;
  let status;
  let unblock;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/__gate__/')) {
      if (req.headers['x-i2-gate'] !== nonce) { res.writeHead(403); res.end(); return; }
      if (url.pathname === '/__gate__/arm' && req.method === 'POST' && state === 'idle') state = 'armed';
      else if (url.pathname === '/__gate__/release' && req.method === 'POST' && state === 'pending') {
        state = 'released';
        unblock();
      } else if (!(url.pathname === '/__gate__/status' && req.method === 'GET')) { res.writeHead(409); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ state, match, status }));
      return;
    }
    if (req.headers['x-i2-bridge'] !== nonce || !url.pathname.startsWith('/source/') || !['HEAD', 'GET', 'PUT'].includes(req.method)) { res.writeHead(403); res.end(); return; }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) throw new Error('Gate payload too large');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const delayed = state === 'armed' && req.method === 'PUT' && url.pathname === gatedPath
        && req.headers['x-da-initiator'] === 'collab';
      if (delayed) {
        match = req.headers['if-match'];
        state = 'pending';
        await new Promise((resolve) => { unblock = resolve; });
      }
      const headers = { ...req.headers, host: `127.0.0.1:${sourcePort}` };
      delete headers.connection;
      delete headers['transfer-encoding'];
      delete headers['x-i2-bridge'];
      if (req.method === 'PUT') headers['content-length'] = String(body.length);
      const upstream = http.request({ host: '127.0.0.1', port: sourcePort, path: `${url.pathname}${url.search}`, method: req.method, headers }, (response) => {
        if (delayed) { status = response.statusCode; state = 'complete'; }
        if (!res.destroyed) {
          res.writeHead(response.statusCode, response.headers);
          response.pipe(res);
        } else response.resume();
      });
      upstream.on('error', () => { if (!res.destroyed) { res.writeHead(502); res.end(); } });
      if (body.length) upstream.write(body);
      upstream.end();
    } catch {
      if (!res.destroyed) { res.writeHead(500); res.end(); }
    }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  return {
    port: server.address().port,
    nonce,
    async dispose() {
      if (state === 'pending') unblock();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

module.exports = { startGate };
