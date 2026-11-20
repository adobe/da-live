/* Real da-collab Worker and da-rs with the actual legacy editor connection. */
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const repo = path.resolve(__dirname, '../../..');
const port = Number(process.env.POC_PORT);
const pid = Number(process.env.POC_RS_PID);
const runner = Number(process.env.POC_RUN_PID);
const scratch = process.env.POC_SCRATCH;
const source = `http://127.0.0.1:${port}`;
const collab = new URL(process.env.POC_COLLAB_ORIGIN);
const root = '/pocrooms/campaign';
const doc = '<body><header></header><main><div><p>initial room content</p></div></main><footer></footer></body>';
const shell = `<!doctype html><script type="importmap">{"imports":{"da-lit":"/deps/lit/dist/index.js","da-y-wrapper":"/deps/da-y-wrapper/dist/index.js","da-parser":"/deps/da-parser/dist/index.js","hast-util-from-html":"/test/fixtures/hast-stub.js"}}</script><script type="module">import {setNx} from '/scripts/utils.js'; setNx('/nx'); sessionStorage.setItem('loads', String(Number(sessionStorage.getItem('loads') || 0) + 1)); window.ready = true;</script>`;

function verifyOwner() {
  if (!Number.isInteger(port) || !Number.isInteger(pid) || !Number.isInteger(runner)
    || !scratch?.startsWith('/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode/branching-i2-')
    || process.env.POC_STORE !== `${scratch}/oak` || collab.hostname !== '127.0.0.1' || collab.protocol !== 'http:') throw new Error('Use run.cjs in collab mode');
  const listener = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim().split('\n');
  const parent = Number(execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' }).trim());
  const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (parent !== runner || listener.length !== 2 || !new RegExp(`\\s${pid}\\s`).test(listener[1]) || !listener[1].includes(`127.0.0.1:${port} (LISTEN)`)
    || !command.includes(`-Dda-rs.oak.directory=${scratch}/oak`) || !command.includes('-Dda-rs.security.enabled=false')
    || !command.includes(`-Dda-rs.collab.origin=${collab.origin}`)) throw new Error('Unexpected local server');
}

async function call(request, method, route, data, status = 200, headers = {}) {
  verifyOwner();
  const response = await request.fetch(`${source}${route}`, { method, data, headers, maxRedirects: 0 });
  expect(response.status(), `${method} ${route}: ${await response.text()}`).toBe(status);
  return response;
}

async function install(page, uiOrigin) {
  await page.addInitScript(({ wsOrigin }) => {
    const NativeWebSocket = window.WebSocket;
    window.WebSocket = class extends NativeWebSocket {
      constructor(url, protocols) {
        const target = new URL(url);
        if (target.origin !== 'ws://localhost:4711') throw new Error(`Blocked WebSocket ${target.origin}`);
        super(`${wsOrigin}${target.pathname}${target.search}`, protocols);
        this.addEventListener('close', (event) => sessionStorage.setItem('closeCode', String(event.code)));
      }
    };
  }, { wsOrigin: collab.origin.replace('http:', 'ws:') });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://localhost:8787') {
      verifyOwner();
      const response = await route.fetch({ url: `${source}${url.pathname}${url.search}`, maxRedirects: 0 });
      return route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': uiOrigin, 'access-control-allow-methods': 'GET, HEAD, PUT, POST, DELETE, OPTIONS', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' } });
    }
    if (url.origin === 'https://main--da-nx--adobe.aem.live' && url.pathname === '/nx2/utils/api.js') {
      return route.fulfill({ contentType: 'text/javascript', body: "export const AEM_API = 'https://api.aem.live'; export async function isHlx6() { return false; }" });
    }
    if (url.origin !== uiOrigin) return route.abort('blockedbyclient');
    if (url.pathname === '/') return route.continue();
    if (!/^\/(blocks|scripts|deps|test\/fixtures)\//.test(url.pathname)) return route.abort('blockedbyclient');
    const file = path.resolve(repo, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(`${repo}/`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort('blockedbyclient');
    return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  });
}

