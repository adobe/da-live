/* Real da-live components against isolated da-rs. This is not the full DA shell. */
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repo = path.resolve(__dirname, '../../..');
const port = Number(process.env.POC_PORT);
const pid = Number(process.env.POC_RS_PID);
const store = process.env.POC_STORE;
const scratch = process.env.POC_SCRATCH;
const runner = Number(process.env.POC_RUN_PID);
const origin = `http://127.0.0.1:${port}`;
const site = '/pocui/campaign';
const branch = '/pocui/campaign~work';
const html = (text) => `<body><header></header><main><div><p>${text}</p></div></main><footer></footer></body>`;
const image1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
const image2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC', 'base64');

function verifyOwner() {
  if (!Number.isInteger(port) || port < 1024 || !Number.isInteger(pid) || !Number.isInteger(runner)
    || !scratch?.startsWith('/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode/branching-i2-')
    || store !== `${scratch}/oak`) throw new Error('Use run.cjs');
  const parent = Number(execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' }).trim());
  if (parent !== runner) throw new Error('da-rs is not a child of the local runner');
  const listener = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim().split('\n');
  const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (listener.length !== 2 || !new RegExp(`\\s${pid}\\s`).test(listener[1]) || !listener[1].includes(`127.0.0.1:${port} (LISTEN)`)
    || !command.includes(`-Dda-rs.oak.directory=${store}`) || !command.includes('-Dda-rs.security.enabled=false')) throw new Error('Unexpected local server');
}

async function call(request, method, route, data, status = 200, type = 'text/html', headers = {}) {
  verifyOwner();
  const response = await request.fetch(`${origin}${route}`, { method, data, headers: { ...(data ? { 'Content-Type': type } : {}), ...headers }, maxRedirects: 0 });
  expect(response.status(), `${method} ${route}: ${await response.text()}`).toBe(status);
  return response;
}

async function image(request, route, buffer, headers = {}) {
  verifyOwner();
  const response = await request.put(`${origin}${route}`, { multipart: { data: { name: 'image.png', mimeType: 'image/png', buffer } }, headers, maxRedirects: 0 });
  expect(response.status(), await response.text()).toBe(201);
}

// The shell and IMS are deliberately not emulated. Only NX's provider identity
// is a test fixture; all Branching/Source/log responses are the real server.
const shell = `<!doctype html><meta charset="utf-8">
<script type="importmap">{"imports":{"da-lit":"/deps/lit/dist/index.js","da-y-wrapper":"/deps/da-y-wrapper/dist/index.js","da-parser":"/deps/da-parser/dist/index.js","hast-util-from-html":"/test/fixtures/hast-stub.js"}}</script>
<button id="history">Open history</button>
<script type="module">
  import { setNx } from '/scripts/utils.js';
  import '/blocks/shared/branch-selector/branch-selector.js';
  import '/blocks/shared/site-history/site-history.js';
  setNx('/nx');
  const [, org, site] = location.hash.split('/');
  const el = document.createElement('da-branch-selector');
  Object.assign(el, { org, site }); document.body.append(el);
  document.querySelector('#history').onclick = () => {
    const h = document.createElement('da-site-history');
    Object.assign(h, { org, site }); document.body.append(h);
  };
</script>`;

async function safeRoutes(page) {
  await page.addInitScript(() => { window.WebSocket = class { constructor() { throw new Error('WebSockets are not enabled in the component harness'); } }; });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === 'http://localhost:8787') {
      verifyOwner();
      const response = await route.fetch({ url: `${origin}${url.pathname}${url.search}`, maxRedirects: 0 });
      return route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': 'http://localhost:1', 'access-control-allow-methods': 'GET, HEAD, PUT, POST, DELETE, OPTIONS', 'access-control-allow-headers': '*', 'access-control-expose-headers': '*' } });
    }
    if (url.origin === 'https://main--da-nx--adobe.aem.live' && url.pathname === '/nx2/utils/api.js') {
      return route.fulfill({ contentType: 'text/javascript', body: 'export async function isHlx6() { return false; }' });
    }
    if (url.origin === 'https://main--da-nx--adobe.aem.live' && url.pathname === '/nx2/utils/utils.js') {
      return route.fulfill({ contentType: 'text/javascript', body: "export const DA_ADMIN = 'http://localhost:8787';" });
    }
    if (url.origin !== 'http://localhost:1') return route.abort('blockedbyclient');
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: shell });
    if (!/^\/(blocks|scripts|deps|test\/fixtures)\//.test(url.pathname)) return route.abort('blockedbyclient');
    const file = path.resolve(repo, `.${decodeURIComponent(url.pathname)}`);
    if (!file.startsWith(`${repo}/`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return route.abort('blockedbyclient');
    return route.fulfill({ body: fs.readFileSync(file), contentType: file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream' });
  });
}

test('real selector, Changes, conflict and Site History components against local da-rs', async ({ request, page }) => {
  await call(request, 'GET', `/source${site}/edit.html`, undefined, 404);
  await call(request, 'GET', `/config${site}`, undefined, 404);
  const createOnly = { 'If-None-Match': '*' };
  await call(request, 'PUT', `/source${site}/edit.html`, html('base'), 201, 'text/html', createOnly);
  await call(request, 'PUT', `/source${site}/other.html`, html('other'), 201, 'text/html', createOnly);
  await call(request, 'PUT', `/source${site}/default.html`, html('before'), 201, 'text/html', createOnly);
  await call(request, 'PUT', `/source${site}/sheet.json`, '{"row":1}', 201, 'application/json', createOnly);
  await call(request, 'PUT', `/config${site}`, '{"setting":1}', 201, 'application/json', createOnly);
  await image(request, `/source${site}/image.png`, image1, createOnly);
  for (const [file, value] of Object.entries({ 'edit.html': 'base', 'other.html': 'other', 'default.html': 'before' })) {
    expect(await (await call(request, 'GET', `/source${site}/${file}`)).text()).toBe(html(value));
  }
  expect(await (await call(request, 'GET', `/source${site}/sheet.json`)).text()).toBe('{"row":1}');
  expect(await (await call(request, 'GET', `/source${site}/image.png`)).body()).toEqual(image1);
  expect(await (await call(request, 'GET', `/config${site}`)).json()).toEqual({ setting: 1 });
  await call(request, 'GET', `/source${site}/new.html`, undefined, 404);
  await call(request, 'POST', `/branches${site}/enable`);
  await safeRoutes(page);
  const deliveryAttempts = [];
  page.on('request', (requestEvent) => {
    const url = new URL(requestEvent.url());
    if (/^\/(preview|live|snapshot)(\/|$)/.test(url.pathname)) deliveryAttempts.push(requestEvent.url());
  });
  await page.goto('http://localhost:1/?da-admin=local&da-collab=local#/pocui/campaign');
  const selector = page.locator('da-branch-selector');
  await expect(selector.getByText('Default · main').first()).toBeVisible();
  await selector.locator('.branch-trigger').click();
  await selector.locator('input[name=name]').fill('work');
  await selector.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/campaign~work/);
  await expect(selector.locator('.branch-trigger')).toHaveText('Branch · work');
  await call(request, 'PUT', `/source${branch}/edit.html`, html('branch'), 201);
  await call(request, 'PUT', `/source${branch}/new.html`, html('new'), 201);
  await call(request, 'DELETE', `/source${branch}/other.html`, undefined, 204);
  await call(request, 'PUT', `/source${branch}/sheet.json`, '{"row":2}', 201, 'application/json');
  await call(request, 'PUT', `/config${branch}`, '{"setting":2}', 201, 'application/json');
  await image(request, `/source${branch}/image.png`, image2);
  await selector.getByRole('button', { name: 'Changes', exact: true }).click();
  const changes = selector.locator('da-branch-changes');
  await expect(changes).toContainText('/edit.html');
  await expect(changes).toContainText('/new.html');
  await expect(changes).toContainText('/other.html');
  await changes.getByRole('button', { name: '/edit.html', exact: true }).click();
  await expect(changes.locator('.diff-body del')).toContainText('base');
  await expect(changes.locator('.diff-body ins')).toContainText('branch');
  expect(await (await call(request, 'GET', `/source${site}/sheet.json`)).text()).toBe('{"row":1}');
  expect(await (await call(request, 'GET', `/source${site}/image.png`)).body()).toEqual(image1);
  expect(await (await call(request, 'GET', `/config${site}`)).json()).toEqual({ setting: 1 });
  await call(request, 'PUT', `/source${site}/default.html`, html('disjoint'), 201);
  expect(await (await call(request, 'GET', `/source${branch}/default.html`)).text()).toBe(html('before'));
  const conflicts = selector.locator('da-branch-conflicts');
  await conflicts.getByRole('button', { name: 'Sync from default' }).click();
  await expect(conflicts).toContainText('Sync completed.');
  expect(await (await call(request, 'GET', `/source${branch}/default.html`)).text()).toBe(html('disjoint'));
  await call(request, 'PUT', `/source${site}/edit.html`, html('default'), 201);
  await conflicts.getByRole('button', { name: 'Publish to default', exact: true }).click();
  await expect(conflicts.getByText('This does not publish to AEM preview or live.')).toBeVisible();
  const cleanup = conflicts.getByRole('checkbox', { name: 'Delete this branch after publishing' });
  await expect(cleanup).not.toBeChecked();
  await cleanup.check();
  await conflicts.getByRole('button', { name: 'Confirm publish to default' }).click();
  await expect(conflicts.getByText('Sync needs resolution', { exact: true })).toBeVisible();
  await call(request, 'GET', `/branches${site}/work`);
  await conflicts.getByRole('button', { name: '/edit.html' }).click();
  await expect(conflicts.locator('.diff-body del')).toContainText('base');
  await expect(conflicts.locator('.diff-body ins')).toContainText('branch');
  await conflicts.getByRole('button', { name: 'Base → Default' }).click();
  await expect(conflicts.locator('.diff-body ins')).toContainText('default');
  await conflicts.getByRole('button', { name: 'Keep branch' }).click();
  await conflicts.getByRole('button', { name: 'Complete sync' }).click();
  await expect(conflicts).toContainText('Sync completed.');
  await conflicts.getByRole('button', { name: 'Publish to default', exact: true }).click();
  await expect(cleanup).not.toBeChecked();
  await conflicts.getByRole('button', { name: 'Confirm publish to default' }).click();
  await expect(conflicts).toContainText('Changes merged into default — not published to live.');
  expect(deliveryAttempts).toEqual([]);
  expect(await (await call(request, 'GET', `/source${site}/edit.html`)).text()).toBe(html('branch'));
  expect(await (await call(request, 'GET', `/source${site}/sheet.json`)).text()).toBe('{"row":2}');
  expect(await (await call(request, 'GET', `/source${site}/image.png`)).body()).toEqual(image2);
  expect(await (await call(request, 'GET', `/config${site}`)).json()).toEqual({ setting: 2 });
  await page.goto('http://localhost:1/?da-admin=local#/pocui/campaign');
  await page.locator('#history').click();
  const history = page.locator('da-site-history');
  await history.getByRole('button', { name: /merge ·/ }).first().click();
  await expect(history).toContainText('/edit.html');
  await history.getByRole('button', { name: 'Revert commit' }).click();
  await expect(history).toContainText('Revert applied.');
  expect(await (await call(request, 'GET', `/source${site}/edit.html`)).text()).toBe(html('default'));
  expect(await (await call(request, 'GET', `/source${site}/sheet.json`)).text()).toBe('{"row":1}');
  expect(await (await call(request, 'GET', `/source${site}/image.png`)).body()).toEqual(image1);
  expect(await (await call(request, 'GET', `/config${site}`)).json()).toEqual({ setting: 1 });
  await page.reload();
  await selector.locator('.branch-trigger').click();
  await selector.locator('input[name=name]').fill('cleanup');
  await selector.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(selector.locator('.branch-trigger')).toHaveText('Branch · cleanup');
  await call(request, 'PUT', `/source${site}~cleanup/edit.html`, html('publish and delete'), 201);
  await conflicts.getByRole('button', { name: 'Publish to default', exact: true }).click();
  await cleanup.check();
  await conflicts.getByRole('button', { name: 'Confirm publish to default' }).click();
  await expect(selector.locator('.branch-trigger')).toHaveText('Default · main');
  await expect(page).toHaveURL(new RegExp(`#${site}$`));
  await call(request, 'GET', `/branches${site}/cleanup`, undefined, 404);
  expect(await (await call(request, 'GET', `/source${site}/edit.html`)).text()).toBe(html('publish and delete'));
});

test('real selector hides on a non-enabled site', async ({ request, page }) => {
  const control = '/pocuicontrol/site';
  await call(request, 'GET', `/source${control}/page.html`, undefined, 404);
  await call(request, 'PUT', `/source${control}/page.html`, html('control'), 201, 'text/html', { 'If-None-Match': '*' });
  await safeRoutes(page);
  const capability = page.waitForResponse((response) => response.url().endsWith(`/branches${control}/capabilities`));
  await page.goto('http://localhost:1/?da-admin=local#/pocuicontrol/site');
  expect((await (await capability).json()).supported).toBe(false);
  await expect.poll(async () => page.locator('da-branch-selector').evaluate((el) => !!el.shadowRoot)).toBe(true);
  await expect(page.locator('da-branch-selector .branch-trigger')).toHaveCount(0);
  const response = await call(request, 'GET', `/source${control}/page.html`);
  expect(response.headers()['content-branch']).toBeUndefined();
});
