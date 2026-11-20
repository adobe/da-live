/* Real da-rs API integration only; not a substitute for the browser/collab demo. */
const { test, expect } = require('@playwright/test');
const { execFileSync } = require('node:child_process');

const port = Number(process.env.POC_PORT);
const pid = Number(process.env.POC_RS_PID);
const store = process.env.POC_STORE;
const scratch = process.env.POC_SCRATCH;
const runner = Number(process.env.POC_RUN_PID);
const origin = `http://127.0.0.1:${port}`;
const html = (text) => `<body><header></header><main><div><p>${text}</p></div></main><footer></footer></body>`;
const image1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
const image2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC', 'base64');

function verifyOwner() {
  if (!Number.isInteger(port) || port < 1024 || !Number.isInteger(pid) || !Number.isInteger(runner)
    || !scratch?.startsWith('/private/var/folders/8f/crktqh_97mx5x7zqws2nxfqr0000gq/T/opencode/branching-i2-')
    || store !== `${scratch}/oak`) throw new Error('Use run.cjs; no external endpoint is accepted');
  const parent = Number(execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' }).trim());
  if (parent !== runner) throw new Error('da-rs is not a child of the local runner');
  const listener = execFileSync('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' });
  const rows = listener.trim().split('\n');
  if (rows.length !== 2 || !new RegExp(`\\s${pid}\\s`).test(rows[1]) || !rows[1].includes(`127.0.0.1:${port} (LISTEN)`)) throw new Error('Listener is not the isolated loopback child');
  const command = execFileSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
  if (!command.includes(`-Dda-rs.oak.directory=${store}`) || !command.includes('-Dda-rs.security.enabled=false') || !command.includes(`-Dquarkus.http.port=${port}`)) throw new Error('Unexpected server configuration');
}

function api(request, org) {
  const site = `/${org}/campaign`;
  const branch = `/${org}/campaign~work`;
  const lifecycle = `/branches${site}`;
  async function call(method, route, options = {}, status = 200) {
    if (!route.startsWith('/') || route.startsWith('//') || route.includes('..')) throw new Error('Invalid local route');
    verifyOwner();
    const response = await request.fetch(`${origin}${route}`, { ...options, method, maxRedirects: 0 });
    expect(response.status(), `${method} ${route}: ${await response.text()}`).toBe(status);
    return response;
  }
  const put = (address, body, type = 'text/html', headers = {}) => call('PUT', `/source${address}`, { data: body, headers: { 'Content-Type': type, ...headers } }, 201);
  const get = (address, status = 200) => call('GET', `/source${address}`, {}, status);
  const json = (method, route, data, status = 200, headers = {}) => call(method, route, { data, headers }, status);
  return { site, branch, lifecycle, call, put, get, json };
}

async function seed(a) {
  // The runner makes an empty store; also refuse to seed if either site/config already exists.
  await a.get(`${a.site}/edit.html`, 404);
  await a.get(a.site.replace('/campaign', '/control') + '/control.html', 404);
  await a.call('GET', `/config${a.site}`, {}, 404);
  for (const [file, value] of Object.entries({ 'edit.html': 'old edit', 'delete.html': 'old delete', 'default.html': 'old default', 'conflict.html': 'base conflict' })) {
    await a.put(`${a.site}/${file}`, html(value), 'text/html', { 'If-None-Match': '*' });
  }
  await a.put(`${a.site}/sheet.json`, '{"row":1}', 'application/json', { 'If-None-Match': '*' });
  await a.call('PUT', `/source${a.site}/image.png`, { multipart: { data: { name: 'image.png', mimeType: 'image/png', buffer: image1 } }, headers: { 'If-None-Match': '*' } }, 201);
  await a.json('PUT', `/config${a.site}`, { setting: 1 }, 201, { 'If-None-Match': '*' });
  await a.put(a.site.replace('/campaign', '/control') + '/control.html', html('control'), 'text/html', { 'If-None-Match': '*' });
  expect((await (await a.call('GET', `${a.lifecycle}/capabilities`)).json()).supported).toBe(false);
  expect((await (await a.call('GET', `/branches${a.site.replace('/campaign', '/control')}/capabilities`)).json()).supported).toBe(false);
  for (const [file, value] of Object.entries({ 'edit.html': 'old edit', 'delete.html': 'old delete', 'default.html': 'old default', 'conflict.html': 'base conflict' })) {
    expect(await (await a.get(`${a.site}/${file}`)).text()).toBe(html(value));
  }
  expect(await (await a.get(`${a.site}/sheet.json`)).text()).toBe('{"row":1}');
  expect(await (await a.get(`${a.site}/image.png`)).body()).toEqual(image1);
  expect(await (await a.call('GET', `/config${a.site}`)).json()).toEqual({ setting: 1 });
  expect(await (await a.get(a.site.replace('/campaign', '/control') + '/control.html')).text()).toBe(html('control'));
  await a.get(`${a.site}/new.html`, 404);
  await a.call('POST', `${a.lifecycle}/enable`);
  await a.json('POST', `${a.lifecycle}/`, { name: 'work' }, 201);
}