test('real Worker isolates two branch rooms and invalidates the old editor connection with 4412', async ({ request, browser }) => {
  test.setTimeout(120000);
  await call(request, 'GET', `/source${root}/page.html`, undefined, 404);
  await call(request, 'PUT', `/source${root}/page.html`, doc, 201, { 'Content-Type': 'text/html', 'If-None-Match': '*' });
  expect(await (await call(request, 'GET', `/source${root}/page.html`)).text()).toBe(doc);
  expect((await (await call(request, 'GET', `/branches${root}/capabilities`)).json()).supported).toBe(false);
  await call(request, 'POST', `/branches${root}/enable`);
  for (const name of ['a', 'b']) await call(request, 'POST', `/branches${root}/`, { name }, 201);
  const etags = await Promise.all(['a', 'b'].map(async (name) => (await call(request, 'GET', `/source${root}~${name}/page.html`)).headers().etag));
  const server = http.createServer((req, res) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(shell);
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const uiOrigin = `http://localhost:${server.address().port}`;
  let contexts = [];
  try {
    contexts = await Promise.all(['a', 'b', 'observer'].map(() => browser.newContext({ serviceWorkers: 'block' })));
    const pages = await Promise.all(contexts.map((context) => context.newPage()));
    await Promise.all(pages.map((page) => install(page, uiOrigin)));
    for (const [index, page] of pages.entries()) {
      page.on('pageerror', (error) => console.error(`Browser error: ${error.message}`));
      page.on('websocket', (socket) => {
        console.log(`Browser socket: ${socket.url()}`);
        socket.on('socketerror', (error) => console.error(`Browser socket error: ${error}`));
      });
      const id = ['a', 'b', 'a'][index];
      await page.goto(`${uiOrigin}/?da-admin=local&da-collab=local#/pocrooms/campaign~${id}/page`);
      await expect.poll(() => page.evaluate(() => window.ready)).toBe(true);
      await page.evaluate(async (name) => {
        const { createConnection } = await import('/blocks/edit/prose/index.js');
        window.room = await createConnection(`http://localhost:8787/source/pocrooms/campaign~${name}/page.html`);
        window.room.ydoc.on('destroy', () => sessionStorage.setItem('docDestroyed', 'yes'));
      }, id);
    }
    for (const page of pages) await expect.poll(() => page.evaluate(() => ({
      synced: window.room.wsProvider.synced,
      connected: window.room.wsProvider.wsconnected,
      url: window.room.wsProvider.url,
      state: window.room.wsProvider.ws?.readyState,
    })), { timeout: 20000 }).toMatchObject({ synced: true });
    await pages[2].evaluate(() => window.room.wsProvider.awareness.setLocalStateField('user', { name: 'observer' }));
    await expect.poll(() => pages[0].evaluate(() => JSON.stringify(Array.from(window.room.wsProvider.awareness.getStates().values())))).toContain('observer');
    expect(await pages[1].evaluate(() => JSON.stringify(Array.from(window.room.wsProvider.awareness.getStates().values())))).not.toContain('observer');
    for (const [index, page] of pages.slice(0, 2).entries()) {
      await page.evaluate(async (name) => {
        const { Y } = await import('da-y-wrapper');
        const search = (node) => {
          if (node instanceof Y.XmlText) return node;
          for (const child of node.toArray?.() || []) { const match = search(child); if (match) return match; }
          return undefined;
        };
        const text = search(window.room.ydoc.getXmlFragment('prosemirror'));
        if (!text) throw new Error('No editable Y.XmlText in loaded document');
        text.insert(text.length, ` ${name}-edit`);
        window.room.wsProvider.awareness.setLocalStateField('user', { name });
        const { forceSave } = await import('/blocks/shared/forcesave.js');
        const result = await forceSave(window.room.wsProvider);
        if (!result.ok) throw new Error(`Flush failed: ${JSON.stringify(result)}`);
      }, ['a', 'b'][index]);
    }
    for (const [index, page] of pages.slice(0, 2).entries()) {
      const own = ['a', 'b'][index];
      const other = ['b', 'a'][index];
      const ytext = await page.evaluate(() => window.room.ydoc.getXmlFragment('prosemirror').toString());
      expect(ytext).toContain(`${own}-edit`);
      expect(ytext).not.toContain(`${other}-edit`);
      const awareness = await page.evaluate(() => Array.from(window.room.wsProvider.awareness.getStates().values()));
      expect(JSON.stringify(awareness)).toContain(`"name":"${own}"`);
      expect(JSON.stringify(awareness)).not.toContain(`"name":"${other}"`);
      const saved = await (await call(request, 'GET', `/source${root}~${own}/page.html`)).text();
      expect(saved).toContain(`${own}-edit`);
      expect(saved).not.toContain(`${other}-edit`);
    }
    await expect.poll(() => pages[2].evaluate(() => window.room.ydoc.getXmlFragment('prosemirror').toString())).toContain('a-edit');
    expect(await pages[2].evaluate(() => window.room.ydoc.getXmlFragment('prosemirror').toString())).not.toContain('b-edit');
    expect(await (await call(request, 'GET', `/source${root}/page.html`)).text()).toBe(doc);
    const bridgeLog = fs.readFileSync(`${scratch}/collab.log`, 'utf8');
    for (const [index, name] of ['a', 'b'].entries()) {
      expect(bridgeLog).toContain(`SOURCE PUT /source${root}~${name}/page.html match=${etags[index]} status=201`);
    }
    // Default and branch A diverged. Resolving to default makes the real sync
    // commit invalidate branch A's open room, without a synthetic close event.
    await call(request, 'PUT', `/source${root}/page.html`, doc.replace('initial room content', 'replacement'), 201, { 'Content-Type': 'text/html' });
    const metadata = await (await call(request, 'GET', `/branches${root}/a`)).json();
    const sync = await (await call(request, 'POST', `/branches${root}/a/sync`, { expectedBranchRevision: metadata.revision }, 202)).json();
    const sessionPath = `/branches${root}/a/sync/${sync.syncId}`;
    const session = await (await call(request, 'GET', sessionPath)).json();
    const entry = session.entries.find(({ path: itemPath }) => itemPath === '/page.html');
    expect(entry).toBeTruthy();
    const resolved = await (await call(request, 'PUT', `${sessionPath}/resolutions/${entry.entryId}`, { expectedSessionRevision: session.revision, choice: 'default' })).json();
    await call(request, 'POST', `${sessionPath}/complete`, { expectedSessionRevision: resolved.revision });
    for (const page of [pages[0], pages[2]]) {
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('loads')), { timeout: 30000 }).toBe('2');
      expect(await page.evaluate(() => sessionStorage.getItem('closeCode'))).toBe('4412');
      expect(await page.evaluate(() => sessionStorage.getItem('docDestroyed'))).toBe('yes');
    }
    expect(await pages[1].evaluate(() => window.room.wsProvider.wsconnected)).toBe(true);
    expect(await (await call(request, 'GET', `/source${root}~a/page.html`)).text()).toContain('replacement');
    await pages[0].evaluate(async () => {
      const { createConnection } = await import('/blocks/edit/prose/index.js');
      window.room = await createConnection('http://localhost:8787/source/pocrooms/campaign~a/page.html');
    });
    await expect.poll(() => pages[0].evaluate(() => window.room.wsProvider.synced), { timeout: 20000 }).toBe(true);
    const replacement = await pages[0].evaluate(() => window.room.ydoc.getXmlFragment('prosemirror').toString());
    expect(replacement).toContain('replacement');
    expect(replacement).not.toContain('a-edit');

    // Keep a default editor connection open across a branch publish and revert.
    const defaultContext = await browser.newContext({ serviceWorkers: 'block' });
    contexts.push(defaultContext);
    const defaultPage = await defaultContext.newPage();
    await install(defaultPage, uiOrigin);
    await defaultPage.goto(`${uiOrigin}/?da-admin=local&da-collab=local#/pocrooms/campaign/page`);
    await expect.poll(() => defaultPage.evaluate(() => window.ready)).toBe(true);
    const connectDefault = () => defaultPage.evaluate(async () => {
      const { createConnection } = await import('/blocks/edit/prose/index.js');
      window.room = await createConnection('http://localhost:8787/source/pocrooms/campaign/page.html');
      window.room.ydoc.on('destroy', () => sessionStorage.setItem('docDestroyed', 'yes'));
    });
    await connectDefault();
    await expect.poll(() => defaultPage.evaluate(() => window.room.wsProvider.synced), { timeout: 20000 }).toBe(true);
    const branchB = await (await call(request, 'GET', `/branches${root}/b`)).json();
    const publication = await (await call(request, 'POST', `/branches${root}/b/publish`, { expectedBranchRevision: branchB.revision }, 202, { 'Idempotency-Key': 'room-publish-conflict' })).json();
    expect(publication.status).toBe('needs-resolution');
    const bSessionPath = `/branches${root}/b/sync/${publication.syncId}`;
    const bSession = await (await call(request, 'GET', bSessionPath)).json();
    const bEntry = bSession.entries.find(({ path: itemPath }) => itemPath === '/page.html');
    expect(bEntry).toBeTruthy();
    const bResolution = await (await call(request, 'PUT', `${bSessionPath}/resolutions/${bEntry.entryId}`, { expectedSessionRevision: bSession.revision, choice: 'branch' })).json();
    await call(request, 'POST', `${bSessionPath}/complete`, { expectedSessionRevision: bResolution.revision });
    const afterSync = await (await call(request, 'GET', `/branches${root}/b`)).json();
    const published = await (await call(request, 'POST', `/branches${root}/b/publish`, { expectedBranchRevision: afterSync.revision }, 200, { 'Idempotency-Key': 'room-publish' })).json();
    expect(published.status).toBe('published');
    await expect.poll(() => defaultPage.evaluate(() => sessionStorage.getItem('loads')), { timeout: 30000 }).toBe('2');
    expect(await defaultPage.evaluate(() => sessionStorage.getItem('closeCode'))).toBe('4412');
    expect(await defaultPage.evaluate(() => sessionStorage.getItem('docDestroyed'))).toBe('yes');
    await defaultPage.evaluate(() => { sessionStorage.removeItem('docDestroyed'); sessionStorage.removeItem('closeCode'); });
    await connectDefault();
    await expect.poll(() => defaultPage.evaluate(() => window.room.wsProvider.synced), { timeout: 20000 }).toBe(true);
    expect(await defaultPage.evaluate(() => window.room.ydoc.getXmlFragment('prosemirror').toString())).toContain('b-edit');
    const log = await call(request, 'GET', `/log${root}/`);
    await call(request, 'POST', `/log${root}/${published.mergeRevision}/revert`, { expectedDefaultRevision: Number(log.headers()['branch-revision']) });
    await expect.poll(() => defaultPage.evaluate(() => sessionStorage.getItem('loads')), { timeout: 30000 }).toBe('3');
    expect(await defaultPage.evaluate(() => sessionStorage.getItem('closeCode'))).toBe('4412');
    expect(await defaultPage.evaluate(() => sessionStorage.getItem('docDestroyed'))).toBe('yes');
    await connectDefault();
    await expect.poll(() => defaultPage.evaluate(() => window.room.wsProvider.synced), { timeout: 20000 }).toBe(true);
    const reverted = await defaultPage.evaluate(() => window.room.ydoc.getXmlFragment('prosemirror').toString());
    expect(reverted).toContain('replacement');
    expect(reverted).not.toContain('b-edit');
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    await new Promise((resolve) => server.close(resolve));
  }
});

