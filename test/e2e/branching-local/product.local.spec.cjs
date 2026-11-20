/* Real DA browse/edit route blocks, local NX chrome/auth shims, real Source and Worker. */
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');

const repo = path.resolve(__dirname, '../../..');
const scratch = process.env.POC_SCRATCH;
const port = Number(process.env.POC_PORT);
const pid = Number(process.env.POC_RS_PID);
const runner = Number(process.env.POC_RUN_PID);
const source = `http://127.0.0.1:${port}`;
const collab = new URL(process.env.POC_COLLAB_ORIGIN);
const root = '/pocproduct/campaign';
const doc = (text) => `<body><header></header><main><div><p>${text}</p></div></main><footer></footer></body>`;

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

async function api(request, method, route, data, status = 200, headers = {}) {
  verifyOwner();
  const response = await request.fetch(`${source}${route}`, { method, data, headers, maxRedirects: 0 });
  expect(response.status(), `${method} ${route}: ${await response.text()}`).toBe(status);
  return response;
}

// Sidekick configuration discovery is not delivery; detect both legacy and
// Helix delivery endpoints, including requests blocked by the local route guard.
function deliveryRequests(requests) {
  return requests.filter(({ url }) => {
    const target = new URL(url);
    return /^\/(?:api\/)?(?:preview|live|snapshot|snapshots)(?:\/|$)/.test(target.pathname)
      || /^\/[^/]+\/sites\/[^/]+\/(?:preview|live|snapshot|snapshots)(?:\/|$)/.test(target.pathname)
      || (target.hostname !== 'api.aem.live'
        && /\.(?:aem\.live|aem\.page|preview\.da\.live)$/.test(target.hostname));
  });
}

const shell = `<!doctype html><meta charset="utf-8">
<script type="importmap">{"imports":{"da-lit":"/deps/lit/dist/index.js","da-y-wrapper":"/deps/da-y-wrapper/dist/index.js","da-parser":"/deps/da-parser/dist/index.js","hast-util-from-html":"/test/fixtures/hast-stub.js"}}</script>
<main><div id="route"></div></main>
<script type="module">
  import { setNx } from '/scripts/utils.js';
  setNx('/test/fixtures/nx', {hostname: 'example.com'});
  const { hashChange } = await import('/test/fixtures/nx/utils/utils.js');
  const { default: details } = await import('/blocks/shared/pathDetails.js');
  hashChange._set(details());
  if (!new URLSearchParams(location.search).has('nohashshim')) window.addEventListener('hashchange', () => hashChange._set(details()));
  const route = location.pathname === '/edit' ? 'edit' : ['/sheet', '/config'].includes(location.pathname) ? 'sheet' : 'browse';
  const { default: init } = await import('/blocks/' + route + '/' + route + '.js');
  await init(document.querySelector('#route'));
  sessionStorage.setItem('productRouteLoads', String(Number(sessionStorage.getItem('productRouteLoads') || 0) + 1));
  window.routeStarted = route;
</script>`;

const nxUtils = `
export const DA_ADMIN = 'http://localhost:8787';
export const DA_COLLAB = 'ws://localhost:4711';
export const loadScript = async () => {};
const styles = new Map();
export function loadStyle(input) {
  const url = input.replace(/\\.js(?:\\?.*)?$/, '.css');
  if (!styles.has(url)) styles.set(url, (async () => {
    const response = await fetch(url);
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(response.ok ? await response.text() : '');
    return sheet;
  })());
  return styles.get(url);
}
let state = {};
const subscribers = new Set();
export const hashChange = { subscribe(fn) { subscribers.add(fn); fn(state); return () => subscribers.delete(fn); }, _set(value) { state = value; subscribers.forEach((fn) => fn(value)); } };
`;

