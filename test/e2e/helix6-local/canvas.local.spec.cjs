/* Actual route modules and local Source/Worker. This initial case is a baseline trace, not H6 acceptance. */
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// Every full-flow case consumes the site and document from the preceding vertical case.
const fullFlow = process.env.H6_LIVE === '1' && (process.env.H6_FULL === '1' || process.env.H6_EARLY_FULL === '1');
const repo = process.env.H6_UI_REPO;
const scratch = process.env.H6_SCRATCH;
const port = Number(process.env.H6_PORT);
const runner = Number(process.env.H6_RUN_PID);
const source = `http://localhost:${port}`;
const ui = process.env.H6_UI_ORIGIN;
const collab = process.env.H6_COLLAB_ORIGIN;
const notice = process.env.H6_NOTICE_ORIGIN;
const token = process.env.H6_TOKEN;

function verifyListener(portNumber, direct) {
  const rows = execFileSync('lsof', ['-nP', `-iTCP:${portNumber}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim().split('\n');
  if (rows.length !== 2 || !rows[1].includes(`127.0.0.1:${portNumber} (LISTEN)`)) throw new Error('Unexpected non-loopback listener');
  let owner = Number(rows[1].trim().split(/\s+/)[1]);
  if (direct && owner !== runner) throw new Error('Unexpected runner listener');
  for (let i = 0; !direct && i < 10 && owner > 1 && owner !== runner; i += 1) {
    owner = Number(execFileSync('ps', ['-p', String(owner), '-o', 'ppid='], { encoding: 'utf8' }).trim());
  }
  if (owner !== runner) throw new Error('Worker listener is not owned by runner');
}

function verifyOwner() {
  const pid = Number(JSON.parse(fs.readFileSync(`${scratch}/owner.json`, 'utf8')).pid);
  if (!Number.isInteger(port) || !Number.isInteger(pid) || !Number.isInteger(runner)
    || !scratch?.startsWith('/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode/helix6-h5-')
    || process.env.H6_STORE !== `${scratch}/oak` || !token
    || new URL(ui).hostname !== '127.0.0.1' || new URL(collab).hostname !== '127.0.0.1' || new URL(notice).hostname !== '127.0.0.1') throw new Error('Use the dedicated H6 runner');
  const rows = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim().split('\n');
  const parent = Number(execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' }).trim());
  const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (parent !== runner || rows.length !== 2 || !new RegExp(`\\s${pid}\\s`).test(rows[1]) || !rows[1].includes(`127.0.0.1:${port} (LISTEN)`)
    || !command.includes(`-Dda-rs.oak.directory=${scratch}/oak`) || !command.includes('-Dda-rs.security.enabled=true')
    || !command.includes('-Dda-rs.security.identity-provider=local') || !command.includes(`-Dda-rs.collab.origin=${notice}`)
    || !command.includes(`-Dda-rs.admin.public-origin=${source}`) || !command.includes(`-Dda-rs.cors.allowed-origins=${ui}`)) throw new Error('Unexpected local server');
  verifyListener(Number(new URL(ui).port), true);
  verifyListener(Number(process.env.H6_GATE_PORT), true);
  verifyListener(Number(new URL(notice).port), true);
  verifyListener(Number(new URL(collab).port), false);
}

async function api(request, method, route, data, status, contentType, extraHeaders = {}) {
  verifyOwner();
  const response = await request.fetch(`${source}${route}`, { method, data, headers: { authorization: `Bearer ${token}`, ...(contentType ? { 'content-type': contentType } : {}), ...extraHeaders }, maxRedirects: 0 });
  expect(response.status(), `${method} ${route}: ${(await response.text()).replaceAll(token, '[redacted]')}`).toBe(status);
  return response;
}

// Trash names are opaque: identify the item by the real shared document identity.
async function findTrashedById(request, id) {
  expect(id).toBeTruthy();
  const items = await (await api(request, 'GET', '/h6test/sites/work/source/.trash/', undefined, 200)).json();
  expect(Array.isArray(items)).toBe(true);
  const matches = [];
  for (const item of items) {
    expect(typeof item.name).toBe('string');
    if (item.name.endsWith('/')) continue;
    expect(item.name).not.toMatch(/[/\\]/);
    const route = `/source/h6test/work/.trash/${encodeURIComponent(item.name)}`;
    const metadata = await api(request, 'HEAD', route, undefined, 200);
    if (metadata.headers()['x-da-id'] === id) matches.push({ item, route });
  }
  expect(matches, `Expected one trashed item with identity ${id}`).toHaveLength(1);
  return matches[0];
}

const browseRoot = () => `${ui}/?browse=1&da-admin=local&da-source=da-rs&da-collab=local#/h6test/work`;

async function createBrowseItem(page, kind, name) {
  const menu = page.locator('da-browse da-new nx-menu');
  await menu.getByRole('button', { name: 'New', exact: true }).click();
  await menu.getByRole('menuitem', { name: kind === 'folder' ? 'Folder' : 'Page', exact: true }).click();
  await page.getByPlaceholder(`${kind} name`).fill(name);
  await page.locator('da-name-dialog').getByRole('button', { name: 'Create', exact: true }).click();
}

async function confirmBrowseDelete(page) {
  await page.locator('button.delete-button').filter({ visible: true }).click();
  const dialog = page.locator('da-dialog');
  await expect(dialog).toContainText('Deleting 1 item');
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
}

async function copyBrowseDocument(page, request, name, folder, originalBody) {
  await page.goto(browseRoot());
  const row = page.locator('da-browse da-list-item').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 30000 });
  await row.getByRole('checkbox', { name: 'Select item' }).check();
  await page.getByRole('button', { name: 'Copy', exact: true }).filter({ visible: true }).click();
  await page.getByRole('link', { name: folder }).click();
  await expect(page).toHaveURL(new RegExp(`#/h6test/work/${folder}/?$`));
  await page.getByRole('button', { name: 'Paste', exact: true }).filter({ visible: true }).click();
  const copiedPath = `/h6test/sites/work/source/${folder}/${name}.html`;
  await expect.poll(async () => {
    verifyOwner();
    return (await request.get(`${source}${copiedPath}`, { headers: { authorization: `Bearer ${token}` }, maxRedirects: 0 })).status();
  }, { timeout: 30000 }).toBe(200);
  const copy = await api(request, 'GET', copiedPath, undefined, 200);
  expect(await copy.text()).toBe(originalBody);
  const originalId = (await api(request, 'HEAD', `/source/h6test/work/${name}.html`, undefined, 200)).headers()['x-da-id'];
  const copyId = (await api(request, 'HEAD', `/source/h6test/work/${folder}/${name}.html`, undefined, 200)).headers()['x-da-id'];
  expect(originalId).toBeTruthy();
  expect(copyId).toBeTruthy();
  expect(copyId).not.toBe(originalId);
  return copiedPath;
}

const shell = `import { setNx } from '/scripts/utils.js';
setNx('/test/fixtures/nx', {hostname:'example.com'});
const { hashChange } = await import('/test/fixtures/nx/utils/utils.js');
const { default: details } = await import('/blocks/shared/pathDetails.js');
const publishHash = () => { const state = details(); hashChange._set(state?.path ? {...state, path:state.path.replace(/^\\//, '')} : state); };
publishHash(); window.addEventListener('hashchange', publishHash);
const route = location.pathname === '/canvas' ? 'canvas' : 'browse';
const {default: init} = await import('/blocks/' + route + '/' + route + '.js');
await init(document.querySelector('#route')); window.routeStarted = route;`;

function nxUtils() {
  return `export const DA_ADMIN = ${JSON.stringify(source)}; export const DA_COLLAB = ${JSON.stringify(collab.replace('http:', 'ws:'))};
export const loadScript = async () => {};
const styles = new Map(); export function loadStyle(input) { const url = input.replace(/\\.js(?:\\?.*)?$/, '.css'); if (!styles.has(url)) styles.set(url, (async () => { const response = await fetch(url); const sheet = new CSSStyleSheet(); sheet.replaceSync(response.ok ? await response.text() : ''); return sheet; })()); return styles.get(url); }
let state = {}; const subscribers = new Set(); export const hashChange = {subscribe(fn) {subscribers.add(fn); fn(state); return () => subscribers.delete(fn);}, _set(value) {state = value; subscribers.forEach(fn => fn(value));}};`;
}

async function install(page, observed) {
  await page.addInitScript(({ identity, trustedUi, workerOrigin }) => {
    if (window.location.origin !== trustedUi) return;
    localStorage.setItem('nx-ims', 'true');
    sessionStorage.setItem('nx-canvas-editor-view', 'content');
    window.adobeIMS = { getAccessToken: () => ({ token: identity }), refreshToken: async () => {} };
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url, protocols) {
        const target = new URL(url);
        if (target.origin !== workerOrigin) throw new Error(`Blocked WebSocket ${target.origin}`);
        super(url, protocols);
        const key = target.pathname.includes('/h6test/sites/work/source/') ? 'h6-canvas-close-codes' : 'h6-alias-close-codes';
        this.addEventListener('close', (event) => { sessionStorage.setItem(key, `${sessionStorage.getItem(key) || ''},${event.code}`); });
      }
    };
  }, { identity: token, trustedUi: ui, workerOrigin: collab.replace('http:', 'ws:') });
  page.on('pageerror', (error) => { observed.errors.push(error.message); });
  page.on('request', (request) => { const url = new URL(request.url()); if (url.origin !== ui || ['/canvas', '/browse', '/'].includes(url.pathname)) observed.requests.push(`${request.method()} ${url.origin}${url.pathname}`); });
  page.on('response', (response) => { const url = new URL(response.url()); if (url.origin === source) observed.responses.push(`${response.status()} ${response.request().method()} ${url.pathname}`); });
  page.on('websocket', (socket) => { const url = new URL(socket.url()); observed.sockets.push(`${url.origin}${url.pathname}`); });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === source) { verifyOwner(); return route.continue(); }
    if (url.origin !== ui) { observed.blocked.push(`${route.request().method()} ${url.origin}${url.pathname}`); return route.abort('blockedbyclient'); }
    if (['/', '/browse', '/canvas', '/__empty'].includes(url.pathname)) return route.continue();
    if (url.pathname === '/h6-shell.js') return route.fulfill({ contentType: 'text/javascript', body: shell });
    if (url.pathname === '/test/fixtures/nx/utils/utils.js') return route.fulfill({ contentType: 'text/javascript', body: nxUtils() });
    if (url.pathname === '/test/fixtures/nx/utils/panel.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, 'panel-fixture.js')) });
    if (url.pathname === '/test/fixtures/nx2/utils/ims.js' || url.pathname === '/test/fixtures/nx/utils/ims.js') return route.fulfill({ contentType: 'text/javascript', body: `export async function loadIms(){return {accessToken:{token:${JSON.stringify(token)}},email:'author@example.test',displayName:'Local Author'};} export function handleSignIn(){}` });
    if (url.pathname === '/test/fixtures/nx/blocks/shared/menu/menu.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../branching-local/nx-menu-fixture.js')) });
    if (url.pathname === '/test/fixtures/nx/public/sl/components.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, '../branching-local/sl-fixture.js')) });
    if (!/^\/(blocks|scripts|deps|img|test\/fixtures)\//.test(url.pathname)) { observed.blocked.push(`LOCAL ${url.pathname}`); return route.abort('blockedbyclient'); }
    const file = path.resolve(repo, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(`${repo}/`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { observed.missing.push(url.pathname); return route.fulfill({ status: 404, body: '' }); }
    let body = fs.readFileSync(file);
    if (url.pathname === '/blocks/shared/constants.js') {
      const old = "local: 'http://localhost:8787'";
      if (!body.toString().includes(old)) throw new Error('Local DA origin selector changed; review harness');
      body = Buffer.from(body.toString().replaceAll(old, `local: '${source}'`).replace("local: 'ws://localhost:4711'", `local: '${collab.replace('http:', 'ws:')}'`));
    }
    if (url.pathname === '/blocks/shared/utils.js') {
      const text = body.toString();
      if (!text.includes("'http://localhost:8787'")) throw new Error('Token allowlist changed; review harness');
      body = Buffer.from(text.replace("'http://localhost:8787'", `'${source}'`));
    }
    if (url.pathname === '/test/fixtures/nx2/utils/utils.js') {
      const text = body.toString();
      if (!text.includes("export const DA_ADMIN = 'https://admin.da.live';")) throw new Error('NX fixture changed');
      body = Buffer.from(text.replace("export const DA_ADMIN = 'https://admin.da.live';", `export const DA_ADMIN = '${source}';`).replace('export const ALLOWED_TOKEN = [DA_ADMIN, HLX_ADMIN, AEM_API];', 'export const ALLOWED_TOKEN = [DA_ADMIN];'));
    }
    if (url.pathname === '/test/fixtures/nx2/utils/ewFlags.js') {
      const text = body.toString();
      if (!text.includes('let ewEnabled = false;')) throw new Error('NX Workspace flag fixture changed');
      body = Buffer.from(text.replace('let ewEnabled = false;', 'let ewEnabled = true;'));
    }
    if (url.pathname === '/test/fixtures/nx2/utils/api.js' && process.env.H6_BASELINE_NO_UPGRADE === '1') {
      const text = body.toString();
      const probe = 'const resp = await daFetch({ url: `${HLX_ADMIN}/ping${path}` });';
      if (!text.includes(probe)) throw new Error('NX baseline probe changed');
      body = Buffer.from(text.replace(probe, 'return false; // baseline-only NX discovery shim; not H6 acceptance'));
    }
    const ext = path.extname(file);
    return route.fulfill({ body, contentType: { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' }[ext] || 'application/octet-stream' });
  });
}

test('baseline real Canvas route trace on an authorized legacy site', async ({ request, browser }) => {
  test.skip(process.env.H6_BASELINE !== '1', 'Frozen baseline only');
  const permissions = { permissions: { data: [
    { path: 'CONFIG', groups: 'author@example.test', actions: 'write' },
    { path: '/work/+**', groups: 'author@example.test', actions: 'write' },
  ] } };
  await api(request, 'POST', '/config/h6test/', JSON.stringify(permissions), 201, 'application/json');
  await api(request, 'PUT', '/source/h6test/work/page.html', '<body><header></header><main><div><p>Local baseline Canvas</p></div></main><footer></footer></body>', 201, 'text/html');
  const observed = { requests: [], responses: [], blocked: [], errors: [], missing: [], sockets: [] };
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await install(page, observed);
    await page.goto(`${ui}/canvas?da-admin=local&da-collab=local#/h6test/work/page`);
    await page.waitForTimeout(10000);
    console.log(`H6 BASELINE TRACE ${JSON.stringify(observed).replaceAll(token, '[redacted]')}`);
    await expect(page.locator('ew-editor-doc .ProseMirror')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('ew-editor-doc .ProseMirror')).toContainText('Local baseline Canvas');
  } finally { await context.close(); }
});

const fullAliasTest = async ({ request }) => {
  test.skip(!fullFlow, 'Run only in explicitly selected full-flow mode');
  test.skip(!fs.existsSync(`${scratch}/vertical-ready`), 'A passing vertical case is required');
  const h6 = '/h6test/sites/work/source/alias.html';
  const da = '/source/h6test/work/alias.html';
  const first = '<body><main><div><p>alias first</p></div></main></body>';
  const second = '<body><main><div><p>legacy second</p></div></main></body>';
  const third = '<body><main><div><p>helix third</p></div></main></body>';
  await api(request, 'POST', h6, first, 201, 'text/html');
  const firstDa = await api(request, 'HEAD', da, undefined, 200);
  const firstH6 = await api(request, 'HEAD', h6, undefined, 200);
  const id = firstDa.headers()['x-da-id'];
  const originalEtag = firstDa.headers().etag;
  expect(id).toBeTruthy();
  expect(firstH6.headers().etag).toBe(originalEtag);
  const historyBefore = await (await api(request, 'GET', `${h6}/.history`, undefined, 200)).json();
  await api(request, 'PUT', da, second, 201, 'text/html', { 'if-match': originalEtag });
  const secondH6 = await api(request, 'GET', h6, undefined, 200);
  expect(await secondH6.text()).toBe(second);
  expect(secondH6.headers().etag).not.toBe(originalEtag);
  const historyAfterLegacy = await (await api(request, 'GET', `${h6}/.history`, undefined, 200)).json();
  expect(historyAfterLegacy.entries.length - historyBefore.entries.length).toBe(1);
  expect(historyAfterLegacy.entries[0].users).toContain('author@example.test');
  await api(request, 'PUT', h6, third, 201, 'text/html', { 'if-match': secondH6.headers().etag });
  const thirdDa = await api(request, 'GET', da, undefined, 200);
  expect(await thirdDa.text()).toBe(third);
  expect(thirdDa.headers()['x-da-id']).toBe(id);
  const historyAfterH6 = await (await api(request, 'GET', `${h6}/.history`, undefined, 200)).json();
  expect(historyAfterH6.entries.length - historyAfterLegacy.entries.length).toBe(1);
  expect(historyAfterH6.entries[0].users).toContain('author@example.test');
  const copied = await api(request, 'PUT', '/h6test/sites/work/source/copied.html?source=%2Falias.html', undefined, 200);
  expect((await copied.json()).copied).toEqual([{ src: '/alias.html', dst: '/copied.html' }]);
  const copy = await api(request, 'GET', '/source/h6test/work/copied.html', undefined, 200);
  expect(await copy.text()).toBe(third);
  expect(copy.headers()['x-da-id']).not.toBe(id);
  await api(request, 'PUT', h6, 'stale must not win', 412, 'text/html', { 'if-match': originalEtag });
  const version = await api(request, 'POST', `${h6}/.versions?operation=version&comment=H5%20snapshot`, undefined, 201, undefined, { 'if-match': thirdDa.headers().etag });
  const location = version.headers().location;
  expect(location).toMatch(/^\/h6test\/sites\/work\/source\/alias\.html\/\.versions\/[^/]+$/);
  expect(await (await api(request, 'GET', location, undefined, 200)).text()).toBe(third);
  const versions = await (await api(request, 'GET', `${h6}/.versions`, undefined, 200)).json();
  expect(versions.at(-1)['version-by']).toBe('author@example.test');
  await api(request, 'DELETE', h6, undefined, 204);
  const { route: trashRoute } = await findTrashedById(request, id);
  const trashed = await api(request, 'GET', trashRoute, undefined, 200);
  expect(trashed.headers()['x-da-id']).toBe(id);
  expect(await trashed.text()).toBe(third);
  expect(await (await api(request, 'GET', location, undefined, 200)).text()).toBe(third);
  const history = await (await api(request, 'GET', `${h6}/.history`, undefined, 200)).json();
  expect(history.entries[0].operation).toBe('trash');
  expect(history.entries[0].users).toContain('author@example.test');
};

test('first live checkpoint: reopened H6 discovery and real Canvas Worker PUT', async ({ request, browser }) => {
  test.skip(process.env.H6_LIVE !== '1', 'Run only at the coordinated live checkpoint');
  test.setTimeout(120000);
  const permissions = { permissions: { data: [
    { path: 'CONFIG', groups: 'author@example.test', actions: 'write' },
    { path: '/work/+**', groups: 'author@example.test', actions: 'write' },
    { path: '/control/+**', groups: 'author@example.test', actions: 'write' },
  ] } };
  const html = '<body><header></header><main><div><p>Local H6 Canvas</p></div></main><footer></footer></body>';
  const h6 = '/h6test/sites/work/source/page.html';
  const da = '/source/h6test/work/page.html';
  await api(request, 'POST', '/config/h6test/', JSON.stringify(permissions), 201, 'application/json');
  await api(request, 'POST', '/h6test/sites/work/source/', undefined, 201);
  await api(request, 'POST', '/config/h6test/work/', JSON.stringify({ ':type': 'sheet', ':sheetname': 'data', data: [{ key: 'ew.enabled', value: 'true' }] }), 201, 'application/json');
  await api(request, 'POST', h6, html, 201, 'text/html');
  await api(request, 'PUT', '/source/h6test/control/page.html', html, 201, 'text/html');
  verifyOwner();
  const before = Number(JSON.parse(fs.readFileSync(`${scratch}/owner.json`, 'utf8')).pid);
  const restart = await request.post(`${ui}/__restart`, { headers: { 'x-h6-restart': process.env.H6_RESTART_KEY }, maxRedirects: 0 });
  expect(restart.status()).toBe(204);
  verifyOwner();
  expect(Number(JSON.parse(fs.readFileSync(`${scratch}/owner.json`, 'utf8')).pid)).not.toBe(before);

  const h6Before = await api(request, 'GET', h6, undefined, 200);
  const daBefore = await api(request, 'GET', da, undefined, 200);
  expect(h6Before.headers().etag).toBe(daBefore.headers().etag);
  expect(await h6Before.text()).toBe(await daBefore.text());
  const disallowed = await request.get(`${source}/ping/h6test/work`, { headers: { origin: 'http://127.0.0.1:1', authorization: `Bearer ${token}` }, maxRedirects: 0 });
  expect(disallowed.headers()['access-control-allow-origin']).toBeUndefined();

  const observed = { requests: [], responses: [], blocked: [], errors: [], missing: [], sockets: [] };
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    let flushFrames = 0;
    page.on('websocket', (socket) => socket.on('framesent', ({ payload }) => {
      if (Buffer.isBuffer(payload) && payload[0] === 2) flushFrames += 1;
    }));
    await install(page, observed);
    await page.goto(`${ui}/__empty?da-admin=local&da-source=da-rs&da-collab=local`);
    const browserDiscovery = await page.evaluate(async ({ origin, identity }) => {
      const read = async (site) => {
        const response = await fetch(`${origin}/ping/h6test/${site}`, { headers: { authorization: `Bearer ${identity}` }, redirect: 'error' });
        return { status: response.status, upgrade: response.headers.get('x-api-upgrade-available') };
      };
      return { marked: await read('work'), control: await read('control') };
    }, { origin: source, identity: token });
    expect(browserDiscovery).toEqual({ marked: { status: 200, upgrade: 'true' }, control: { status: 200, upgrade: null } });
    const binding = await page.evaluate(async (origin) => {
      localStorage.setItem('hlx6-upgrade', JSON.stringify({ '/h6test/control': true }));
      const { discoverDaRs } = await import('/blocks/shared/da-rs-provider.js');
      const { isAllowedDaAdminOrigin } = await import('/blocks/shared/constants.js');
      return { marked: await discoverDaRs('h6test', 'work'), control: await discoverDaRs('h6test', 'control'), allowed: isAllowedDaAdminOrigin(origin), arbitrary: isAllowedDaAdminOrigin('http://127.0.0.1:1') };
    }, source);
    expect(binding.marked).toEqual({ origin: source, org: 'h6test', site: 'work', mode: 'helix6' });
    expect(binding.control).toEqual({ origin: source, org: 'h6test', site: 'control', mode: 'legacy' });
    expect(binding.allowed).toBe(true);
    expect(binding.arbitrary).toBe(false);

    if (process.env.H6_DIAGNOSTIC_BUILD === '1') {
      verifyOwner();
      const probeOrigin = new URL(process.env.H6_PROBE_ORIGIN);
      if (probeOrigin.hostname !== '127.0.0.1') throw new Error('Unexpected binding probe');
      verifyListener(Number(probeOrigin.port), false);
      const bindingProbe = await request.get(`${probeOrigin.origin}/probe`, { headers: { authorization: `Bearer ${token}`, 'x-h6-gate': process.env.H6_GATE_NONCE }, maxRedirects: 0 });
      console.log(`H6 BINDING PROBE ${(await bindingProbe.text()).replaceAll(token, '[redacted]')}`);
      const admission = await request.get(`${collab}/${source}${h6}`, { headers: { 'sec-websocket-protocol': `yjs, ${token}` }, maxRedirects: 0 });
      console.log(`H6 ADMISSION PROBE ${JSON.stringify({ status: admission.status(), body: (await admission.text()).replaceAll(token, '[redacted]') })}`);
    }

    await page.goto(`${ui}/canvas?da-admin=local&da-source=da-rs&da-collab=local#/h6test/work/page`);
    const editor = page.locator('ew-editor-doc .ProseMirror');
    await expect(editor).toBeVisible({ timeout: 30000 });
    await expect(editor).toContainText('Local H6 Canvas', { timeout: 30000 });
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await page.waitForTimeout(1000);
    const logPath = `${scratch}/collab.log`;
    const logOffset = fs.readFileSync(logPath, 'utf8').length;
    const etag = (await api(request, 'GET', h6, undefined, 200)).headers().etag;
    expect(etag).toMatch(/^"[^"]+"$/);
    await editor.click();
    await editor.press('End');
    await page.keyboard.type(' persisted from Canvas');
    const flushesBefore = flushFrames;
    const flush = await page.locator('ew-editor-doc').evaluate((element) => element.forceSave());
    expect(flush.ok).toBe(true);
    await expect.poll(() => flushFrames).toBeGreaterThan(flushesBefore);
    await expect.poll(async () => (await (await api(request, 'GET', h6, undefined, 200)).text()).includes('persisted from Canvas'), { timeout: 30000 }).toBe(true);
    const workerPuts = () => fs.readFileSync(logPath, 'utf8').slice(logOffset).split('\n')
      .filter((line) => line.includes(`SOURCE PUT ${h6} `) && line.includes(' status=201 '))
      .map((line) => {
        const typeJson = /\btype=("(?:\\.|[^"\\])*")/.exec(line)?.[1];
        return { ifMatch: /\bmatch=(\S+)/.exec(line)?.[1], etag: /\betag=(\S+)/.exec(line)?.[1], contentType: typeJson && JSON.parse(typeJson), initiator: /\binitiator=(\S+)/.exec(line)?.[1] };
      });
    await expect.poll(() => workerPuts().some((put) => put.ifMatch === etag), { timeout: 10000 }).toBe(true);
    const chain = [];
    let nextEtag = etag;
    for (const put of workerPuts()) {
      if (put.ifMatch !== nextEtag) continue;
      expect(put.contentType).toMatch(/^text\/html(?:;.*)?$/i);
      expect(put.initiator).toBe('collab');
      expect(put.etag).toMatch(/^"[^"]+"$/);
      expect(put.etag).not.toBe(put.ifMatch);
      chain.push(put);
      nextEtag = put.etag;
    }
    expect(chain.length).toBeGreaterThan(0);
    expect((await api(request, 'GET', h6, undefined, 200)).headers().etag).toBe(nextEtag);
    expect(observed.blocked).toEqual([]);
    expect(observed.requests.some((value) => value === `GET ${source}/ping/h6test/work`)).toBe(true);
    expect(observed.requests.some((value) => value === `HEAD ${source}${h6}`)).toBe(true);
    expect(observed.sockets.length).toBeGreaterThan(0);
    expect(observed.errors).toEqual([]);
    console.log(`H6 VERTICAL RECEIPT ${JSON.stringify({ build: process.env.H6_DIAGNOSTIC_BUILD === '1' ? 'diagnostic-spotless-skipped' : 'normal', browserDiscovery, workerPutPath: h6, initialEtag: etag, acceptedPuts: chain, flush: flush.ok, flushFrames: flushFrames - flushesBefore, status: 201 })}`);
    await page.goto(`${ui}/canvas?da-admin=local&da-source=da-rs&da-collab=local#/h6test/control/page`);
    await expect.poll(() => observed.requests.some((value) => value === `HEAD ${source}/source/h6test/control/page.html`), { timeout: 30000 }).toBe(true);
    const controlEditor = page.locator('ew-editor-doc .ProseMirror');
    await expect(controlEditor).toContainText('Local H6 Canvas', { timeout: 30000 });
    await expect(controlEditor).not.toContainText('persisted from Canvas');
    await expect(controlEditor).toHaveAttribute('contenteditable', 'true');
    const controlLogOffset = fs.readFileSync(logPath, 'utf8').length;
    await controlEditor.click();
    await controlEditor.press('End');
    await page.keyboard.type(' legacy connected edit');
    const controlFlushesBefore = flushFrames;
    const controlFlush = await page.locator('ew-editor-doc').evaluate((element) => element.forceSave());
    expect(controlFlush.ok).toBe(true);
    await expect.poll(() => flushFrames).toBeGreaterThan(controlFlushesBefore);
    await expect.poll(async () => (await (await api(request, 'GET', '/source/h6test/control/page.html', undefined, 200)).text()).includes('legacy connected edit'), { timeout: 30000 }).toBe(true);
    const controlPrefix = 'SOURCE PUT /source/h6test/control/page.html match=* status=201 ';
    await expect.poll(() => fs.readFileSync(logPath, 'utf8').slice(controlLogOffset).includes(controlPrefix), { timeout: 10000 }).toBe(true);
    const controlPut = fs.readFileSync(logPath, 'utf8').slice(controlLogOffset).split('\n').find((line) => line.includes(controlPrefix));
    const controlType = JSON.parse(/\btype=("(?:\\.|[^"\\])*")/.exec(controlPut)[1]);
    expect(controlType).toMatch(/^multipart\/form-data(?:;|$)/i);
    expect(controlPut).toContain('initiator=collab');
    expect(controlPut).toContain('auth=present');
    console.log(`H6 LEGACY CONTROL RECEIPT ${JSON.stringify({ route: '/source/h6test/control/page.html', ifMatch: '*', contentType: controlType, auth: 'present', initiator: 'collab', status: 201, flush: controlFlush.ok, flushFrames: flushFrames - controlFlushesBefore })}`);
    expect(observed.blocked).toEqual([]);
    expect(observed.errors).toEqual([]);
    fs.writeFileSync(`${scratch}/vertical-ready`, 'passed\n', { mode: 0o600 });
  } finally {
    console.log(`H6 LIVE TRACE ${JSON.stringify(observed).replaceAll(token, '[redacted]')}`);
    await context.close();
  }
});

async function exerciseLastClose({ request, browser, helix }) {
  test.setTimeout(90000);
  const baseline = process.env.H6_BASELINE === '1';
  const site = helix || baseline ? 'work' : 'control';
  const name = helix ? 'closeh6' : 'closeprobe';
  const daRoute = `/source/h6test/${site}/${name}.html`;
  const route = helix ? `/h6test/sites/work/source/${name}.html` : daRoute;
  const label = helix ? 'H6 close probe' : 'Legacy close probe';
  const html = `<body><header></header><main><div><p>${label}</p></div></main><footer></footer></body>`;
  await api(request, helix ? 'POST' : 'PUT', route, html, 201, 'text/html');
  const logPath = `${scratch}/collab.log`;
  await expect.poll(() => fs.readFileSync(logPath, 'utf8').includes(`Admin API ${source}${daRoute}`), { timeout: 30000 }).toBe(true);
  const observed = { requests: [], responses: [], blocked: [], errors: [], missing: [], sockets: [] };
  const context = await browser.newContext({ serviceWorkers: 'block' });
  let observerContext;
  let closed = false;
  try {
    const page = await context.newPage();
    let frames = 0;
    page.on('websocket', (socket) => socket.on('framesent', ({ payload }) => {
      if (Buffer.isBuffer(payload) && payload[0] === 0) frames += 1;
    }));
    await install(page, observed);
    const selection = baseline ? '' : '&da-source=da-rs';
    await page.goto(`${ui}/canvas?da-admin=local&da-collab=local${selection}#/h6test/${site}/${name}`);
    const editor = page.locator('ew-editor-doc .ProseMirror');
    await expect(editor).toContainText(label, { timeout: 30000 });
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    observerContext = await browser.newContext({ serviceWorkers: 'block' });
    const observer = await observerContext.newPage();
    let observerClosed = false;
    observer.on('websocket', (socket) => socket.on('close', () => { observerClosed = true; }));
    await install(observer, observed);
    await observer.goto(`${ui}/canvas?da-admin=local&da-collab=local${selection}#/h6test/${site}/${name}`);
    const observerEditor = observer.locator('ew-editor-doc .ProseMirror');
    await expect(observerEditor).toContainText(label, { timeout: 30000 });
    await expect(observerEditor).toHaveAttribute('contenteditable', 'true');
    // Settle startup normalization while connected; the edit below is not flushed.
    expect((await page.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    const beforeEtag = (await api(request, 'HEAD', route, undefined, 200)).headers().etag;
    const offset = fs.readFileSync(logPath, 'utf8').length;
    const beforeFrames = frames;
    const started = Date.now();
    await editor.click();
    await editor.press('End');
    await page.keyboard.insertText(' unflushed close probe');
    await expect(editor).toContainText('unflushed close probe');
    await expect.poll(() => frames, { timeout: 1000 }).toBeGreaterThan(beforeFrames);
    // The second real client confirms the complete Yjs update reached the room.
    await expect(observerEditor).toContainText('unflushed close probe', { timeout: 1000 });
    await observer.locator('ew-editor-doc').evaluate((element) => element._proseContext.wsProvider.disconnect());
    await expect.poll(() => observerClosed, { timeout: 1000 }).toBe(true);
    expect(Date.now() - started, 'Close diagnostic must start before the two-second debounce').toBeLessThan(1500);
    await context.close();
    closed = true;
    const prefix = `SOURCE PUT ${route} `;
    await expect.poll(() => fs.readFileSync(logPath, 'utf8').slice(offset).includes(prefix), { timeout: 15000 }).toBe(true);
    const line = fs.readFileSync(logPath, 'utf8').slice(offset).split('\n').find((entry) => entry.includes(prefix));
    const status = Number(/\bstatus=(\d+)/.exec(line)?.[1]);
    const auth = /\bauth=(present|absent)/.exec(line)?.[1];
    const ifMatch = /\bmatch=(\S+)/.exec(line)?.[1];
    const contentType = JSON.parse(/\btype=("(?:\\.|[^"\\])*")/.exec(line)[1]);
    const saved = await (await api(request, 'GET', route, undefined, 200)).text();
    console.log(`H6 CLOSE RECEIPT ${JSON.stringify({ baseline, mode: helix ? 'helix6' : 'legacy', route, status, auth, beforeEtag, ifMatch, contentType, saved: saved.includes('unflushed close probe') })}`);
    expect(status).toBe(201);
    expect(auth).toBe('present');
    if (helix) {
      expect(ifMatch).toMatch(/^"[^"]+"$/);
      expect(ifMatch).toBe(beforeEtag);
      expect(contentType).toMatch(/^text\/html(?:;.*)?$/i);
      expect(observed.blocked).toEqual([]);
      expect(observed.errors).toEqual([]);
    } else {
      expect(ifMatch).toBe('*');
      expect(contentType).toMatch(/^multipart\/form-data(?:;|$)/i);
    }
    expect(saved).toContain('unflushed close probe');
    if (helix) {
      const nextContext = await browser.newContext({ serviceWorkers: 'block' });
      try {
        const nextPage = await nextContext.newPage();
        await install(nextPage, observed);
        await nextPage.goto(`${ui}/canvas?da-admin=local&da-collab=local&da-source=da-rs#/h6test/${site}/${name}`);
        const nextEditor = nextPage.locator('ew-editor-doc .ProseMirror');
        await expect(nextEditor).toContainText('unflushed close probe', { timeout: 30000 });
        await expect(nextEditor).toHaveAttribute('contenteditable', 'true');
        const nextOffset = fs.readFileSync(logPath, 'utf8').length;
        const nextEtag = (await api(request, 'GET', route, undefined, 200)).headers().etag;
        expect(nextEtag).toMatch(/^"[^"]+"$/);
        await nextEditor.click();
        await nextEditor.press('End');
        await nextPage.keyboard.type(' next room edit');
        expect((await nextPage.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
        await expect.poll(async () => (await (await api(request, 'GET', route, undefined, 200)).text()).includes('next room edit'), { timeout: 30000 }).toBe(true);
        const nextPrefix = `SOURCE PUT ${route} match=${nextEtag} status=201 `;
        await expect.poll(() => fs.readFileSync(logPath, 'utf8').slice(nextOffset).includes(nextPrefix), { timeout: 10000 }).toBe(true);
        const nextLine = fs.readFileSync(logPath, 'utf8').slice(nextOffset).split('\n').find((entry) => entry.includes(nextPrefix));
        expect(nextLine).toContain('auth=present');
        expect(nextLine).toContain('initiator=collab');
        const nextType = JSON.parse(/\btype=("(?:\\.|[^"\\])*")/.exec(nextLine)[1]);
        expect(nextType).toMatch(/^text\/html(?:;.*)?$/i);
        const finalBody = await (await api(request, 'GET', route, undefined, 200)).text();
        expect(finalBody).toContain('unflushed close probe');
        expect(finalBody).toContain('next room edit');
        expect(observed.blocked).toEqual([]);
        expect(observed.errors).toEqual([]);
        console.log(`H6 NEXT ROOM RECEIPT ${JSON.stringify({ route, ifMatch: nextEtag, status: 201, auth: 'present', contentType: nextType, priorEditPreserved: true, nextEditSaved: true })}`);
      } finally { await nextContext.close(); }
    }
  } finally {
    if (!closed) await context.close();
    if (observerContext) await observerContext.close();
  }
}

test('diagnostic: legacy last connection closes with an unflushed edit', async ({ request, browser }) => {
  const enabled = process.env.H6_CLOSE_DIAGNOSTIC === '1' || process.env.H6_LEGACY_CLOSE_DIAGNOSTIC === '1';
  test.skip(!enabled || process.env.H6_FULL === '1', 'Explicit baseline/live diagnostic only');
  await exerciseLastClose({ request, browser, helix: false });
});

test('full H6: last connection closes with an unflushed edit', async ({ request, browser }) => {
  const diagnostic = process.env.H6_LIVE === '1' && process.env.H6_CLOSE_DIAGNOSTIC === '1';
  test.skip(!fullFlow && !diagnostic, 'Full flow or explicit live close diagnostic only');
  test.skip(!fs.existsSync(`${scratch}/vertical-ready`), 'A passing vertical case is required');
  await exerciseLastClose({ request, browser, helix: true });
});

test('full H6: both API aliases share identity, validators, actor, versions and trash', fullAliasTest);

test('full H6: two Canvas tabs, image, history restore and browse trash', async ({ request, browser }) => {
  test.skip(!fullFlow, 'Run only in explicitly selected full-flow mode');
  test.skip(!fs.existsSync(`${scratch}/vertical-ready`), 'A passing vertical case is required');
  test.setTimeout(180000);
  const h6 = '/h6test/sites/work/source/page.html';
  const observed = { requests: [], responses: [], blocked: [], errors: [], missing: [], sockets: [] };
  const context = await browser.newContext({ serviceWorkers: 'block' });
  let flushFrames = 0;
  try {
    const first = await context.newPage();
    first.on('websocket', (socket) => socket.on('framesent', ({ payload }) => { if (Buffer.isBuffer(payload) && payload[0] === 2) flushFrames += 1; }));
    const second = await context.newPage();
    await Promise.all([install(first, observed), install(second, observed)]);
    const canvas = `${ui}/canvas?da-admin=local&da-source=da-rs&da-collab=local#/h6test/work/page`;
    await first.goto(canvas);
    await second.goto(canvas);
    const editor = first.locator('ew-editor-doc .ProseMirror');
    const otherEditor = second.locator('ew-editor-doc .ProseMirror');
    await expect(editor).toContainText('persisted from Canvas', { timeout: 30000 });
    await expect(otherEditor).toContainText('persisted from Canvas', { timeout: 30000 });
    await editor.click();
    await editor.press('End');
    await first.keyboard.type(' shared across tabs');
    const previousFlushes = flushFrames;
    expect((await first.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    expect(flushFrames).toBeGreaterThan(previousFlushes);
    await expect(otherEditor).toContainText('shared across tabs');
    expect(await (await api(request, 'GET', h6, undefined, 200)).text()).toContain('shared across tabs');

    const header = first.locator('ew-canvas-header');
    await expect(header.getByRole('button', { name: 'Layout', exact: true })).toBeDisabled();
    await expect(header.getByRole('button', { name: 'Split view', exact: true })).toBeDisabled();
    await expect(first.getByRole('button', { name: /^(Preview|Publish)$/ })).toHaveCount(0);
    await expect(first.locator('ew-editor-wysiwyg')).toHaveCount(0);

    await editor.click();
    await editor.press('End');
    const choosing = first.waitForEvent('filechooser');
    await first.locator('ew-selection-toolbar button[data-id="image-add"]').click();
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
    await (await choosing).setFiles({ name: 'local.png', mimeType: 'image/png', buffer: image });
    await expect.poll(async () => (await (await api(request, 'GET', h6, undefined, 200)).text()).includes('./media_'), { timeout: 30000 }).toBe(true);
    expect((await first.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    await first.reload();
    await expect(first.locator('ew-editor-doc .ProseMirror')).toContainText('shared across tabs', { timeout: 30000 });
    const renderedImage = first.locator('ew-editor-doc .ProseMirror img').first();
    await expect(renderedImage).toBeVisible();
    await expect.poll(() => renderedImage.evaluate((element) => element.complete && element.naturalWidth > 0), { timeout: 30000 }).toBe(true);
    const mediaRequest = observed.requests.find((entry) => entry.startsWith(`GET ${source}/h6test/sites/work/source/media_`));
    expect(mediaRequest).toBeTruthy();
    const mediaUrl = new URL(mediaRequest.slice(4));
    expect(mediaUrl.origin).toBe(source);
    const savedImage = await api(request, 'GET', mediaUrl.pathname, undefined, 200);
    expect(savedImage.headers()['content-type']).toMatch(/^image\/png(?:;|$)/i);
    expect(await savedImage.body()).toEqual(image);

    await first.keyboard.press('Meta+Alt+S');
    const versions = first.locator('ew-canvas-versions');
    await expect(versions.getByRole('button', { name: 'Create version', exact: true })).toBeVisible({ timeout: 30000 });
    if (!(await versions.getByPlaceholder('Version name').isVisible())) {
      await versions.getByRole('button', { name: 'Create version', exact: true }).click();
    }
    await expect(versions.getByPlaceholder('Version name')).toBeVisible({ timeout: 30000 });
    await versions.getByPlaceholder('Version name').fill('H5 browser snapshot');
    await versions.getByRole('button', { name: 'Save', exact: true }).click();
    const versionRow = versions.locator('.versionentry.is-version').filter({ hasText: 'H5 browser snapshot' });
    await expect(versionRow).toBeVisible({ timeout: 30000 });
    const savedVersions = await (await api(request, 'GET', `${h6}/.versions`, undefined, 200)).json();
    expect(savedVersions.some((entry) => entry['version-comment'] === 'H5 browser snapshot' && entry['version-by'] === 'author@example.test')).toBe(true);

    const reloadedEditor = first.locator('ew-editor-doc .ProseMirror');
    await reloadedEditor.click();
    await reloadedEditor.press('End');
    await first.keyboard.type(' change to restore');
    expect((await first.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    await versionRow.getByRole('button', { name: 'More actions' }).click();
    await versionRow.getByRole('menuitem', { name: 'Restore', exact: true }).click();
    const restoreState = await versions.evaluate((element) => ({ path: element.path, versionId: element._restoreEntry?.versionId, connected: element.isConnected }));
    const bridgeState = await first.evaluate(async () => {
      const { getExtensionsBridge } = await import('/blocks/canvas/editor-utils/extensions-bridge.js');
      const view = getExtensionsBridge().view;
      return { present: !!view, connected: !!view?.dom?.isConnected, matchesEditor: view === document.querySelector('ew-editor-doc')?._proseContext?.view };
    });
    console.log(`H6 RESTORE CONTEXT ${JSON.stringify({ ...restoreState, ...bridgeState })}`);
    expect(restoreState.versionId).toBeTruthy();
    expect(restoreState.connected).toBe(true);
    expect(bridgeState).toEqual({ present: true, connected: true, matchesEditor: true });
    await versions.locator('nx-dialog.ew-cv-restore').getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(reloadedEditor).not.toContainText('change to restore');
    expect((await first.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    expect(await (await api(request, 'GET', h6, undefined, 200)).text()).not.toContain('change to restore');

    const identity = (await api(request, 'HEAD', '/source/h6test/work/page.html', undefined, 200)).headers()['x-da-id'];
    await second.close();
    await first.goto(browseRoot());
    const row = first.locator('da-browse da-list-item').filter({ hasText: 'page' });
    await expect(row).toBeVisible({ timeout: 30000 });
    await row.getByRole('checkbox', { name: 'Select item' }).check();
    await confirmBrowseDelete(first);
    await expect(row).toHaveCount(0);
    await api(request, 'GET', h6, undefined, 404);
    const { route: trashRoute } = await findTrashedById(request, identity);
    expect((await api(request, 'HEAD', trashRoute, undefined, 200)).headers()['x-da-id']).toBe(identity);
    expect((await (await api(request, 'GET', `${h6}/.versions`, undefined, 200)).json()).some((entry) => entry['version-comment'] === 'H5 browser snapshot')).toBe(true);

    await createBrowseItem(first, 'folder', 'assets');
    await expect.poll(async () => {
      verifyOwner();
      return (await request.get(`${source}/h6test/sites/work/source/assets/`, { headers: { authorization: `Bearer ${token}` }, maxRedirects: 0 })).status();
    }, { timeout: 30000 }).toBe(200);
    await createBrowseItem(first, 'document', 'created');
    await expect(first).toHaveURL(/\/canvas\?.*da-source=da-rs.*#\/h6test\/work\/created/);
    const createdEditor = first.locator('ew-editor-doc .ProseMirror');
    await expect(createdEditor).toHaveAttribute('contenteditable', 'true', { timeout: 30000 });
    await createdEditor.click();
    await first.keyboard.type('Created in real browse');
    expect((await first.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    const original = await api(request, 'GET', '/h6test/sites/work/source/created.html', undefined, 200);
    const originalBody = await original.text();
    expect(originalBody).toContain('Created in real browse');
    const copiedPath = await copyBrowseDocument(first, request, 'created', 'assets', originalBody);
    expect(observed.requests.some((entry) => entry === `PUT ${source}${copiedPath}`)).toBe(true);
    expect(observed.blocked).toEqual([]);
    expect(observed.errors).toEqual([]);
  } finally {
    console.log(`H6 FULL UI TRACE ${JSON.stringify(observed).replaceAll(token, '[redacted]')}`);
    await context.close();
  }
});

test('full H6: independent real Browse create, copy and trash', async ({ request, browser }) => {
  test.skip(!fullFlow, 'Run only in explicitly selected full-flow mode');
  test.skip(!fs.existsSync(`${scratch}/vertical-ready`), 'A passing vertical case is required');
  test.setTimeout(150000);
  const h6 = '/h6test/sites/work/source/browsecopydoc.html';
  const da = '/source/h6test/work/browsecopydoc.html';
  const observed = { requests: [], responses: [], blocked: [], errors: [], missing: [], sockets: [] };
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await install(page, observed);
    await page.goto(browseRoot());
    await createBrowseItem(page, 'folder', 'h5folder');
    await expect.poll(async () => {
      verifyOwner();
      return (await request.get(`${source}/h6test/sites/work/source/h5folder/`, { headers: { authorization: `Bearer ${token}` }, maxRedirects: 0 })).status();
    }, { timeout: 30000 }).toBe(200);
    await createBrowseItem(page, 'document', 'browsecopydoc');
    await expect(page).toHaveURL(/\/canvas\?.*da-source=da-rs.*#\/h6test\/work\/browsecopydoc/);
    const editor = page.locator('ew-editor-doc .ProseMirror');
    await expect(editor).toHaveAttribute('contenteditable', 'true', { timeout: 30000 });
    await editor.click();
    await page.keyboard.type('Browse created and copied');
    expect((await page.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    const original = await api(request, 'GET', h6, undefined, 200);
    const originalBody = await original.text();
    expect(originalBody).toContain('Browse created and copied');
    const identity = (await api(request, 'HEAD', da, undefined, 200)).headers()['x-da-id'];
    const version = await api(request, 'POST', `${h6}/.versions?operation=version&comment=Browse%20snapshot`, undefined, 201, undefined, { 'if-match': original.headers().etag });
    const location = version.headers().location;
    expect(location).toMatch(/^\/h6test\/sites\/work\/source\/browsecopydoc\.html\/\.versions\/[^/]+$/);
    const copiedPath = await copyBrowseDocument(page, request, 'browsecopydoc', 'h5folder', originalBody);
    expect(observed.requests.some((entry) => entry === `PUT ${source}${copiedPath}`)).toBe(true);
    await page.goto(browseRoot());
    const row = page.locator('da-browse da-list-item').filter({ hasText: 'browsecopydoc' });
    await expect(row).toBeVisible({ timeout: 30000 });
    await row.getByRole('checkbox', { name: 'Select item' }).check();
    await confirmBrowseDelete(page);
    await expect(row).toHaveCount(0);
    await api(request, 'GET', h6, undefined, 404);
    const { route: trashRoute } = await findTrashedById(request, identity);
    expect((await api(request, 'HEAD', trashRoute, undefined, 200)).headers()['x-da-id']).toBe(identity);
    expect(await (await api(request, 'GET', location, undefined, 200)).text()).toBe(originalBody);
    expect(observed.requests.some((entry) => entry === `DELETE ${source}${h6}`)).toBe(true);
    expect(observed.blocked).toEqual([]);
    expect(observed.errors).toEqual([]);
  } finally {
    console.log(`H6 BROWSE TRACE ${JSON.stringify(observed).replaceAll(token, '[redacted]')}`);
    await context.close();
  }
});

test('full H6: alias room and delayed real PUT fence in both API directions', async ({ request, browser }) => {
  test.skip(!fullFlow, 'Run only in explicitly selected full-flow mode');
  test.skip(!fs.existsSync(`${scratch}/vertical-ready`), 'A passing vertical case is required');
  test.setTimeout(180000);
  const gate = `http://127.0.0.1:${process.env.H6_GATE_PORT}`;
  const control = async (method, action, verify = true) => {
    if (verify) verifyOwner();
    const response = await request.fetch(`${gate}/__gate__/${action}`, { method, headers: { 'x-h6-gate': process.env.H6_GATE_NONCE }, maxRedirects: 0 });
    expect(response.status()).toBe(200);
    return response.json();
  };
  const noticeControl = async (method, action, name, verify = true) => {
    if (verify) verifyOwner();
    const suffix = name ? `?name=${encodeURIComponent(name)}` : '';
    const response = await request.fetch(`${notice}/__notice__/${action}${suffix}`, { method, headers: { 'x-h6-notice': process.env.H6_NOTICE_NONCE }, maxRedirects: 0 });
    expect(response.status()).toBe(200);
    return response.json();
  };
  const observed = { requests: [], responses: [], blocked: [], errors: [], missing: [], sockets: [] };
  const context = await browser.newContext({ serviceWorkers: 'block' });
  try {
    const page = await context.newPage();
    await install(page, observed);
    for (const [name, externalShape] of [['race', 'da'], ['race-reverse', 'h6']]) {
      const h6 = `/h6test/sites/work/source/${name}.html`;
      const da = `/source/h6test/work/${name}.html`;
      const mixedCaseDa = `/source/h6test/work/${name.replace(/^r/, 'R')}.html`;
      const initial = `<body><main><div><p>Initial ${name}</p></div></main></body>`;
      const newer = `<body><main><div><p>External newer ${name}</p></div></main></body>`;
      await api(request, 'POST', h6, initial, 201, 'text/html');
      const notifications = () => fs.readFileSync(`${scratch}/collab.log`, 'utf8').split(`Admin API ${source}${da}`).length - 1;
      await expect.poll(notifications, { timeout: 30000 }).toBeGreaterThan(0);
      let navigations = 0;
      const onNavigation = (frame) => { if (frame === page.mainFrame()) navigations += 1; };
      page.on('framenavigated', onNavigation);
      await page.goto(`${ui}/canvas?da-admin=local&da-source=da-rs&da-collab=local#/h6test/work/${name}`);
      const editor = page.locator('ew-editor-doc .ProseMirror');
      await expect(editor).toContainText(`Initial ${name}`, { timeout: 30000 });
      await expect(editor).toHaveAttribute('contenteditable', 'true');
      await page.evaluate(async ({ workerOrigin, alias, identity }) => {
        const { Y, WebsocketProvider } = await import('da-y-wrapper');
        const doc = new Y.Doc();
        const provider = new WebsocketProvider(workerOrigin, alias, doc, { protocols: ['yjs', identity] });
        window.h6Alias = { doc, provider };
      }, { workerOrigin: collab.replace('http:', 'ws:'), alias: `${source}${mixedCaseDa}`, identity: token });
      await expect.poll(() => page.evaluate(() => window.h6Alias?.provider.synced === true), { timeout: 30000 }).toBe(true);
      await page.evaluate(() => window.h6Alias.doc.getMap('h5-room-check').set('sentinel', 'shared'));
      await expect.poll(() => page.evaluate(() => document.querySelector('ew-editor-doc')?._proseContext?.ydoc.getMap('h5-room-check').get('sentinel')), { timeout: 10000 }).toBe('shared');
      // Settle any save caused by the room-identity sentinel before arming the real race.
      expect((await page.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
      const stableEtag = (await api(request, 'GET', h6, undefined, 200)).headers().etag;
      expect(stableEtag).toMatch(/^"[^"]+"$/);
      await page.evaluate(() => { sessionStorage.removeItem('h6-canvas-close-codes'); sessionStorage.removeItem('h6-alias-close-codes'); });
      const notificationsBefore = notifications();
      await control('POST', 'arm');
      await editor.click();
      await editor.press('End');
      await page.keyboard.type(' old delayed edit');
      await expect.poll(async () => (await control('GET', 'status')).state, { timeout: 30000 }).toBe('pending');
      const pending = await control('GET', 'status');
      expect(pending.match).toMatch(/^"[^"]+"$/);
      expect(pending.match).toBe(stableEtag);
      expect(pending.containsEdit).toBe(true);
      expect(pending.contentType).toMatch(/^text\/html(?:;.*)?$/i);
      expect(pending.initiator).toBe('collab');
      const statusBefore = navigations;
      await noticeControl('POST', 'arm', name);
      await api(request, 'PUT', externalShape === 'da' ? da : h6, newer, 201, 'text/html', { 'if-match': pending.match });
      // Both nonce-protected listeners were ownership-checked before the write.
      // Avoid repeated lsof/ps calls while holding the sender's 3-second request.
      await expect.poll(async () => (await noticeControl('GET', 'status', undefined, false)).state, { timeout: 30000 }).toBe('pending');
      const heldNotice = await noticeControl('GET', 'status', undefined, false);
      expect(heldNotice.received).toBe(1);
      expect(heldNotice.forwarded).toBe(0);
      expect(notifications()).toBe(notificationsBefore);
      await control('POST', 'release', false);
      await expect.poll(async () => (await control('GET', 'status', false)).status, { timeout: 30000 }).toBe(412);
      await expect.poll(() => page.evaluate(() => sessionStorage.getItem('h6-canvas-close-codes') || '').catch(() => ''), { timeout: 30000 }).toContain('4412');
      expect((await noticeControl('GET', 'status', undefined, false)).state).toBe('pending');
      await noticeControl('POST', 'release', undefined, false);
      verifyOwner();
      await expect.poll(async () => (await noticeControl('GET', 'status')).forwarded, { timeout: 30000 }).toBe(1);
      expect((await noticeControl('GET', 'status')).received).toBe(1);
      await expect.poll(notifications, { timeout: 30000 }).toBe(notificationsBefore + 1);
      // da-rs retries a timed-out notification after its three-second deadline.
      await new Promise((resolve) => setTimeout(resolve, 3200));
      expect(notifications()).toBe(notificationsBefore + 1);
      await expect.poll(() => navigations, { timeout: 30000 }).toBeGreaterThan(statusBefore);
      await expect(page.locator('ew-editor-doc .ProseMirror')).toContainText(`External newer ${name}`, { timeout: 30000 });
      expect(await (await api(request, 'GET', h6, undefined, 200)).text()).toContain(`External newer ${name}`);
      console.log(`H6 RACE RECEIPT ${JSON.stringify({ name, mixedCaseDa, externalShape, ifMatch: pending.match, containsEdit: pending.containsEdit, contentType: pending.contentType, initiator: pending.initiator, workerStatus: 412, close: 4412, notificationReceived: heldNotice.received, notificationForwarded: 1 })}`);
      page.off('framenavigated', onNavigation);
    }
    expect(observed.blocked).toEqual([]);
    expect(observed.errors).toEqual([]);
  } finally {
    try { if ((await control('GET', 'status')).state === 'pending') await control('POST', 'release'); } catch { /* runner owns and releases the gate on exit */ }
    try { if ((await noticeControl('GET', 'status')).state === 'pending') await noticeControl('POST', 'release'); } catch { /* runner owns and releases the notification gate on exit */ }
    console.log(`H6 RACE TRACE ${JSON.stringify(observed).replaceAll(token, '[redacted]')}`);
    await context.close();
  }
});
