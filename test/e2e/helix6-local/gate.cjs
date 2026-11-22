// A byte-preserving loopback gate: no Source response is fabricated.
const http = require('node:http');
const { randomBytes } = require('node:crypto');

async function startGate(sourcePort) {
  const nonce = randomBytes(24).toString('hex');
  let state = 'idle';
  let match;
  let status;
  let contentType;
  let initiator;
  let containsEdit;
  let release;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/__gate__/')) {
      if (req.headers['x-h6-gate'] !== nonce) { res.writeHead(403).end(); return; }
      if (req.method === 'POST' && url.pathname === '/__gate__/arm' && ['idle', 'complete'].includes(state)) { state = 'armed'; match = undefined; status = undefined; contentType = undefined; initiator = undefined; containsEdit = undefined; }
      else if (req.method === 'POST' && url.pathname === '/__gate__/cancel' && state === 'armed') { state = 'idle'; }
      else if (req.method === 'POST' && url.pathname === '/__gate__/release' && state === 'pending') { state = 'released'; release(); }
      else if (req.method !== 'GET' || url.pathname !== '/__gate__/status') { res.writeHead(409).end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ state, match, status, contentType, initiator, containsEdit }));
      return;
    }
    const allowed = /^\/(?:source\/h6test\/(?:work(?:~(?:draft|other))?|control(?:~draft)?)\/|h6test\/sites\/work(?:~(?:draft|other))?\/source\/)/.test(url.pathname);
    if (req.headers['x-h6-bridge'] !== nonce || !allowed || !['HEAD', 'GET', 'PUT'].includes(req.method)) { res.writeHead(403).end(); return; }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 4 * 1024 * 1024) throw new Error('Gate payload too large');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const delayed = state === 'armed' && req.method === 'PUT'
        && /^\/h6test\/sites\/work(?:~draft)?\/source\/(?:race(?:-reverse)?|page|reuse)\.html$/.test(url.pathname)
        && req.headers['x-da-initiator'] === 'collab';
      if (delayed) { match = req.headers['if-match']; contentType = req.headers['content-type']; initiator = req.headers['x-da-initiator']; containsEdit = body.includes(Buffer.from('old delayed edit')); state = 'pending'; await new Promise((resolve) => { release = resolve; }); }
      const headers = { ...req.headers, host: `127.0.0.1:${sourcePort}` };
      delete headers.connection;
      delete headers['transfer-encoding'];
      delete headers['x-h6-bridge'];
      if (req.method === 'PUT') headers['content-length'] = String(body.length);
      const upstream = http.request({ host: '127.0.0.1', port: sourcePort, path: `${url.pathname}${url.search}`, method: req.method, headers }, (response) => {
        if (delayed) { status = response.statusCode; state = 'complete'; }
        if (!res.destroyed) { res.writeHead(response.statusCode, response.headers); response.pipe(res); } else response.resume();
      });
      upstream.on('error', () => { if (!res.destroyed) res.writeHead(502).end(); });
      upstream.end(body);
    } catch { if (!res.destroyed) res.writeHead(500).end(); }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  return { port: server.address().port, nonce, async dispose() { if (state === 'pending') release(); await new Promise((resolve) => server.close(resolve)); } };
}
module.exports = { startGate };