async function install(page, uiOrigin, observed) {
  await page.addInitScript(({ wsOrigin }) => {
    const Native = window.WebSocket;
    window.WebSocket = class extends Native {
      constructor(url, protocols) {
        const target = new URL(url);
        if (target.origin !== 'ws://localhost:4711') throw new Error(`Blocked WebSocket ${target.origin}`);
        super(`${wsOrigin}${target.pathname}${target.search}`, protocols);
      }
    };
  }, { wsOrigin: collab.origin.replace('http:', 'ws:') });
  page.on('pageerror', (error) => { observed.errors.push(error.message); console.error(`Product page error: ${error.stack || error.message}`); });
  page.on('request', (request) => { observed.requests.push({ method: request.method(), url: request.url() }); });
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return;
    observed.navigations.push(frame.url());
    if (observed.navigations.length > 100) observed.navigations.shift();
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://localhost:8787') {
      if (!['GET', 'HEAD', 'OPTIONS'].includes(route.request().method())) verifyOwner();
      try {
        const response = await route.fetch({ url: `${source}${url.pathname}${url.search}`, maxRedirects: 0 });
        return await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': uiOrigin, 'access-control-allow-methods': 'GET, HEAD, PUT, POST, DELETE, OPTIONS', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' } });
      } catch (error) {
        if (observed.closing) return undefined;
        throw error;
      }
    }
    // The WTR NX client probes this external service to select a provider.
    // Return only its local non-upgraded signal; never perform a network call.
    if (url.origin === 'https://admin.hlx.page' && url.pathname.startsWith('/ping/') && route.request().method() === 'GET') {
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': uiOrigin }, body: '' });
    }
    // Delivery configuration is an external UI dependency, not Source or collaboration.
    if (url.origin === 'https://admin.hlx.page' && url.pathname.startsWith('/sidekick/') && route.request().method() === 'GET') {
      observed.sidekick.push(url.href);
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': uiOrigin }, body: '{}' });
    }
    if (url.origin !== uiOrigin) { observed.blocked.push(`${route.request().method()} ${url.href}`); return route.abort('blockedbyclient'); }
    if (['/', '/edit', '/sheet', '/config'].includes(url.pathname)) return route.continue();
    if (url.pathname === '/test/fixtures/nx/utils/utils.js') return route.fulfill({ contentType: 'text/javascript', body: nxUtils });
    if (url.pathname === '/test/fixtures/nx/utils/script.js') return route.fulfill({ contentType: 'text/javascript', body: `export default function loadScript(src) {
      if (!src.startsWith('/deps/')) throw new Error('Blocked script');
      return new Promise((resolve, reject) => { const script = document.createElement('script'); script.src = src; script.onload = resolve; script.onerror = reject; document.head.append(script); });
    }` });
    if (url.pathname === '/test/fixtures/nx/blocks/shared/menu/menu.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, 'nx-menu-fixture.js')) });
    if (url.pathname === '/test/fixtures/nx/public/sl/components.js') return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(path.join(__dirname, 'sl-fixture.js')) });
    if (url.pathname === '/test/fixtures/nx2/utils/ims.js') return route.fulfill({ contentType: 'text/javascript', body: "export async function loadIms() { return { accessToken: { token: 'local-fixture' } }; } export function handleSignIn() {}" });
    if (url.pathname === '/test/fixtures/nx2/utils/utils.js') {
      let body = fs.readFileSync(path.join(repo, 'test/fixtures/nx2/utils/utils.js'), 'utf8');
      body = body.replace("export const DA_ADMIN = 'https://admin.da.live';", "export const DA_ADMIN = 'http://localhost:8787';")
        .replace('export const ALLOWED_TOKEN = [DA_ADMIN, HLX_ADMIN, AEM_API];', 'export const ALLOWED_TOKEN = [];');
      if (!body.includes("DA_ADMIN = 'http://localhost:8787'") || !body.includes('ALLOWED_TOKEN = []')) throw new Error('NX fixture changed; refuse unsafe routing');
      return route.fulfill({ contentType: 'text/javascript', body });
    }
    if (!/^\/(blocks|scripts|deps|img|test\/fixtures)\//.test(url.pathname)) return route.abort('blockedbyclient');
    const file = path.resolve(repo, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(`${repo}/`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      observed.missing.push(url.pathname);
      return route.fulfill({ status: 404, body: '' });
    }
    const ext = path.extname(file);
    const contentType = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' }[ext] || 'application/octet-stream';
    return route.fulfill({ body: fs.readFileSync(file), contentType });
  });
}