test('real Source: CRUD, isolation, disjoint sync, divergent resolution and reusable branch', async ({ request }) => {
  const a = api(request, 'pocflow');
  await seed(a);
  expect(await (await a.get(`${a.branch}/edit.html`)).text()).toBe(html('old edit'));
  await a.put(`${a.branch}/edit.html`, html('branch edit'));
  await a.put(`${a.branch}/new.html`, html('new branch'));
  await a.call('DELETE', `/source${a.branch}/delete.html`, {}, 204);
  let changes = await (await a.call('GET', `${a.lifecycle}/work/changes`)).json();
  expect(changes.changes.map(({ path, change }) => [path, change])).toEqual(expect.arrayContaining([
    ['/edit.html', 'modified'], ['/new.html', 'added'], ['/delete.html', 'deleted'],
  ]));
  expect(await (await a.get(`${a.site}/edit.html`)).text()).toBe(html('old edit'));
  await a.get(`${a.site}/new.html`, 404);
  expect(await (await a.get(`${a.site}/delete.html`)).text()).toBe(html('old delete'));
  await a.put(`${a.site}/default.html`, html('default change'));
  expect(await (await a.get(`${a.branch}/default.html`)).text()).toBe(html('old default'));
  let metadata = await (await a.call('GET', `${a.lifecycle}/work`)).json();
  expect((await (await a.json('POST', `${a.lifecycle}/work/sync`, { expectedBranchRevision: metadata.revision })).json()).status).toBe('completed');
  expect(await (await a.get(`${a.branch}/default.html`)).text()).toBe(html('default change'));
  await a.put(`${a.branch}/conflict.html`, html('branch conflict'));
  await a.put(`${a.site}/conflict.html`, html('default conflict'));
  metadata = await (await a.call('GET', `${a.lifecycle}/work`)).json();
  const needs = await (await a.json('POST', `${a.lifecycle}/work/publish`, { expectedBranchRevision: metadata.revision }, 202, { 'Idempotency-Key': 'conflict-one' })).json();
  expect(needs.status).toBe('needs-resolution');
  const sessionPath = `${a.lifecycle}/work/sync/${needs.syncId}`;
  const session = await (await a.call('GET', sessionPath)).json();
  const entry = session.entries.find(({ path }) => path === '/conflict.html');
  expect(entry).toBeTruthy();
  for (const [side, value] of [['base', 'base conflict'], ['branch', 'branch conflict'], ['default', 'default conflict']]) {
    expect(await (await a.call('GET', `${sessionPath}/entries/${entry.entryId}/${side}`)).text()).toBe(html(value));
  }
  await a.call('PUT', `/source${a.branch}/locked.html`, { data: html('blocked'), headers: { 'Content-Type': 'text/html' } }, 409);
  const resolution = await (await a.json('PUT', `${sessionPath}/resolutions/${entry.entryId}`, { expectedSessionRevision: session.revision, choice: 'edited', body: html('resolved'), contentType: 'text/html' })).json();
  await a.json('POST', `${sessionPath}/complete`, { expectedSessionRevision: resolution.revision });
  metadata = await (await a.call('GET', `${a.lifecycle}/work`)).json();
  const published = await (await a.json('POST', `${a.lifecycle}/work/publish`, { expectedBranchRevision: metadata.revision }, 200, { 'Idempotency-Key': 'publish-one' })).json();
  expect(published.status).toBe('published');
  expect(await (await a.get(`${a.site}/conflict.html`)).text()).toBe(html('resolved'));
  expect(await (await a.get(`${a.site}/edit.html`)).text()).toBe(html('branch edit'));
  expect(await (await a.get(`${a.site}/new.html`)).text()).toBe(html('new branch'));
  await a.get(`${a.site}/delete.html`, 404);
  changes = await (await a.call('GET', `${a.lifecycle}/work/changes`)).json();
  expect(changes.changes).toEqual([]);
  await a.put(`${a.branch}/reused.html`, html('reused'));
  await a.get(`${a.site}/reused.html`, 404);
});

