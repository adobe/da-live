/* Forward real da-rs notifications; optionally delay one named race notification. */
const http = require('node:http');
const { randomBytes } = require('node:crypto');

async function startNotificationGate(workerOrigin, sourceOrigin, secret) {
  const worker = new URL(workerOrigin);
  if (worker.protocol !== 'http:' || worker.hostname !== '127.0.0.1' || !worker.port) throw new Error('Invalid owned Worker origin');
  const nonce = randomBytes(24).toString('hex');
  let state = 'idle';
  let name;
  let received = 0;
  let forwarded = 0;
  let status;
  let unblock;
  let released;
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/__notice__/')) {
      if (req.headers['x-h6-notice'] !== nonce) { res.writeHead(403).end(); return; }
      if (url.pathname === '/__notice__/arm' && req.method === 'POST' && ['idle', 'complete'].includes(state)
        && ['race', 'race-reverse'].includes(url.searchParams.get('name'))) {
        name = url.searchParams.get('name');
        received = 0;
        forwarded = 0;
        status = undefined;
        state = 'armed';
        released = new Promise((resolve) => { unblock = resolve; });
      } else if (url.pathname === '/__notice__/release' && req.method === 'POST' && state === 'pending') {
        state = 'released';
        unblock();
      } else if (url.pathname !== '/__notice__/status' || req.method !== 'GET') { res.writeHead(409).end(); return; }
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ state, name, received, forwarded, status }));
      return;
    }
    if (!['/api/v1/syncadmin', '/api/v1/deleteadmin'].includes(url.pathname) || !['GET', 'POST'].includes(req.method)
      || req.headers.authorization !== `token ${secret}`) { res.writeHead(403).end(); return; }
    let doc;
    try { doc = new URL(url.searchParams.get('doc')); } catch { res.writeHead(403).end(); return; }
    if (doc.origin !== sourceOrigin || doc.username || doc.password || doc.search || doc.hash
      || !/^\/source\/h6test\/(?:work|control)\/.+/.test(doc.pathname)) { res.writeHead(403).end(); return; }
    try {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) throw new Error('Notification payload too large');
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      const gated = ['armed', 'pending'].includes(state) && req.method === 'POST'
        && url.pathname === '/api/v1/syncadmin' && doc.pathname === `/source/h6test/work/${name}.html`;
      if (gated) { received += 1; state = 'pending'; await released; }
      const headers = { ...req.headers, host: worker.host };
      delete headers.connection;
      delete headers['transfer-encoding'];
      if (body.length || req.method === 'POST') headers['content-length'] = String(body.length);
      const upstream = http.request({ host: worker.hostname, port: worker.port, path: `${url.pathname}${url.search}`, method: req.method, headers }, (response) => {
        if (gated) { forwarded += 1; status = response.statusCode; state = 'complete'; }
        console.log(`NOTIFY ${req.method} ${url.pathname} doc=${doc.pathname} status=${response.statusCode}`);
        if (!res.destroyed) { res.writeHead(response.statusCode, response.headers); response.pipe(res); } else response.resume();
      });
      upstream.setTimeout(5000, () => upstream.destroy());
      upstream.on('error', () => { if (!res.destroyed) res.writeHead(502).end(); });
      upstream.end(body);
    } catch { if (!res.destroyed) res.writeHead(500).end(); }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    nonce,
    async dispose() { if (state === 'pending') unblock(); await new Promise((resolve) => server.close(resolve)); },
  };
}
module.exports = { startNotificationGate };