test('real browse and legacy editor: create, edit, flush, switch and delete', async ({ request, browser }) => {
  test.setTimeout(120000);
  await api(request, 'GET', `/source${root}/edit.html`, undefined, 404);
  for (const [site, name, value] of [[root, 'edit', 'original'], [root, 'delete', 'keep on default']]) {
    await api(request, 'PUT', `/source${site}/${name}.html`, doc(value), 201, { 'Content-Type': 'text/html', 'If-None-Match': '*' });
  }
  expect(await (await api(request, 'GET', `/source${root}/edit.html`)).text()).toBe(doc('original'));
  await api(request, 'POST', `/branches${root}/enable`);
  const server = http.createServer((req, res) => {
    if (!['/', '/edit', '/sheet', '/config'].includes(new URL(req.url, 'http://localhost').pathname)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(shell);
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const uiOrigin = `http://localhost:${server.address().port}`;
  const observed = { requests: [], blocked: [], errors: [], missing: [], sidekick: [], flushes: [], navigations: [] };
  let context;
  try {
    context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    page.on('websocket', (socket) => socket.on('framesent', ({ payload }) => {
      if (Buffer.isBuffer(payload) && payload[0] === 2) observed.flushes.push(socket.url());
    }));
    await install(page, uiOrigin, observed);
    await page.goto(`${uiOrigin}/?browse=1&da-admin=local&da-collab=local&da-content=local#${root}`);
    await expect.poll(() => page.evaluate(() => window.routeStarted)).toBe('browse');
    await expect(page.locator('da-browse da-list-item').filter({ hasText: 'edit' })).toBeVisible();
    const selector = page.locator('da-branch-selector');
    await expect(selector.locator('.branch-trigger')).toHaveText('Default · main');
    await selector.locator('.branch-trigger').click();
    await selector.locator('input[name=name]').fill('work');
    await selector.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL(/campaign~work/);
    await expect(selector.locator('.branch-trigger')).toHaveText('Branch · work');
    const branchRequestsStart = observed.requests.length;
    const newMenu = page.locator('da-browse da-new nx-menu');
    await newMenu.getByRole('button', { name: 'New', exact: true }).click();
    await newMenu.getByRole('menuitem', { name: 'Page', exact: true }).click();
    await page.getByPlaceholder('document name').fill('new');
    await page.locator('da-name-dialog').getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL(/\/edit#\/pocproduct\/campaign~work\/new/);
    const editor = page.locator('da-content div.ProseMirror');
    await expect(editor).toBeVisible();
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await editor.click();
    await page.keyboard.type('Actual browser branch edit');
    await expect.poll(async () => (await (await api(request, 'GET', `/source${root}~work/new.html`)).text()).includes('Actual browser branch edit'), { timeout: 20000 }).toBe(true);
    await expect(page.locator('da-title').getByRole('button', { name: 'Preview', exact: true })).toHaveCount(0);
    await expect(page.locator('da-title').getByRole('button', { name: 'Publish', exact: true })).toHaveCount(0);
    await editor.press('End');
    await page.keyboard.type(' flushed');
    expect(deliveryRequests(observed.requests.slice(branchRequestsStart))).toEqual([]);
    const beforeFlush = observed.flushes.length;
    const beforeNavigation = Number(await page.evaluate(() => sessionStorage.getItem('productRouteLoads')));
    await page.locator('da-branch-selector .branch-trigger').click();
    await page.locator('da-branch-selector').getByRole('button', { name: 'Default · main', exact: true }).click();
    await expect.poll(async () => {
      try { return Number(await page.evaluate(() => sessionStorage.getItem('productRouteLoads'))); } catch (error) {
        if (error.message.includes('Execution context was destroyed')) return -1;
        throw error;
      }
    }, { timeout: 20000 }).toBeGreaterThan(beforeNavigation);
    await expect(page).toHaveURL(/campaign\/new/);
    await expect(page.locator('da-branch-selector .branch-trigger')).toHaveText('Default · main');
    expect(observed.flushes.length).toBeGreaterThan(beforeFlush);
    await api(request, 'GET', `/source${root}/new.html`, undefined, 404);
    expect(await (await api(request, 'GET', `/source${root}~work/new.html`)).text()).toContain('Actual browser branch edit flushed');

    const branchBrowseStart = observed.requests.length;
    await page.goto(`${uiOrigin}/?browse=1#${root}~work`);
    const row = page.locator('da-browse da-list.da-list-type-browse da-list-item').filter({ hasText: 'delete' });
    await expect(row).toBeVisible();
    await row.getByRole('checkbox', { name: 'Select item' }).check();
    const actions = page.locator('da-browse da-list.da-list-type-browse da-actionbar');
    await expect(actions.locator('button.preview-button')).toHaveClass(/hide/);
    await expect(actions.locator('button.publish-button')).toHaveClass(/hide/);
    await expect(actions.locator('button.preview-button')).toBeHidden();
    await expect(actions.locator('button.publish-button')).toBeHidden();
    await actions.getByRole('button', { name: 'Delete', exact: true }).click();
    await expect(page.locator('da-dialog')).toContainText('Deleting 1 item');
    await page.locator('da-dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(async () => {
      verifyOwner();
      return (await request.get(`${source}/source${root}~work/delete.html`, { maxRedirects: 0 })).status();
    }).toBe(404);
    expect(await (await api(request, 'GET', `/source${root}/delete.html`)).text()).toBe(doc('keep on default'));
    expect(deliveryRequests(observed.requests.slice(branchBrowseStart))).toEqual([]);

    expect(observed.requests.some(({ method, url }) => !['GET', 'HEAD', 'OPTIONS'].includes(method) && !url.startsWith('http://localhost:8787/'))).toBe(false);
    expect(observed.errors).toEqual([]);
  } finally {
    console.log(`Product fixture blocked requests: ${JSON.stringify(observed.blocked)}`);
    console.log(`Product fixture missing assets: ${JSON.stringify([...new Set(observed.missing)])}`);
    console.log(`Product external sidekick GETs answered locally: ${JSON.stringify(observed.sidekick)}`);
    observed.closing = true;
    if (context) await context.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('branch browse selector navigates and settles on Default', async ({ request, browser }) => {
  test.setTimeout(45000);
  const site = '/pocswitch/campaign';
  await api(request, 'GET', `/source${site}/page.html`, undefined, 404);
  await api(request, 'PUT', `/source${site}/page.html`, doc('switch'), 201, { 'Content-Type': 'text/html', 'If-None-Match': '*' });
  await api(request, 'POST', `/branches${site}/enable`);
  await api(request, 'POST', `/branches${site}/`, { name: 'work' }, 201);
  const server = http.createServer((req, res) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(shell);
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const uiOrigin = `http://localhost:${server.address().port}`;
  const observed = { requests: [], blocked: [], errors: [], missing: [], sidekick: [], flushes: [], navigations: [] };
  let context;
  try {
    context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await install(page, uiOrigin, observed);
    const hashShim = process.env.POC_NO_HASH_SHIM === '1' ? '&nohashshim=1' : '';
    await page.goto(`${uiOrigin}/?browse=1&da-admin=local&da-collab=local&da-content=local${hashShim}#${site}~work`);
    const selector = page.locator('da-branch-selector');
    const trigger = selector.locator('.branch-trigger');
    const file = page.locator('da-browse da-list-item').filter({ hasText: 'page' });
    await expect(trigger).toHaveText('Branch · work');
    await expect(file).toBeVisible();
    const filePosition = await file.boundingBox();
    await trigger.click();
    await expect(selector.getByRole('dialog', { name: 'Content branches' })).toBeVisible();
    expect(await file.boundingBox()).toEqual(filePosition);
    await page.keyboard.press('Escape');
    await expect(selector.getByRole('dialog', { name: 'Content branches' })).toBeHidden();
    await trigger.click();
    await selector.getByRole('button', { name: 'Default · main', exact: true }).click();
    try { await expect(page).toHaveURL(new RegExp(`#${site}$`), { timeout: 5000 }); } catch (error) {
      console.error(`Browse switch diagnostic: ${JSON.stringify({ url: page.url(), navigations: observed.navigations.slice(-20) })}`);
      throw error;
    }
    await expect(selector.locator('.branch-trigger')).toHaveText('Default · main');
    await expect(page.locator('da-browse da-list-item').filter({ hasText: 'page' })).toBeVisible();
    // A transient Default hash is not success if the guard schedules another switch.
    await page.waitForTimeout(750);
    await expect(page).toHaveURL(new RegExp(`#${site}$`));
    await expect(selector.locator('.branch-trigger')).toHaveText('Default · main');
  } finally {
    observed.closing = true;
    if (context) await context.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('real sheet, config and media UI publish and revert mixed branch changes', async ({ request, browser }) => {
  test.setTimeout(150000);
  const site = '/pocmulti/campaign';
  const branch = `${site}~work`;
  const sheet = { ':type': 'sheet', ':sheetname': 'data', total: 1, limit: 1, offset: 0, data: [{ key: 'title', value: 'before' }] };
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
  await api(request, 'GET', `/source${site}/sheet.json`, undefined, 404);
  await api(request, 'GET', `/config${site}`, undefined, 404);
  await api(request, 'PUT', `/source${site}/page.html`, doc('before html'), 201, { 'Content-Type': 'text/html', 'If-None-Match': '*' });
  await api(request, 'PUT', `/source${site}/sheet.json`, JSON.stringify(sheet), 201, { 'Content-Type': 'application/json', 'If-None-Match': '*' });
  await api(request, 'PUT', `/config${site}`, JSON.stringify(sheet), 201, { 'Content-Type': 'application/json', 'If-None-Match': '*' });
  expect(await (await api(request, 'GET', `/source${site}/sheet.json`)).json()).toEqual(sheet);
  expect(await (await api(request, 'GET', `/config${site}`)).json()).toEqual(sheet);
  await api(request, 'POST', `/branches${site}/enable`);
  await api(request, 'POST', `/branches${site}/`, { name: 'work' }, 201);
  const server = http.createServer((req, res) => {
    if (!['/', '/edit', '/sheet', '/config'].includes(new URL(req.url, 'http://localhost').pathname)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(shell);
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const uiOrigin = `http://localhost:${server.address().port}`;
  const observed = { requests: [], blocked: [], errors: [], missing: [], sidekick: [], flushes: [], navigations: [] };
  let context;
  try {
    context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await install(page, uiOrigin, observed);
    const branchRequestsStart = observed.requests.length;
    await page.goto(`${uiOrigin}/edit?da-admin=local&da-collab=local&da-content=local#${branch}/page`);
    const editor = page.locator('da-content div.ProseMirror');
    await expect(editor).toContainText('before html');
    await editor.click();
    await editor.press('End');
    await page.keyboard.type(' branch html');
    await expect.poll(async () => (await (await api(request, 'GET', `/source${branch}/page.html`)).text()).includes('branch html'), { timeout: 20000 }).toBe(true);
    const flushed = await page.locator('da-content').evaluate((element) => element.forceSave());
    expect(flushed.ok).toBe(true);
    await page.goto(`${uiOrigin}/sheet#${branch}/sheet`);
    await expect(page.locator('da-sheet-tabs')).toBeVisible();
    await page.locator('[data-x="1"][data-y="1"]').dblclick();
    await page.locator('td input').fill('branch sheet');
    await page.keyboard.press('Enter');
    await expect.poll(async () => (await (await api(request, 'GET', `/source${branch}/sheet.json`)).json()).data?.[0]?.value, { timeout: 20000 }).toBe('branch sheet');
    expect((await (await api(request, 'GET', `/source${site}/sheet.json`)).json()).data[0].value).toBe('before');

    await page.goto(`${uiOrigin}/config#${branch}`);
    await expect(page.locator('da-sheet-tabs')).toBeVisible();
    await page.locator('[data-x="1"][data-y="1"]').dblclick();
    await page.locator('td input').fill('branch config');
    await page.keyboard.press('Enter');
    await page.locator('da-title button.da-title-action').filter({ hasText: 'Save' }).click();
    await expect.poll(async () => (await (await api(request, 'GET', `/config${branch}`)).json()).data?.[0]?.value, { timeout: 20000 }).toBe('branch config');
    expect((await (await api(request, 'GET', `/config${site}`)).json()).data[0].value).toBe('before');

    await page.goto(`${uiOrigin}/?browse=1#${branch}`);
    await expect(page.locator('da-browse da-new input[type=file]')).toBeAttached();
    const newMenu = page.locator('da-browse da-new nx-menu');
    await newMenu.getByRole('button', { name: 'New', exact: true }).click();
    const choosingFile = page.waitForEvent('filechooser');
    await newMenu.getByRole('menuitem', { name: 'Media', exact: true }).click();
    await (await choosingFile).setFiles({ name: 'upload.png', mimeType: 'image/png', buffer: image });
    await expect.poll(async () => {
      verifyOwner();
      return (await request.get(`${source}/source${branch}/upload.png`, { maxRedirects: 0 })).status();
    }, { timeout: 20000 }).toBe(200);
    expect(await (await api(request, 'GET', `/source${branch}/upload.png`)).body()).toEqual(image);
    await api(request, 'GET', `/source${site}/upload.png`, undefined, 404);
    const selector = page.locator('da-branch-selector');
    await expect(selector.locator('.branch-trigger')).toHaveText('Branch · work');
    const conflicts = selector.locator('da-branch-conflicts');
    await conflicts.getByRole('button', { name: 'Publish to default', exact: true }).click();
    await conflicts.getByRole('button', { name: 'Confirm publish to default' }).click();
    await expect(conflicts).toContainText('Changes merged into default — not published to live.');
    expect(await (await api(request, 'GET', `/source${site}/page.html`)).text()).toContain('branch html');
    expect((await (await api(request, 'GET', `/source${site}/sheet.json`)).json()).data[0].value).toBe('branch sheet');
    expect((await (await api(request, 'GET', `/config${site}`)).json()).data[0].value).toBe('branch config');
    expect(await (await api(request, 'GET', `/source${site}/upload.png`)).body()).toEqual(image);
    expect(deliveryRequests(observed.requests.slice(branchRequestsStart))).toEqual([]);
    // Open a separate Default tab so mixed-kind history remains independently
    // testable even if the branch-to-Default navigation scenario fails.
    const defaultPage = await context.newPage();
    await install(defaultPage, uiOrigin, observed);
    await defaultPage.goto(`${uiOrigin}/?browse=1#${site}`);
    await expect.poll(() => defaultPage.locator('da-browse').evaluate((element) => element._siteHistory), { timeout: 15000 }).toBe(true);
    const settings = defaultPage.locator('da-browse nx-menu').filter({ has: defaultPage.getByRole('button', { name: 'Settings' }) });
    await settings.getByRole('button', { name: 'Settings' }).click();
    await settings.getByRole('menuitem', { name: 'Site history' }).click();
    const history = defaultPage.locator('da-site-history');
    await history.getByRole('button', { name: /merge ·/ }).first().click();
    await expect(history).toContainText('/sheet.json');
    await expect(history).toContainText('config:/');
    await expect(history).toContainText('/upload.png');
    await history.getByRole('button', { name: 'Revert commit' }).click();
    await expect(history).toContainText('Revert applied.');
    expect(await (await api(request, 'GET', `/source${site}/page.html`)).text()).toBe(doc('before html'));
    expect(await (await api(request, 'GET', `/source${site}/sheet.json`)).json()).toEqual(sheet);
    expect(await (await api(request, 'GET', `/config${site}`)).json()).toEqual(sheet);
    await api(request, 'GET', `/source${site}/upload.png`, undefined, 404);
    expect(observed.requests.some(({ method, url }) => !['GET', 'HEAD', 'OPTIONS'].includes(method) && !url.startsWith('http://localhost:8787/'))).toBe(false);
    console.log('Mixed-kind product UI publish and revert content assertions completed');
    expect(observed.errors).toEqual([]);
  } finally {
    console.log(`Mixed UI fixture blocked requests: ${JSON.stringify(observed.blocked)}`);
    console.log(`Mixed UI fixture missing assets: ${JSON.stringify([...new Set(observed.missing)])}`);
    observed.closing = true;
    if (context) await context.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('non-enabled product routes retain bare Source and legacy collaboration requests', async ({ request, browser }) => {
  test.setTimeout(90000);
  const site = '/poccompat/control';
  await api(request, 'GET', `/source${site}/control.html`, undefined, 404);
  await api(request, 'PUT', `/source${site}/control.html`, doc('legacy control'), 201, { 'Content-Type': 'text/html', 'If-None-Match': '*' });
  const server = http.createServer((req, res) => {
    if (!['/', '/edit'].includes(new URL(req.url, 'http://localhost').pathname)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(shell);
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const uiOrigin = `http://localhost:${server.address().port}`;
  const observed = { requests: [], blocked: [], errors: [], missing: [], sidekick: [], flushes: [], navigations: [] };
  let context;
  try {
    context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await install(page, uiOrigin, observed);
    const capability = page.waitForResponse((response) => response.url().endsWith(`/branches${site}/capabilities`));
    await page.goto(`${uiOrigin}/?browse=1&da-admin=local&da-collab=local&da-content=local#${site}`);
    expect((await (await capability).json()).supported).toBe(false);
    const row = page.locator('da-browse da-list-item').filter({ hasText: 'control' });
    await expect(row).toBeVisible();
    await expect(page.locator('da-branch-selector .branch-trigger')).toHaveCount(0);
    await row.getByRole('link', { name: /control/ }).click();
    const editor = page.locator('da-content div.ProseMirror');
    await expect(editor).toContainText('legacy control');
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    await editor.click();
    await editor.press('End');
    await page.keyboard.type(' legacy edit');
    expect((await page.locator('da-content').evaluate((element) => element.forceSave())).ok).toBe(true);
    expect(await (await api(request, 'GET', `/source${site}/control.html`)).text()).toContain('legacy control legacy edit');
    const response = await api(request, 'GET', `/source${site}/control.html`);
    expect(response.headers()['content-branch']).toBeUndefined();
    const localRequests = observed.requests.filter(({ url }) => url.startsWith('http://localhost:8787/'));
    console.log(`Control DA requests: ${JSON.stringify(localRequests)}`);
    expect(localRequests.some(({ method, url }) => method === 'GET' && new URL(url).pathname === `/list${site}/`)).toBe(true);
    expect(localRequests.some(({ method, url }) => method === 'GET' && new URL(url).pathname === `/source${site}/control.html`)).toBe(true);
    expect(localRequests.some(({ url }) => url.includes('~') || url.includes('contentBranch='))).toBe(false);
    expect(fs.readFileSync(`${scratch}/collab.log`, 'utf8')).toContain(`SOURCE PUT /source${site}/control.html match=* status=201`);
    expect(observed.requests.some(({ method, url }) => !['GET', 'HEAD', 'OPTIONS'].includes(method) && !url.startsWith('http://localhost:8787/'))).toBe(false);
    expect(observed.errors).toEqual([]);
  } finally {
    console.log(`Control fixture blocked requests: ${JSON.stringify(observed.blocked)}`);
    console.log(`Control fixture missing assets: ${JSON.stringify([...new Set(observed.missing)])}`);
    observed.closing = true;
    if (context) await context.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('real browse Site History entry reverts a default commit', async ({ request, browser }) => {
  test.setTimeout(90000);
  const site = '/pochistory/campaign';
  await api(request, 'GET', `/source${site}/page.html`, undefined, 404);
  await api(request, 'PUT', `/source${site}/page.html`, doc('history before'), 201, { 'Content-Type': 'text/html', 'If-None-Match': '*' });
  await api(request, 'POST', `/branches${site}/enable`);
  await api(request, 'PUT', `/source${site}/page.html`, doc('history after'), 201, { 'Content-Type': 'text/html' });
  const server = http.createServer((req, res) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/') { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(shell);
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(0, '127.0.0.1', resolve));
  const uiOrigin = `http://localhost:${server.address().port}`;
  const observed = { requests: [], blocked: [], errors: [], missing: [], sidekick: [], flushes: [], navigations: [] };
  let context;
  try {
    context = await browser.newContext({ serviceWorkers: 'block' });
    const page = await context.newPage();
    await install(page, uiOrigin, observed);
    await page.goto(`${uiOrigin}/?browse=1&da-admin=local&da-collab=local&da-content=local#${site}`);
    await expect(page.locator('da-branch-selector .branch-trigger')).toHaveText('Default · main');
    await expect.poll(() => page.locator('da-browse').evaluate((element) => element._siteHistory), { timeout: 15000 }).toBe(true);
    const settings = page.locator('da-browse nx-menu').filter({ has: page.getByRole('button', { name: 'Settings' }) });
    await settings.getByRole('button', { name: 'Settings' }).click();
    await settings.getByRole('menuitem', { name: 'Site history' }).click();
    const history = page.locator('da-site-history');
    await history.getByRole('button', { name: /edit ·/ }).first().click();
    await expect(history).toContainText('/page.html');
    await history.getByRole('button', { name: 'Revert commit' }).click();
    await expect(history).toContainText('Revert applied.');
    expect(await (await api(request, 'GET', `/source${site}/page.html`)).text()).toBe(doc('history before'));
    expect(observed.requests.some(({ method, url }) => !['GET', 'HEAD', 'OPTIONS'].includes(method) && !url.startsWith('http://localhost:8787/'))).toBe(false);
    expect(observed.errors).toEqual([]);
  } finally {
    console.log(`History fixture blocked requests: ${JSON.stringify(observed.blocked)}`);
    console.log(`History fixture missing assets: ${JSON.stringify([...new Set(observed.missing)])}`);
    observed.closing = true;
    if (context) await context.close();
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