test('real delayed Worker PUT is rejected with 412 after sync invalidates its room', async ({ request, browser }) => {
  test.setTimeout(120000);
  const lateRoot = '/poclate/campaign';
  const gatePort = Number(process.env.POC_GATE_PORT);
  const nonce = process.env.POC_GATE_NONCE;
  const gate = `http://127.0.0.1:${gatePort}`;
  async function control(method, action) {
    verifyOwner();
    if (!Number.isInteger(gatePort) || !nonce) throw new Error('Missing local gate');
    const rows = execFileSync('lsof', ['-nP', `-iTCP:${gatePort}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim().split('\n');
    if (rows.length !== 2 || !new RegExp(`\\s${runner}\\s`).test(rows[1]) || !rows[1].includes(`127.0.0.1:${gatePort} (LISTEN)`)) throw new Error('Gate is not owned by the runner');
    const response = await request.fetch(`${gate}/__gate__/${action}`, { method, headers: { 'x-i2-gate': nonce }, maxRedirects: 0 });
    expect(response.status(), `gate ${action}`).toBe(200);
    return response.json();
  }
  await call(request, 'GET', `/source${lateRoot}/page.html`, undefined, 404);
  await call(request, 'PUT', `/source${lateRoot}/page.html`, doc, 201, { 'Content-Type': 'text/html', 'If-None-Match': '*' });
  expect(await (await call(request, 'GET', `/source${lateRoot}/page.html`)).text()).toBe(doc);
  await call(request, 'POST', `/branches${lateRoot}/enable`);
  await call(request, 'POST', `/branches${lateRoot}/`, { name: 'work' }, 201);
  const oldTag = (await call(request, 'GET', `/source${lateRoot}~work/page.html`)).headers().etag;
  const server = http.createServer((req, res) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(shell);
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const uiOrigin = `http://localhost:${server.address().port}`;
  let context;
  try {
    context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await install(page, uiOrigin);
    await page.goto(`${uiOrigin}/?da-admin=local&da-collab=local#/poclate/campaign~work/page`);
    await expect.poll(() => page.evaluate(() => window.ready)).toBe(true);
    await page.evaluate(async () => {
      const { createConnection } = await import('/blocks/edit/prose/index.js');
      window.room = await createConnection('http://localhost:8787/source/poclate/campaign~work/page.html');
      window.room.ydoc.on('destroy', () => sessionStorage.setItem('docDestroyed', 'yes'));
    });
    await expect.poll(() => page.evaluate(() => window.room.wsProvider.synced), { timeout: 20000 }).toBe(true);
    await control('POST', 'arm');
    await page.evaluate(async () => {
      const { Y } = await import('da-y-wrapper');
      const findText = (node) => {
        if (node instanceof Y.XmlText) return node;
        for (const child of node.toArray?.() || []) { const found = findText(child); if (found) return found; }
        return undefined;
      };
      const text = findText(window.room.ydoc.getXmlFragment('prosemirror'));
      text.insert(text.length, ' late-uncommitted');
      const { forceSave } = await import('/blocks/shared/forcesave.js');
      window.pendingFlush = forceSave(window.room.wsProvider);
    });
    await expect.poll(async () => (await control('GET', 'status')).state, { timeout: 20000 }).toBe('pending');
    expect((await control('GET', 'status')).match).toBe(oldTag);
    const replacement = doc.replace('initial room content', 'new default survives');
    await call(request, 'PUT', `/source${lateRoot}/page.html`, replacement, 201, { 'Content-Type': 'text/html' });
    const branch = await (await call(request, 'GET', `/branches${lateRoot}/work`)).json();
    const synced = await (await call(request, 'POST', `/branches${lateRoot}/work/sync`, { expectedBranchRevision: branch.revision })).json();
    expect(synced.status).toBe('completed');
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('loads')), { timeout: 30000 }).toBe('2');
    expect(await page.evaluate(() => sessionStorage.getItem('closeCode'))).toBe('4412');
    expect(await page.evaluate(() => sessionStorage.getItem('docDestroyed'))).toBe('yes');
    await control('POST', 'release');
    await expect.poll(async () => (await control('GET', 'status')).state, { timeout: 20000 }).toBe('complete');
    const delayed = await control('GET', 'status');
    expect(delayed.match).toBe(oldTag);
    expect(delayed.status).toBe(412);
    const actual = await (await call(request, 'GET', `/source${lateRoot}~work/page.html`)).text();
    expect(actual).toBe(replacement);
    expect(actual).not.toContain('late-uncommitted');
  } finally {
    const gateStatus = await control('GET', 'status');
    if (gateStatus.state === 'pending') await control('POST', 'release');
    if (context) await context.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