test('real Source: auto-sync publish and merge revert restores HTML, sheet, image and config', async ({ request }) => {
  const a = api(request, 'pockinds');
  await seed(a);
  await a.put(`${a.branch}/edit.html`, html('updated'));
  await a.put(`${a.branch}/sheet.json`, '{"row":2}', 'application/json');
  await a.call('PUT', `/source${a.branch}/image.png`, { multipart: { data: { name: 'image.png', mimeType: 'image/png', buffer: image2 } } }, 201);
  await a.json('PUT', `/config${a.branch}`, { setting: 2 }, 201);
  expect(await (await a.get(`${a.site}/edit.html`)).text()).toBe(html('old edit'));
  expect(await (await a.get(`${a.site}/sheet.json`)).text()).toBe('{"row":1}');
  expect(await (await a.get(`${a.site}/image.png`)).body()).toEqual(image1);
  expect(await (await a.call('GET', `/config${a.site}`)).json()).toEqual({ setting: 1 });
  const oldTag = (await a.get(`${a.site}/edit.html`)).headers().etag;
  await a.put(`${a.site}/default.html`, html('disjoint'));
  const metadata = await (await a.call('GET', `${a.lifecycle}/work`)).json();
  const published = await (await a.json('POST', `${a.lifecycle}/work/publish`, { expectedBranchRevision: metadata.revision }, 200, { 'Idempotency-Key': 'mixed-one' })).json();
  expect(published.status).toBe('published');
  expect(await (await a.get(`${a.branch}/default.html`)).text()).toBe(html('disjoint'));
  expect(await (await a.get(`${a.site}/sheet.json`)).text()).toBe('{"row":2}');
  expect(await (await a.get(`${a.site}/image.png`)).body()).toEqual(image2);
  expect(await (await a.call('GET', `/config${a.site}`)).json()).toEqual({ setting: 2 });
  await a.call('PUT', `/source${a.site}/edit.html`, { data: html('stale'), headers: { 'Content-Type': 'text/html', 'If-Match': oldTag } }, 412);
  const log = await a.call('GET', `/log${a.site}/`);
  const revision = Number(log.headers()['branch-revision']);
  const detail = await (await a.call('GET', `/log${a.site}/${published.mergeRevision}`)).json();
  expect(detail.commit.kind).toBe('merge');
  expect(detail.changes.map(({ itemKind }) => itemKind)).toEqual(expect.arrayContaining(['html', 'json', 'media', 'config']));
  await a.json('POST', `/log${a.site}/${published.mergeRevision}/revert`, { expectedDefaultRevision: revision });
  expect(await (await a.get(`${a.site}/edit.html`)).text()).toBe(html('old edit'));
  expect(await (await a.get(`${a.site}/sheet.json`)).text()).toBe('{"row":1}');
  expect(await (await a.get(`${a.site}/image.png`)).body()).toEqual(image1);
  expect(await (await a.call('GET', `/config${a.site}`)).json()).toEqual({ setting: 1 });
});

test('non-enabled Source retains legacy response and rejects branch addressing', async ({ request }) => {
  const a = api(request, 'poclegacy');
  const control = a.site.replace('/campaign', '/control');
  await a.get(`${control}/control.html`, 404);
  await a.put(`${control}/control.html`, html('legacy'), 'text/html', { 'If-None-Match': '*' });
  const capabilities = await (await a.call('GET', `/branches${control}/capabilities`)).json();
  expect(capabilities.supported).toBe(false);
  const response = await a.get(`${control}/control.html`);
  expect(response.headers()['content-branch']).toBeUndefined();
  expect(response.headers()['branch-revision']).toBeUndefined();
  expect(await response.text()).toBe(html('legacy'));
  await a.get(`${control}~work/control.html`, 422);
});
