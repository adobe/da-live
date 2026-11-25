/* B5: real Source, real Wrangler and real Canvas; never run outside run.cjs. */
const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { api, install, verifyOwner, source, ui, collab, notice, token, scratch } = require('./canvas.local.spec.cjs');

const h6 = '/h6test/sites/work~draft/source';
const da = '/source/h6test/work~draft';
const base = '/h6test/sites/work/source';
const branches = '/branches/h6test/work';
const full = process.env.H6_BRANCH_FULL === '1';
const off = process.env.H6_BRANCH_GATE_OFF === '1';
const html = (text) => `<body><header></header><main><div><p>${text}</p></div></main><footer></footer></body>`;
const caseTraces = new Map();
const tabs = new WeakMap();
const safeUrl = (value) => { const url = new URL(value); return `${url.origin}${url.pathname}`; };
const redact = (value) => JSON.stringify(value, (key, entry) => {
  if (typeof entry !== 'string') return entry;
  const clean = token ? entry.replaceAll(token, '[redacted]') : entry;
  return clean.replace(/\b(?:https?|wss?):\/\/[^\s"'<>]+/g, (url) => {
    try { return safeUrl(url); } catch { return '[invalid-url]'; }
  });
});
test.beforeEach(async ({}, info) => { caseTraces.set(info.title, []); });
test.afterEach(async ({}, info) => {
  const errors = (info.errors || []).map((error) => String(error.message || '').slice(0, 1000));
  console.log(`B5 CASE TRACE ${redact({ case: info.title, status: info.status, errors, traces: caseTraces.get(info.title) || [] })}`);
  caseTraces.delete(info.title);
});
const observed = () => {
  const trace = { requests: [], responses: [], blocked: [], errors: [], missing: [], sockets: [], tabs: [] };
  caseTraces.get(test.info().title)?.push(trace);
  return trace;
};
const strong = (value) => expect(value).toMatch(/^"[^"\r\n]+"$/);
const ready = () => fs.existsSync(`${scratch}/branch-ready`);

async function seed(request) {
  const permissions = { permissions: { data: [
    { path: 'CONFIG', groups: 'author@example.test', actions: 'write' },
    ...['work', 'disabled', 'control'].map((site) => ({ path: `/${site}/+**`, groups: 'author@example.test', actions: 'write' })),
  ] } };
  await api(request, 'POST', '/config/h6test/', JSON.stringify(permissions), 201, 'application/json');
  await api(request, 'POST', '/h6test/sites/work/source/', undefined, 201);
  await api(request, 'POST', '/h6test/sites/disabled/source/', undefined, 201);
  await api(request, 'POST', '/config/h6test/work/', JSON.stringify({ ':type': 'sheet', ':sheetname': 'data', data: [{ key: 'ew.enabled', value: 'true' }] }), 201, 'application/json');
  for (const name of ['page', 'race']) await api(request, 'POST', `${base}/${name}.html`, html(`B5 ${name} base`), 201, 'text/html');
  await api(request, 'PUT', '/source/h6test/control/page.html', html('B5 legacy control'), 201, 'text/html');
  await api(request, 'POST', `${branches}/enable`, undefined, 200);
}

async function browserPage(browser, trace) {
  const context = await browser.newContext({ serviceWorkers: 'block' });
  const page = await context.newPage();
  await attachPage(page, trace, 'main');
  return { context, page };
}

async function attachPage(page, trace, label) {
  const tab = { label, requests: [], responses: [], failed: [], sockets: [], errors: [] };
  const started = new WeakMap();
  trace.tabs.push(tab);
  tabs.set(page, tab);
  page.on('request', (request) => {
    const url = new URL(request.url());
    started.set(request, Date.now());
    if (url.origin === source || (url.origin === ui && ['/', '/browse', '/canvas', '/__empty'].includes(url.pathname))) {
      tab.requests.push({ method: request.method(), url: safeUrl(request.url()), at: Date.now() });
    }
  });
  page.on('response', (response) => {
    const request = response.request();
    if (new URL(response.url()).origin === source) {
      tab.responses.push({ method: request.method(), url: safeUrl(response.url()), status: response.status(), ms: Date.now() - (started.get(request) || Date.now()) });
    }
  });
  page.on('requestfailed', (request) => tab.failed.push({ method: request.method(), url: safeUrl(request.url()), error: request.failure()?.errorText || 'unknown', ms: Date.now() - (started.get(request) || Date.now()) }));
  page.on('pageerror', (error) => tab.errors.push(error.message));
  page.on('websocket', (socket) => tab.sockets.push(safeUrl(socket.url())));
  await install(page, trace);
}

async function closeObserved(context) {
  await Promise.all(context.pages().map(async (page) => {
    const tab = tabs.get(page);
    if (!tab) return;
    tab.readiness = await page.evaluate(() => {
      const editor = document.querySelector('ew-editor-doc');
      const provider = editor?._proseContext?.wsProvider;
      const browse = document.querySelector('da-browse');
      const list = browse?.shadowRoot?.querySelector('da-list.da-list-type-browse');
      const actionbar = list?.shadowRoot?.querySelector('da-actionbar');
      const hash = /^#\/h6test\/[a-z0-9~/-]*$/i.test(location.hash) ? location.hash : null;
      return {
        path: location.pathname, hash, readyState: document.readyState,
        routeStarted: window.routeStarted ?? null, editorMounted: Boolean(editor),
        editorError: editor?._error ?? null, proseMounted: Boolean(editor?._proseContext?.view?.dom),
        connected: provider?.wsconnected ?? null, synced: provider?.synced ?? null,
        notPermitted: document.querySelector('.nx-not-permitted')?.textContent?.trim().slice(0, 300) ?? null,
        browsePath: browse?.details?.fullpath ?? null, listPath: list?.fullpath ?? null,
        actionPath: actionbar?.currentPath ?? null, directoryError: list?._directoryError ?? null,
        itemErrors: Array.isArray(list?._itemErrors) ? list._itemErrors.map((item) => ({ path: item?.path, destination: item?.destination, message: item?.message })) : null,
      };
    }).catch((error) => ({ diagnosticError: error.message }));
  }));
  await context.close();
}

async function metadata(request) { return (await api(request, 'GET', `${branches}/draft`, undefined, 200)).json(); }
function fullOnly() {
  test.skip(!full || off, 'Unfiltered B5 full run only');
  test.skip(!ready(), 'A passing qualified Canvas checkpoint is required in this run');
}

test('B5 first checkpoint: selector creates draft and real Canvas flushes qualified H6', async ({ request, browser }) => {
  test.skip(off, 'Separate gate-off run');
  test.setTimeout(150000);
  await seed(request);
  const caps = await (await api(request, 'GET', `${branches}/capabilities`, undefined, 200)).json();
  expect(caps.supported).toBe(true);
  expect(caps.helix6BranchSource).toBe(true);
  const disabled = await (await api(request, 'GET', '/branches/h6test/disabled/capabilities', undefined, 200)).json();
  expect(disabled.supported).toBe(false);
  expect(disabled.helix6BranchSource ?? false).toBe(false);
  const denied = await api(request, 'GET', '/h6test/sites/disabled~draft/source/', undefined, 422);
  expect(await denied.text()).toContain('BRANCHING_UNSUPPORTED');
  const trace = observed();
  const { context, page } = await browserPage(browser, trace);
  let flushFrames = 0;
  page.on('websocket', (socket) => socket.on('framesent', ({ payload }) => { if (Buffer.isBuffer(payload) && payload[0] === 2) flushFrames += 1; }));
  try {
    await page.goto(`${ui}/?browse=1&da-admin=local&da-source=da-rs&da-collab=local#/h6test/work`);
    const selector = page.locator('da-branch-selector');
    await expect(selector.locator('.branch-trigger')).toHaveText('Default · main', { timeout: 30000 });
    await selector.locator('.branch-trigger').click();
    await selector.locator('input[name=name]').fill('draft');
    await selector.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL(/#\/h6test\/work~draft\/?$/);
    expect((await metadata(request)).id).toBe('draft');
    const root = await api(request, 'GET', `${h6}/`, undefined, 200);
    expect(root.headers()['content-branch']).toBe('draft');
    const rootPost = await api(request, 'POST', `${h6}/`, undefined, 422);
    expect(await rootPost.text()).toContain('BRANCH_UNSUPPORTED_TARGET');
    expect(await (await api(request, 'GET', `${h6}/page.html?contentBranch=draft`, undefined, 422)).text()).toContain('BRANCH_UNSUPPORTED_TARGET');
    await api(request, 'GET', '/h6test/sites/work~missing/source/page.html', undefined, 404);
    await api(request, 'GET', '/h6test/sites/work~main/source/page.html', undefined, 404);
    expect(await (await api(request, 'GET', '/h6test/sites/control~draft/source/page.html', undefined, 409)).text()).toContain('SOURCE_MODE_MISMATCH');
    const beforeDefault = await (await api(request, 'GET', `${base}/page.html`, undefined, 200)).text();
    const branchHead = await api(request, 'HEAD', `${h6}/page.html`, undefined, 200);
    const aliasHead = await api(request, 'HEAD', `${da}/page.html`, undefined, 200);
    expect(branchHead.headers()['content-branch']).toBe('draft');
    expect(branchHead.headers()['branch-revision']).toMatch(/^\d+$/);
    expect(branchHead.headers()['x-da-source-mode']).toBe('helix6');
    expect(branchHead.headers()['x-da-branch-instance']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(aliasHead.headers()['x-da-branch-instance']).toBe(branchHead.headers()['x-da-branch-instance']);
    expect(aliasHead.headers().etag).toBe(branchHead.headers().etag);
    strong(branchHead.headers().etag);
    expect(branchHead.headers().etag).not.toBe((await api(request, 'HEAD', `${base}/page.html`, undefined, 200)).headers().etag);
    expect(branchHead.headers()['cache-control']).toMatch(/private/i);
    expect(branchHead.headers()['cache-control']).toMatch(/no-store/i);
    expect(branchHead.headers()['x-da-actions']).toContain('write');
    const conditional = await api(request, 'GET', `${h6}/page.html`, undefined, 304, undefined, { 'if-none-match': branchHead.headers().etag });
    for (const header of ['etag', 'content-branch', 'branch-revision', 'x-da-source-mode', 'x-da-branch-instance', 'x-da-actions', 'cache-control']) {
      expect(conditional.headers()[header], `304 ${header}`).toBe(branchHead.headers()[header]);
    }
    await page.goto(`${ui}/__empty`);
    const cors = await page.evaluate(async ({ origin, identity, route }) => {
      const r = await fetch(`${origin}${route}`, { method: 'HEAD', headers: { authorization: `Bearer ${identity}` }, redirect: 'error' });
      const stale = await fetch(`${origin}${route}`, { method: 'PUT', headers: { authorization: `Bearer ${identity}`, 'content-type': 'text/html', 'if-match': '"b5-invalid"' }, body: 'must not write', redirect: 'error' });
      return { status: r.status, etag: r.headers.get('etag'), branch: r.headers.get('content-branch'), revision: r.headers.get('branch-revision'), mode: r.headers.get('x-da-source-mode'), instance: r.headers.get('x-da-branch-instance'), actions: r.headers.get('x-da-actions'), stale: stale.status };
    }, { origin: source, identity: token, route: `${h6}/page.html` });
    expect(cors).toEqual({ status: 200, etag: branchHead.headers().etag, branch: 'draft', revision: branchHead.headers()['branch-revision'], mode: 'helix6', instance: branchHead.headers()['x-da-branch-instance'], actions: branchHead.headers()['x-da-actions'], stale: 412 });
    await page.goto(`${ui}/canvas?da-admin=local&da-source=da-rs&da-collab=local#/h6test/work~draft/page`);
    const editor = page.locator('ew-editor-doc .ProseMirror');
    await expect(editor).toContainText('B5 page base', { timeout: 30000 });
    await expect(editor).toHaveAttribute('contenteditable', 'true');
    expect((await page.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    const prior = (await api(request, 'GET', `${h6}/page.html`, undefined, 200)).headers().etag;
    strong(prior);
    const log = `${scratch}/collab.log`;
    const offset = fs.readFileSync(log, 'utf8').length;
    await editor.click();
    await editor.press('End');
    await page.keyboard.insertText(' durable B5 branch edit');
    const frames = flushFrames;
    expect((await page.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    await expect.poll(() => flushFrames).toBeGreaterThan(frames);
    await expect.poll(async () => (await (await api(request, 'GET', `${h6}/page.html`, undefined, 200)).text()).includes('durable B5 branch edit'), { timeout: 30000 }).toBe(true);
    const prefix = `SOURCE PUT ${h6}/page.html match=${prior} status=201 `;
    await expect.poll(() => fs.readFileSync(log, 'utf8').slice(offset).includes(prefix), { timeout: 10000 }).toBe(true);
    const line = fs.readFileSync(log, 'utf8').slice(offset).split('\n').find((entry) => entry.includes(prefix));
    expect(line).toContain('initiator=collab');
    expect(line).toContain('auth=present');
    expect(JSON.parse(/\btype=("(?:\\.|[^"\\])*")/.exec(line)[1])).toMatch(/^text\/html(?:;.*)?$/i);
    const next = /\betag=(\S+)/.exec(line)[1];
    strong(next);
    expect(next).not.toBe(prior);
    expect(await (await api(request, 'GET', `${base}/page.html`, undefined, 200)).text()).toBe(beforeDefault);
    expect(trace.requests).toContain(`HEAD ${source}${h6}/page.html`);
    expect(trace.sockets.some((socket) => socket.includes(`${h6}/page.html`))).toBe(true);
    expect(trace.blocked).toEqual([]);
    expect(trace.errors).toEqual([]);
    console.log(`B5 CHECKPOINT ${JSON.stringify({ route: `${h6}/page.html`, prior, next, instance: cors.instance, flush: true, flushFrames: flushFrames - frames, cors, status: 201 })}`);
  } finally {
    console.log(`B5 CHECKPOINT TRACE ${redact(trace)}`);
    await closeObserved(context);
  }
  fs.writeFileSync(`${scratch}/branch-ready`, 'passed\n', { mode: 0o600 });
});

test('B5 gate off: qualified H6 fails closed and marked DA cannot enter Worker', async ({ request, browser }) => {
  test.skip(!off, 'Separate gate-off run only');
  await seed(request);
  await api(request, 'POST', `${branches}/`, JSON.stringify({ name: 'draft' }), 201, 'application/json');
  const caps = await (await api(request, 'GET', `${branches}/capabilities`, undefined, 200)).json();
  expect(caps.supported).toBe(true);
  expect(caps.helix6BranchSource ?? false).toBe(false);
  const failed = await api(request, 'GET', `${h6}/page.html`, undefined, 422);
  expect(await failed.text()).toContain('BRANCH_UNSUPPORTED_TARGET');
  const direct = await api(request, 'HEAD', `${da}/page.html`, undefined, 200);
  expect(direct.headers()['x-da-source-unavailable']).toBe('true');
  expect(direct.headers()['x-da-source-mode']).toBeUndefined();
  const trace = observed();
  const { context, page } = await browserPage(browser, trace);
  try {
    await page.goto(`${ui}/__empty`);
    const admitted = await page.evaluate(({ worker, origin, route, identity }) => new Promise((resolve) => {
      const socket = new WebSocket(`${worker}/${origin}${route}`, ['yjs', identity]);
      const timeout = setTimeout(() => { socket.close(); resolve('timeout'); }, 10000);
      socket.onopen = () => { clearTimeout(timeout); socket.close(); resolve('open'); };
      socket.onerror = () => { clearTimeout(timeout); resolve('rejected'); };
      socket.onclose = () => { clearTimeout(timeout); resolve('rejected'); };
    }), { worker: collab.replace('http:', 'ws:'), origin: source, route: `${da}/page.html`, identity: token });
    expect(admitted).toBe('rejected');
    expect(trace.blocked).toEqual([]);
    console.log('B5 GATE-OFF RECEIPT direct DA HEAD 200/unavailable; H6 422; Worker admission rejected');
  } finally { await closeObserved(context); }
});

test('B5 full: two Canvas tabs, branch image and structured snapshot restore', async ({ request, browser }) => {
  fullOnly();
  test.setTimeout(180000);
  await api(request, 'POST', `${branches}/`, JSON.stringify({ name: 'other' }), 201, 'application/json');
  const trace = observed();
  const { context, page: first } = await browserPage(browser, trace);
  const second = await context.newPage();
  try {
    await attachPage(second, trace, 'second');
    const url = `${ui}/canvas?da-admin=local&da-source=da-rs&da-collab=local#/h6test/work~draft/page`;
    await first.goto(url);
    await second.goto(url);
    const editor = first.locator('ew-editor-doc .ProseMirror');
    const peer = second.locator('ew-editor-doc .ProseMirror');
    await expect(editor).toContainText('durable B5 branch edit', { timeout: 30000 });
    await expect(peer).toContainText('durable B5 branch edit', { timeout: 30000 });
    await editor.click();
    await editor.press('End');
    await first.keyboard.insertText(' B5 shared tabs');
    expect((await first.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    await expect(peer).toContainText('B5 shared tabs');
    const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
    await editor.click();
    await editor.press('End');
    const chooser = first.waitForEvent('filechooser');
    await first.locator('ew-selection-toolbar button[data-id="image-add"]').click();
    await (await chooser).setFiles({ name: 'b5.png', mimeType: 'image/png', buffer: image });
    await expect.poll(async () => (await (await api(request, 'GET', `${h6}/page.html`, undefined, 200)).text()).includes('./media_'), { timeout: 30000 }).toBe(true);
    expect((await first.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    await first.reload();
    await expect(first.locator('ew-editor-doc .ProseMirror')).toContainText('B5 shared tabs', { timeout: 30000 });
    const rendered = first.locator('ew-editor-doc .ProseMirror img').first();
    await expect(rendered).toBeVisible();
    await expect.poll(() => rendered.evaluate((element) => element.complete && element.naturalWidth > 0), { timeout: 30000 }).toBe(true);
    const mediaRequest = trace.requests.find((value) => value.startsWith(`GET ${source}${h6}/media_`));
    expect(mediaRequest).toBeTruthy();
    expect(await (await api(request, 'GET', new URL(mediaRequest.slice(4)).pathname, undefined, 200)).body()).toEqual(image);
    await first.keyboard.press('Meta+Alt+S');
    const versions = first.locator('ew-canvas-versions');
    await expect(versions).toBeVisible({ timeout: 30000 });
    let capability;
    const readCapability = () => versions.evaluate(async (panel) => {
      const { getExtensionsBridge } = await import('/blocks/canvas/editor-utils/extensions-bridge.js');
      const view = getExtensionsBridge().view;
      const editorView = document.querySelector('ew-editor-doc')?._proseContext?.view;
      return { path: panel.path, canWrite: panel._canWrite, editorPresent: Boolean(editorView), editorEditable: Boolean(editorView?.editable), bridgePresent: Boolean(view), bridgeMatchesEditor: Boolean(view && view === editorView) };
    });
    try {
      await expect.poll(async () => { capability = await readCapability(); return capability; }, { timeout: 10000 }).toMatchObject({ path: '/h6test/work~draft/page.html', canWrite: true, editorPresent: true, editorEditable: true });
    } finally { console.log(`B5 VERSION CAPABILITY ${redact(capability)}`); }
    const nameInput = versions.getByPlaceholder('Version name');
    const createButton = versions.getByRole('button', { name: 'Create version', exact: true });
    await expect(createButton.or(nameInput).first()).toBeVisible({ timeout: 30000 });
    if (!(await nameInput.isVisible())) await createButton.click();
    await expect(nameInput).toBeVisible();
    expect((await first.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    const beforeSnapshot = await api(request, 'GET', `${h6}/page.html`, undefined, 200);
    const snapshotBytes = await beforeSnapshot.text();
    const snapshotTag = beforeSnapshot.headers().etag;
    strong(snapshotTag);
    expect(snapshotBytes).toContain('B5 shared tabs');
    expect(snapshotBytes).toContain('./media_');
    await nameInput.fill('B5 structured snapshot');
    const [snapshot] = await Promise.all([
      first.waitForResponse((response) => response.request().method() === 'POST'
        && new URL(response.url()).origin === source && new URL(response.url()).pathname === `${h6}/page.html/.versions`, { timeout: 30000 }),
      versions.getByRole('button', { name: 'Save', exact: true }).click(),
    ]);
    expect(snapshot.status()).toBe(201);
    expect(snapshot.request().headers()['if-match']).toBe(snapshotTag);
    const snapshotLocation = snapshot.headers().location;
    expect(snapshotLocation).toMatch(/^\/h6test\/sites\/work~draft\/source\/page\.html\/\.versions\/[^/]+$/);
    expect(await (await api(request, 'GET', snapshotLocation, undefined, 200)).text()).toBe(snapshotBytes);
    const row = versions.locator('.versionentry.is-version').filter({ hasText: 'B5 structured snapshot' });
    await expect(row).toBeVisible({ timeout: 30000 });
    expect((await (await api(request, 'GET', `${h6}/page.html/.versions`, undefined, 200)).json()).some((entry) => entry['version-comment'] === 'B5 structured snapshot' && entry['version-by'] === 'author@example.test')).toBe(true);
    const current = first.locator('ew-editor-doc .ProseMirror');
    await current.click();
    await current.press('End');
    await first.keyboard.insertText(' B5 restore removal');
    expect((await first.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    const changedBytes = await (await api(request, 'GET', `${h6}/page.html`, undefined, 200)).text();
    expect(changedBytes).toContain('B5 restore removal');
    expect(changedBytes).not.toBe(snapshotBytes);
    expect(await (await api(request, 'GET', snapshotLocation, undefined, 200)).text()).toBe(snapshotBytes);
    await row.getByRole('button', { name: 'More actions' }).click();
    await row.getByRole('menuitem', { name: 'Restore', exact: true }).click();
    await versions.locator('nx-dialog.ew-cv-restore').getByRole('button', { name: 'Restore', exact: true }).click();
    await expect(current).toContainText('B5 shared tabs');
    await expect(current).not.toContainText('B5 restore removal');
    await expect(current.locator('img[data-da-rs-source^="./media_"]')).toBeVisible();
    expect((await first.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    await expect.poll(async () => (await (await api(request, 'GET', `${h6}/page.html`, undefined, 200)).text()), { timeout: 30000 }).toBe(snapshotBytes);
    expect(await (await api(request, 'GET', `${base}/page.html`, undefined, 200)).text()).toBe(html('B5 page base'));
    expect(trace.blocked).toEqual([]);
    expect(trace.errors).toEqual([]);
  } finally { await closeObserved(context); }
});

test('B5 full: dirty Canvas switching waits for a durable flush in both directions', async ({ request, browser }) => {
  fullOnly();
  test.setTimeout(180000);
  const gate = `http://127.0.0.1:${process.env.H6_GATE_PORT}`;
  const control = async (method, action, checked = true) => {
    if (checked) verifyOwner();
    const r = await request.fetch(`${gate}/__gate__/${action}`, { method, headers: { 'x-h6-gate': process.env.H6_GATE_NONCE }, maxRedirects: 0 });
    expect(r.status()).toBe(200);
    return r.json();
  };
  const trace = observed();
  const { context, page } = await browserPage(browser, trace);
  const events = [];
  page.on('websocket', (socket) => {
    socket.on('framesent', ({ payload }) => { if (Buffer.isBuffer(payload) && payload[0] === 2) events.push('flush'); });
    socket.on('framereceived', ({ payload }) => { if (Buffer.isBuffer(payload) && payload[0] === 3) events.push(payload[1] === 1 ? 'ack' : 'failed-ack'); });
  });
  page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) events.push('navigate'); });
  try {
    const initialDefault = await (await api(request, 'GET', `${base}/page.html`, undefined, 200)).text();
    await page.goto(`${ui}/canvas?da-admin=local&da-source=da-rs&da-collab=local#/h6test/work~draft/page`);
    const switches = [
      { from: `${h6}/page.html`, to: `${base}/page.html`, label: 'Default · main', fromHash: '#/h6test/work~draft/page', toHash: '#/h6test/work/page', marker: ' old delayed edit branch barrier' },
      { from: `${base}/page.html`, to: `${h6}/page.html`, label: 'Branch · draft', fromHash: '#/h6test/work/page', toHash: '#/h6test/work~draft/page', marker: ' old delayed edit default barrier' },
    ];
    for (const step of switches) {
      const editor = page.locator('ew-editor-doc .ProseMirror');
      await expect(editor).toHaveAttribute('contenteditable', 'true', { timeout: 30000 });
      await expect.poll(() => page.locator('ew-editor-doc').evaluate((element) => ({
        provider: element.hasCollaborationProvider(),
        connected: element._proseContext?.wsProvider?.wsconnected,
        synced: element._proseContext?.wsProvider?.synced,
      })), { timeout: 30000 }).toEqual({ provider: true, connected: true, synced: true });
      const selector = page.locator('da-branch-selector');
      await expect(selector.locator('.branch-trigger')).toHaveText(step.fromHash.includes('~draft') ? 'Branch · draft' : 'Default · main', { timeout: 30000 });
      // Settle startup normalization before the edit under test, never after it.
      const earlierAcks = events.filter((event) => event === 'ack').length;
      expect((await page.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
      await expect.poll(() => events.filter((event) => event === 'ack').length).toBeGreaterThan(earlierAcks);
      const before = await api(request, 'GET', step.from, undefined, 200);
      const beforeBytes = await before.text();
      const previous = before.headers().etag;
      strong(previous);
      const destinationBytes = await (await api(request, 'GET', step.to, undefined, 200)).text();
      const log = `${scratch}/collab.log`;
      const offset = fs.readFileSync(log, 'utf8').length;
      const eventOffset = events.length;
      await control('POST', 'arm');
      await editor.click();
      await editor.press('End');
      await page.keyboard.insertText(step.marker);
      await expect(editor).toContainText(step.marker.trim());
      await selector.locator('.branch-trigger').click();
      await selector.getByRole('button', { name: step.label, exact: true }).click({ noWaitAfter: true });
      await expect.poll(async () => (await control('GET', 'status', false)).state, { timeout: 30000 }).toBe('pending');
      const pending = await control('GET', 'status', false);
      expect(pending.match).toBe(previous);
      expect(pending.containsEdit).toBe(true);
      expect(pending.initiator).toBe('collab');
      expect(pending.contentType).toMatch(/^text\/html(?:;.*)?$/i);
      await expect.poll(() => events.slice(eventOffset).includes('flush')).toBe(true);
      expect(events.slice(eventOffset)).not.toContain('ack');
      expect(events.slice(eventOffset)).not.toContain('failed-ack');
      expect(events.slice(eventOffset)).not.toContain('navigate');
      expect(new URL(page.url()).hash).toBe(step.fromHash);
      expect(await page.evaluate(() => ({ page: document.body.inert, editor: document.querySelector('ew-editor-doc')?.inert }))).toEqual({ page: true, editor: true });
      // The runner and gate were ownership-checked before arming. Avoid slow
      // process inspections while the real flush acknowledgement is held.
      for (const [route, bytes] of [[step.from, beforeBytes], [step.to, destinationBytes]]) {
        const heldRead = await request.get(`${source}${route}`, { headers: { authorization: `Bearer ${token}` }, maxRedirects: 0 });
        expect(heldRead.status()).toBe(200);
        expect(await heldRead.text()).toBe(bytes);
      }
      await control('POST', 'release', false);
      await expect.poll(async () => (await control('GET', 'status', false)).status, { timeout: 30000 }).toBe(201);
      await expect.poll(() => events.slice(eventOffset).includes('ack'), { timeout: 30000 }).toBe(true);
      await expect.poll(() => new URL(page.url()).hash, { timeout: 30000 }).toBe(step.toHash);
      await expect(page.locator('ew-editor-doc .ProseMirror')).toBeVisible({ timeout: 30000 });
      await expect.poll(() => events.slice(eventOffset).includes('navigate'), { timeout: 30000 }).toBe(true);
      const sequence = events.slice(eventOffset);
      expect(sequence.indexOf('flush')).toBeLessThan(sequence.indexOf('ack'));
      expect(sequence.indexOf('ack')).toBeLessThan(sequence.indexOf('navigate'));
      expect(sequence).not.toContain('failed-ack');
      await expect.poll(async () => (await (await api(request, 'GET', step.from, undefined, 200)).text()).includes(step.marker.trim()), { timeout: 30000 }).toBe(true);
      expect(await (await api(request, 'GET', step.to, undefined, 200)).text()).not.toContain(step.marker.trim());
      const prefix = `SOURCE PUT ${step.from} match=${previous} status=201 `;
      await expect.poll(() => fs.readFileSync(log, 'utf8').slice(offset).includes(prefix), { timeout: 10000 }).toBe(true);
      const line = fs.readFileSync(log, 'utf8').slice(offset).split('\n').find((entry) => entry.includes(prefix));
      expect(line).toContain('initiator=collab');
      expect(line).toContain('auth=present');
      console.log(`B5 SWITCH RECEIPT ${JSON.stringify({ from: step.from, to: step.to, ifMatch: previous, held: true, sequence, status: 201 })}`);
    }
    expect(await (await api(request, 'GET', `${h6}/page.html`, undefined, 200)).text()).toContain('old delayed edit branch barrier');
    expect(await (await api(request, 'GET', `${base}/page.html`, undefined, 200)).text()).toContain('old delayed edit default barrier');
    // Restore Default so this probe does not add a second conflict to the later reconciliation.
    const currentDefault = await api(request, 'GET', `${base}/page.html`, undefined, 200);
    await api(request, 'PUT', `${base}/page.html`, initialDefault, 201, 'text/html', { 'if-match': currentDefault.headers().etag });
    expect(await (await api(request, 'GET', `${base}/page.html`, undefined, 200)).text()).toBe(initialDefault);
    expect(trace.blocked).toEqual([]);
    expect(trace.errors).toEqual([]);
  } finally {
    try {
      const { state } = await control('GET', 'status');
      if (state === 'pending') await control('POST', 'release');
      else if (state === 'armed') await control('POST', 'cancel');
    } catch { /* runner releases */ }
    await closeObserved(context);
  }
});

test('B5 full: real Browse branch copy/trash and legacy selector switching', async ({ request, browser }) => {
  fullOnly();
  test.setTimeout(120000);
  const trace = observed();
  const { context, page } = await browserPage(browser, trace);
  try {
    await api(request, 'POST', `${h6}/folder/`, undefined, 201);
    await api(request, 'POST', `${h6}/browsecopy.html`, html('B5 browse copy'), 201, 'text/html');
    await page.goto(`${ui}/?browse=1&da-admin=local&da-source=da-rs&da-collab=local#/h6test/work~draft`);
    const selector = page.locator('da-branch-selector');
    await expect(selector.locator('.branch-trigger')).toHaveText('Branch · draft', { timeout: 30000 });
    const row = page.locator('da-browse da-list-item').filter({ hasText: 'browsecopy' });
    await expect(row).toBeVisible();
    await row.getByRole('checkbox', { name: 'Select item' }).check();
    await page.getByRole('button', { name: 'Copy', exact: true }).filter({ visible: true }).click();
    const [folderResponse] = await Promise.all([
      page.waitForResponse((response) => response.request().method() === 'GET'
        && response.url() === `${source}${h6}/folder/`, { timeout: 30000 }),
      page.getByRole('link', { name: 'folder' }).click(),
    ]);
    expect(folderResponse.status()).toBe(200);
    await expect(page).toHaveURL(/#\/h6test\/work~draft\/folder\/?$/);
    await expect.poll(() => page.evaluate(() => {
      const browse = document.querySelector('da-browse');
      const list = browse?.shadowRoot?.querySelector('da-list.da-list-type-browse');
      const actionbar = list?.shadowRoot?.querySelector('da-actionbar');
      const clean = (value) => typeof value === 'string' ? value.replace(/\/$/, '') : null;
      return { browse: clean(browse?.details?.fullpath), list: clean(list?.fullpath), action: clean(actionbar?.currentPath), error: list?._directoryError ?? null };
    }), { timeout: 30000 }).toEqual({ browse: '/h6test/work~draft/folder', list: '/h6test/work~draft/folder', action: '/h6test/work~draft/folder', error: null });
    const [paste] = await Promise.all([
      page.waitForResponse((response) => {
        const url = new URL(response.url());
        return response.request().method() === 'PUT' && url.origin === source
          && url.pathname.startsWith(`${h6}/`) && url.searchParams.has('source');
      }, { timeout: 30000 }),
      page.getByRole('button', { name: 'Paste', exact: true }).filter({ visible: true }).click(),
    ]);
    const pasteUrl = new URL(paste.url());
    trace.paste = { target: safeUrl(paste.url()), status: paste.status(), sourceMatches: pasteUrl.searchParams.get('source') === '/browsecopy.html' };
    expect(pasteUrl.pathname).toBe(`${h6}/folder/browsecopy.html`);
    expect(trace.paste.sourceMatches).toBe(true);
    expect(paste.status()).toBe(200);
    await expect.poll(async () => { verifyOwner(); return (await request.get(`${source}${h6}/folder/browsecopy.html`, { headers: { authorization: `Bearer ${token}` }, maxRedirects: 0 })).status(); }, { timeout: 30000 }).toBe(200);
    expect(await (await api(request, 'GET', `${h6}/folder/browsecopy.html`, undefined, 200)).text()).toBe(html('B5 browse copy'));
    await api(request, 'GET', `${base}/folder/browsecopy.html`, undefined, 404);
    const copied = page.locator('da-browse da-list-item').filter({ hasText: 'browsecopy' });
    await expect(copied).toBeVisible();
    await copied.getByRole('checkbox', { name: 'Select item' }).check();
    await page.locator('button.delete-button').filter({ visible: true }).click();
    await page.locator('da-dialog').getByRole('button', { name: 'Delete', exact: true }).click();
    await expect.poll(async () => { verifyOwner(); return (await request.get(`${source}${h6}/folder/browsecopy.html`, { headers: { authorization: `Bearer ${token}` }, maxRedirects: 0 })).status(); }, { timeout: 30000 }).toBe(404);
    const comparison = await (await api(request, 'GET', `${branches}/draft/changes`, undefined, 200)).json();
    expect(comparison.changes.some(({ path }) => path.startsWith('/.trash/'))).toBe(true);
    const changes = selector.locator('da-branch-changes');
    await changes.getByRole('button', { name: /^Changes/ }).click();
    await expect(changes.locator('.changes-list')).toBeVisible();
    await expect(changes.locator('.changes-list')).not.toContainText('.trash');
    await changes.getByRole('button', { name: 'Close Changes' }).click();
    await page.goto(`${ui}/?browse=1&da-admin=local&da-source=da-rs&da-collab=local#/h6test/work~draft`);
    await selector.locator('.branch-trigger').click();
    await selector.getByRole('button', { name: 'Default · main', exact: true }).click();
    await expect(page).toHaveURL(/#\/h6test\/work\/?$/);
    await expect(selector.locator('.branch-trigger')).toHaveText('Default · main');
    await selector.locator('.branch-trigger').click();
    await selector.getByRole('button', { name: 'Branch · draft', exact: true }).click();
    await expect(page).toHaveURL(/#\/h6test\/work~draft\/?$/);
    await api(request, 'POST', '/branches/h6test/control/enable', undefined, 200);
    await page.goto(`${ui}/?browse=1&da-admin=local&da-source=da-rs&da-collab=local#/h6test/control`);
    await expect(selector.locator('.branch-trigger')).toHaveText('Default · main', { timeout: 30000 });
    await selector.locator('.branch-trigger').click();
    await selector.locator('input[name=name]').fill('draft');
    await selector.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page).toHaveURL(/#\/h6test\/control~draft\/?$/);
    await expect(selector.locator('.branch-trigger')).toHaveText('Branch · draft');
    await selector.locator('.branch-trigger').click();
    await selector.getByRole('button', { name: 'Default · main', exact: true }).click();
    await expect(page).toHaveURL(/#\/h6test\/control\/?$/);
    expect(trace.blocked).toEqual([]);
    expect(trace.errors).toEqual([]);
  } finally { await closeObserved(context); }
});

async function expectSemanticDiff(diff, before, after, removed, added) {
  await expect(diff.locator('.diff-body del')).toContainText(removed);
  await expect(diff.locator('.diff-body ins')).toContainText(added);
  const sides = await diff.locator('.diff-body').evaluate((body) => {
    const textWithout = (selector) => {
      const copy = body.cloneNode(true);
      copy.querySelectorAll(selector).forEach((node) => node.remove());
      return copy.textContent.replace(/\s+/g, ' ').trim();
    };
    return { before: textWithout('ins'), after: textWithout('del') };
  });
  expect(sides).toEqual({ before, after });
}

async function checkDiffUi(browser) {
  const trace = observed();
  const { context, page } = await browserPage(browser, trace);
  try {
    await page.goto(`${ui}/?browse=1&da-admin=local&da-source=da-rs&da-collab=local#/h6test/work~draft`);
    const selector = page.locator('da-branch-selector');
    await selector.getByRole('button', { name: 'Changes', exact: true }).click();
    const changes = selector.locator('da-branch-changes');
    await changes.getByRole('button', { name: '/race.html', exact: true }).click();
    const diff = changes.locator('da-branch-diff');
    await expectSemanticDiff(diff, 'B5 default conflict', 'B5 branch conflict', 'default', 'branch');
    await diff.getByRole('button', { name: 'Source', exact: true }).click();
    await expect(diff.getByRole('button', { name: 'Source', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(diff.locator('.source').nth(0).locator('h4')).toHaveText('Default');
    await expect(diff.locator('.source').nth(0).locator('pre')).toHaveText(html('B5 default conflict'));
    await expect(diff.locator('.source').nth(1).locator('h4')).toHaveText('Branch');
    await expect(diff.locator('.source').nth(1).locator('pre')).toHaveText(html('B5 branch conflict'));
    expect(trace.blocked).toEqual([]);
    expect(trace.errors).toEqual([]);
  } finally { await closeObserved(context); }
}

async function revertInSiteHistory(browser) {
  const trace = observed();
  const { context, page } = await browserPage(browser, trace);
  try {
    await page.goto(`${ui}/?browse=1&da-admin=local&da-source=da-rs&da-collab=local#/h6test/work`);
    await expect.poll(() => page.locator('da-browse').evaluate((element) => element._siteHistory), { timeout: 30000 }).toBe(true);
    const settings = page.locator('da-browse nx-menu').filter({ has: page.getByRole('button', { name: 'Settings' }) });
    await settings.getByRole('button', { name: 'Settings' }).click();
    await settings.getByRole('menuitem', { name: 'Site history' }).click();
    const history = page.locator('da-site-history');
    await history.getByRole('button', { name: /merge ·/ }).first().click();
    await expect(history).toContainText('/sheet.json');
    await expect(history).toContainText('/asset.png');
    await expect(history).toContainText('config:/');
    await history.getByRole('button', { name: 'Revert commit' }).click();
    await expect(history).toContainText('Revert applied.');
    expect(trace.blocked).toEqual([]);
    expect(trace.errors).toEqual([]);
  } finally { await closeObserved(context); }
}

async function reconcileInBranchUi(request, browser, doc) {
  const trace = observed();
  const { context, page } = await browserPage(browser, trace);
  try {
    await page.goto(`${ui}/?browse=1&da-admin=local&da-source=da-rs&da-collab=local#/h6test/work~draft`);
    const selector = page.locator('da-branch-selector');
    await expect(selector.locator('.branch-trigger')).toHaveText('Branch · draft', { timeout: 30000 });
    const conflicts = selector.locator('da-branch-conflicts');
    const syncResponse = page.waitForResponse((response) => response.request().method() === 'POST'
      && response.url() === `${source}${branches}/draft/sync`);
    await conflicts.getByRole('button', { name: 'Sync from default', exact: true }).click();
    const sync = await syncResponse;
    expect(sync.status()).toBe(202);
    expect((await sync.json()).status).toBe('needs-resolution');
    await expect(conflicts.getByText('Sync needs resolution', { exact: true })).toBeVisible();
    await api(request, 'PUT', doc, html('locked'), 409, 'text/html');
    await conflicts.getByRole('button', { name: '/race.html', exact: true }).click();
    const diff = conflicts.locator('da-branch-diff');
    await expectSemanticDiff(diff, 'B5 race base', 'B5 branch conflict', 'base', 'branch');
    await conflicts.getByRole('button', { name: 'Base → Default' }).click();
    await expectSemanticDiff(diff, 'B5 race base', 'B5 default conflict', 'base', 'default');
    const keep = conflicts.getByRole('button', { name: 'Keep branch', exact: true });
    await keep.click();
    await expect(keep).toHaveAttribute('aria-pressed', 'true');
    await conflicts.getByRole('button', { name: 'Complete sync', exact: true }).click();
    await expect(conflicts).toContainText('Sync completed.');
    expect(await (await api(request, 'GET', doc, undefined, 200)).text()).toBe(html('B5 branch conflict'));
    expect(await (await api(request, 'GET', `${base}/race.html`, undefined, 200)).text()).toBe(html('B5 default conflict'));
    await conflicts.getByRole('button', { name: 'Merge to default', exact: true }).click();
    await expect(conflicts.getByText('This does not publish to AEM preview or live.')).toBeVisible();
    await expect(conflicts.getByRole('checkbox', { name: 'Delete this branch after merging' })).not.toBeChecked();
    const publishResponse = page.waitForResponse((response) => response.request().method() === 'POST'
      && response.url() === `${source}${branches}/draft/publish`);
    await conflicts.getByRole('button', { name: 'Confirm merge to default', exact: true }).click();
    const response = await publishResponse;
    expect(response.status()).toBe(200);
    expect(response.request().headers()['idempotency-key']).toBeTruthy();
    const publication = await response.json();
    expect(publication.status).toBe('published');
    expect(publication.mergeRevision).toBeTruthy();
    await expect(conflicts).toContainText('Changes merged into default — not published to live.');
    expect(trace.blocked).toEqual([]);
    expect(trace.errors).toEqual([]);
    return publication;
  } finally { await closeObserved(context); }
}

test('B5 full: qualified wire, pinned changes, conflict resolution and publish/revert', async ({ request, browser }) => {
  fullOnly();
  test.setTimeout(120000);
  const doc = `${h6}/race.html`;
  const original = await api(request, 'GET', doc, undefined, 200);
  const tag = original.headers().etag;
  strong(tag);
  await api(request, 'PUT', doc, html('B5 branch conflict'), 201, 'text/html', { 'if-match': tag });
  await api(request, 'PUT', `${da}/race.html`, html('stale must not win'), 412, 'text/html', { 'if-match': tag });
  expect(await (await api(request, 'GET', `${base}/race.html`, undefined, 200)).text()).toBe(html('B5 race base'));
  const current = await api(request, 'GET', doc, undefined, 200);
  const snapshot = await api(request, 'POST', `${doc}/.versions?operation=version&comment=B5%20private`, undefined, 201, undefined, { 'if-match': current.headers().etag });
  const location = snapshot.headers().location;
  expect(location).toMatch(/^\/h6test\/sites\/work~draft\/source\/race\.html\/\.versions\/[^/]+$/);
  expect(await (await api(request, 'GET', location, undefined, 200)).text()).toBe(html('B5 branch conflict'));
  await api(request, 'GET', location.replace('work~draft', 'work~other'), undefined, 404);
  await api(request, 'GET', location.replace('work~draft', 'work'), undefined, 404);
  const copy = await api(request, 'PUT', `${h6}/copy.html?source=%2Frace.html`, undefined, 200);
  expect((await copy.json()).copied).toEqual([{ src: '/race.html', dst: '/copy.html' }]);
  await api(request, 'GET', `${base}/copy.html`, undefined, 404);
  await api(request, 'DELETE', `${h6}/copy.html`, undefined, 204);
  await api(request, 'POST', `${h6}/sheet.json`, '{"row":2}', 201, 'application/json', { 'if-none-match': '*' });
  await api(request, 'POST', `${h6}/sheet.json`, '{"row":3}', 412, 'application/json', { 'if-none-match': '*' });
  const image = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');
  await api(request, 'POST', `${h6}/asset.png`, image, 201, 'image/png');
  expect(await (await api(request, 'GET', `${h6}/asset.png`, undefined, 200)).body()).toEqual(image);
  await api(request, 'GET', `${base}/asset.png`, undefined, 404);
  const configBefore = await (await api(request, 'GET', '/config/h6test/work', undefined, 200)).json();
  const branchConfig = { ...configBefore, data: [...configBefore.data, { key: 'b5.test', value: 'branch' }] };
  await api(request, 'PUT', '/config/h6test/work~draft', JSON.stringify(branchConfig), 201, 'application/json');
  expect(await (await api(request, 'GET', '/config/h6test/work', undefined, 200)).json()).toEqual(configBefore);
  await api(request, 'PUT', `${base}/race.html`, html('B5 default conflict'), 201, 'text/html', { 'if-match': (await api(request, 'GET', `${base}/race.html`, undefined, 200)).headers().etag });
  const changes = await (await api(request, 'GET', `${branches}/draft/changes`, undefined, 200)).json();
  expect(changes.changes.map((item) => item.path)).toContain('/race.html');
  const pins = `path=%2Frace.html&branchRevision=${changes.branchRevision}&defaultRevision=${changes.defaultRevision}`;
  for (const [side, text] of [['base', 'B5 race base'], ['branch', 'B5 branch conflict'], ['default', 'B5 default conflict']]) {
    expect(await (await api(request, 'GET', `${branches}/draft/changes/value?${pins}&side=${side}`, undefined, 200)).text()).toBe(html(text));
  }
  await checkDiffUi(browser);
  await api(request, 'POST', `${h6}/after-pin.html`, html('B5 pin advance'), 201, 'text/html');
  await api(request, 'GET', `${branches}/draft/changes/value?${pins}&side=branch`, undefined, 409);
  const publication = await reconcileInBranchUi(request, browser, doc);
  expect(await (await api(request, 'GET', `${base}/race.html`, undefined, 200)).text()).toBe(html('B5 branch conflict'));
  expect(await (await api(request, 'GET', `${base}/sheet.json`, undefined, 200)).text()).toBe('{"row":2}');
  expect(await (await api(request, 'GET', `${base}/asset.png`, undefined, 200)).body()).toEqual(image);
  expect(await (await api(request, 'GET', '/config/h6test/work', undefined, 200)).json()).toEqual(branchConfig);
  expect(await (await api(request, 'GET', location, undefined, 200)).text()).toBe(html('B5 branch conflict'));
  const detail = await (await api(request, 'GET', `/log/h6test/work/${publication.mergeRevision}`, undefined, 200)).json();
  expect(detail.commit.kind).toBe('merge');
  expect(detail.changes.map((item) => item.itemKind)).toEqual(expect.arrayContaining(['html', 'json', 'media', 'config']));
  await revertInSiteHistory(browser);
  expect(await (await api(request, 'GET', `${base}/race.html`, undefined, 200)).text()).toBe(html('B5 default conflict'));
  expect(await (await api(request, 'GET', '/config/h6test/work', undefined, 200)).json()).toEqual(configBefore);
  console.log(`B5 RECONCILIATION RECEIPT ${JSON.stringify({ pins, mergeRevision: publication.mergeRevision, privateLocation: location })}`);
});

test('B5 full: alias room, independent rooms and real 412/4412 notice race', async ({ request, browser }) => {
  fullOnly();
  test.setTimeout(180000);
  const gate = `http://127.0.0.1:${process.env.H6_GATE_PORT}`;
  const control = async (method, action, checked = true) => {
    if (checked) verifyOwner();
    const r = await request.fetch(`${gate}/__gate__/${action}`, { method, headers: { 'x-h6-gate': process.env.H6_GATE_NONCE }, maxRedirects: 0 });
    expect(r.status()).toBe(200);
    return r.json();
  };
  const noticeControl = async (method, action, checked = true) => {
    if (checked) verifyOwner();
    const r = await request.fetch(`${notice}/__notice__/${action}?name=race&branch=draft`, { method, headers: { 'x-h6-notice': process.env.H6_NOTICE_NONCE }, maxRedirects: 0 });
    expect(r.status()).toBe(200);
    return r.json();
  };
  const trace = observed();
  const { context, page } = await browserPage(browser, trace);
  try {
    // This race must not rely on the mixed-kind test reaching publish/revert.
    const defaultBefore = await (await api(request, 'GET', `${base}/race.html`, undefined, 200)).text();
    const siblingBefore = await (await api(request, 'GET', '/h6test/sites/work~other/source/race.html', undefined, 200)).text();
    const prior = await api(request, 'GET', `${h6}/race.html`, undefined, 200);
    strong(prior.headers().etag);
    const notifications = () => fs.readFileSync(`${scratch}/collab.log`, 'utf8').split(`Admin API ${source}${da}/race.html`).length - 1;
    const count = notifications();
    await api(request, 'PUT', `${h6}/race.html`, html('B5 alias race seed'), 201, 'text/html', { 'if-match': prior.headers().etag });
    await expect.poll(notifications, { timeout: 30000 }).toBeGreaterThan(count);
    const roomsPage = await context.newPage();
    await attachPage(roomsPage, trace, 'alias-peers');
    await roomsPage.goto(`${ui}/__empty`);
    await page.goto(`${ui}/canvas?da-admin=local&da-source=da-rs&da-collab=local#/h6test/work~draft/race`);
    const editor = page.locator('ew-editor-doc .ProseMirror');
    await expect(editor).toContainText('B5 alias race seed', { timeout: 30000 });
    await roomsPage.evaluate(async ({ worker, origin, identity }) => {
      const { Y, WebsocketProvider } = await import('da-y-wrapper');
      const { handleFencedRoomClose, isFencedProvider } = await import('/blocks/shared/branch-selector/fenced-room.js');
      const routes = [`${origin}/source/h6test/work~draft/race.html`, `${origin}/source/h6test/work/race.html`, `${origin}/source/h6test/work~other/race.html`];
      let releaseFresh;
      const freshAllowed = new Promise((resolve) => { releaseFresh = resolve; });
      window.b5ReleaseFreshAlias = releaseFresh;
      window.b5IsFenced = isFencedProvider;
      window.b5Rooms = routes.map((route, index) => {
        const doc = new Y.Doc();
        const provider = new WebsocketProvider(worker, route, doc, { protocols: ['yjs', identity], disableBc: true });
        const room = { doc, provider, closes: 0, codes: [], destroyed: false, reloads: 0, fresh: null };
        doc.on('destroy', () => { room.destroyed = true; });
        provider.on('connection-close', (event) => {
          room.closes += 1;
          room.codes.push(event?.code ?? null);
          if (index !== 0) return;
          handleFencedRoomClose(event, provider, doc, () => {
            room.reloads += 1;
            // Do not reopen until the genuine held notice has been forwarded.
            // The new provider performs ordinary authorized Worker admission.
            freshAllowed.then(() => {
              const nextDoc = new Y.Doc();
              const nextProvider = new WebsocketProvider(worker, route, nextDoc, { protocols: ['yjs', identity], disableBc: true });
              const fresh = { doc: nextDoc, provider: nextProvider, reloads: 0 };
              nextProvider.on('connection-close', (nextEvent) => {
                handleFencedRoomClose(nextEvent, nextProvider, nextDoc, () => { fresh.reloads += 1; });
              });
              room.fresh = fresh;
            });
          });
        });
        return room;
      });
    }, { worker: collab.replace('http:', 'ws:'), origin: source, identity: token });
    await expect.poll(() => roomsPage.evaluate(() => window.b5Rooms.every(({ provider }) => provider.synced && provider.wsconnected && provider.disableBc && !provider.bcconnected)), { timeout: 30000 }).toBe(true);
    const independentCloses = await roomsPage.evaluate(() => window.b5Rooms.slice(1).map(({ closes }) => closes));
    await roomsPage.evaluate(() => window.b5Rooms[0].doc.getMap('b5-room').set('sentinel', 'draft-only'));
    await expect.poll(() => page.evaluate(() => document.querySelector('ew-editor-doc')?._proseContext?.ydoc.getMap('b5-room').get('sentinel')), { timeout: 10000 }).toBe('draft-only');
    expect(await roomsPage.evaluate(() => window.b5Rooms.slice(1).map(({ doc }) => doc.getMap('b5-room').get('sentinel') ?? null))).toEqual([null, null]);
    expect((await page.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    const previous = (await api(request, 'GET', `${h6}/race.html`, undefined, 200)).headers().etag;
    strong(previous);
    await page.evaluate(() => sessionStorage.removeItem('h6-alias-close-codes'));
    let navigations = 0;
    page.on('framenavigated', (frame) => { if (frame === page.mainFrame()) navigations += 1; });
    await control('POST', 'arm');
    await editor.click();
    await editor.press('End');
    await page.keyboard.insertText(' old delayed edit');
    await expect.poll(async () => (await control('GET', 'status')).state, { timeout: 30000 }).toBe('pending');
    const pending = await control('GET', 'status');
    expect(pending.match).toBe(previous);
    expect(pending.containsEdit).toBe(true);
    expect(pending.initiator).toBe('collab');
    expect(pending.contentType).toMatch(/^text\/html(?:;.*)?$/i);
    await noticeControl('POST', 'arm');
    await api(request, 'PUT', `${da}/race.html`, html('B5 newer alias write'), 201, 'text/html', { 'if-match': previous });
    await expect.poll(async () => (await noticeControl('GET', 'status', false)).state, { timeout: 30000 }).toBe('pending');
    const held = await noticeControl('GET', 'status', false);
    expect(held.received).toBe(1);
    expect(held.forwarded).toBe(0);
    await control('POST', 'release', false);
    await expect.poll(async () => (await control('GET', 'status', false)).status, { timeout: 30000 }).toBe(412);
    await Promise.all([
      expect.poll(() => page.evaluate(() => sessionStorage.getItem('h6-alias-close-codes') || '').catch(() => ''), { timeout: 30000 }).toContain('4412'),
      expect.poll(() => roomsPage.evaluate(() => window.b5Rooms[0].codes.includes(4412)), { timeout: 30000 }).toBe(true),
    ]);
    const fenced = await roomsPage.evaluate(() => {
      const room = window.b5Rooms[0];
      return { fenced: window.b5IsFenced(room.provider), destroyed: room.destroyed, shouldConnect: room.provider.shouldConnect, connected: room.provider.wsconnected, reloads: room.reloads, fresh: Boolean(room.fresh) };
    });
    expect(fenced).toEqual({ fenced: true, destroyed: true, shouldConnect: false, connected: false, reloads: 1, fresh: false });
    expect((await noticeControl('GET', 'status', false)).state).toBe('pending');
    await noticeControl('POST', 'release', false);
    await expect.poll(async () => (await noticeControl('GET', 'status', false)).forwarded, { timeout: 30000 }).toBe(1);
    expect(await roomsPage.evaluate(() => window.b5Rooms.slice(1).map(({ closes }) => closes))).toEqual(independentCloses);
    expect(await roomsPage.evaluate(() => window.b5Rooms.slice(1).every(({ provider }) => provider.synced))).toBe(true);
    await expect.poll(() => navigations, { timeout: 30000 }).toBeGreaterThan(0);
    await expect(page.locator('ew-editor-doc .ProseMirror')).toContainText('B5 newer alias write', { timeout: 30000 });
    const newerBytes = html('B5 newer alias write');
    const newH6 = await api(request, 'GET', `${h6}/race.html`, undefined, 200);
    expect(await newH6.text()).toBe(newerBytes);
    const newDa = await api(request, 'GET', `${da}/race.html`, undefined, 200);
    expect(await newDa.text()).toBe(newerBytes);
    strong(newH6.headers().etag);
    expect(newDa.headers().etag).toBe(newH6.headers().etag);
    expect(newH6.headers().etag).not.toBe(previous);
    expect(newDa.headers()['content-branch']).toBe('draft');
    expect(newDa.headers()['x-da-source-mode']).toBe('helix6');
    expect(newH6.headers()['x-da-branch-instance']).toMatch(/^[0-9a-f-]{36}$/i);
    expect(newDa.headers()['x-da-branch-instance']).toBe(newH6.headers()['x-da-branch-instance']);
    await roomsPage.evaluate(() => window.b5ReleaseFreshAlias());
    await expect.poll(() => roomsPage.evaluate(() => {
      const { doc, fresh } = window.b5Rooms[0];
      return Boolean(fresh && fresh.doc !== doc && fresh.provider.synced && fresh.provider.wsconnected
        && fresh.provider.disableBc && !fresh.provider.bcconnected && fresh.reloads === 0);
    }), { timeout: 30000 }).toBe(true);
    const freshAlias = () => roomsPage.evaluate(() => {
      const room = window.b5Rooms[0];
      const text = room.fresh.doc.getXmlFragment('prosemirror').toString();
      return { text, count: text.split('B5 newer alias write').length - 1,
        sentinel: room.fresh.doc.getMap('b5-room').get('sentinel') ?? null,
        oldFenced: window.b5IsFenced(room.provider), oldDestroyed: room.destroyed,
        oldShouldConnect: room.provider.shouldConnect };
    });
    const freshState = await freshAlias();
    expect(freshState.text).toContain('B5 newer alias write');
    expect(freshState.text).not.toContain('old delayed edit');
    expect(freshState.text).not.toContain('B5 alias race seed');
    expect(freshState).toMatchObject({ count: 1, sentinel: null, oldFenced: true, oldDestroyed: true, oldShouldConnect: false });
    expect(await (await api(request, 'GET', `${base}/race.html`, undefined, 200)).text()).toBe(defaultBefore);
    expect(await (await api(request, 'GET', '/h6test/sites/work~other/source/race.html', undefined, 200)).text()).toBe(siblingBefore);
    // Independent peers stay in their original rooms after the draft notice;
    // actual Yjs edits, propagation and durable saves prove more than no-close.
    await roomsPage.evaluate(async ({ worker, origin, identity }) => {
      const { Y, WebsocketProvider } = await import('da-y-wrapper');
      window.b5Peers = ['/source/h6test/work/race.html', '/source/h6test/work~other/race.html'].map((route) => {
        const doc = new Y.Doc();
        return { doc, provider: new WebsocketProvider(worker, `${origin}${route}`, doc, { protocols: ['yjs', identity], disableBc: true }) };
      });
    }, { worker: collab.replace('http:', 'ws:'), origin: source, identity: token });
    await expect.poll(() => roomsPage.evaluate(() => window.b5Peers.every(({ provider }) => provider.synced && provider.wsconnected && provider.disableBc && !provider.bcconnected)), { timeout: 30000 }).toBe(true);
    const healthy = [
      { index: 1, peer: 0, route: `${base}/race.html`, other: '/h6test/sites/work~other/source/race.html', marker: ' B5 default room health' },
      { index: 2, peer: 1, route: '/h6test/sites/work~other/source/race.html', other: `${base}/race.html`, marker: ' B5 sibling room health' },
    ];
    for (const room of healthy) {
      const before = await api(request, 'GET', room.route, undefined, 200);
      const etag = before.headers().etag;
      strong(etag);
      const otherBytes = await (await api(request, 'GET', room.other, undefined, 200)).text();
      const log = `${scratch}/collab.log`;
      const offset = fs.readFileSync(log, 'utf8').length;
      const result = await roomsPage.evaluate(async ({ index, marker }) => {
        const { Y } = await import('da-y-wrapper');
        const findText = (node) => {
          if (node instanceof Y.XmlText) return node;
          for (const child of node.toArray?.() || []) { const found = findText(child); if (found) return found; }
          return undefined;
        };
        const { doc, provider } = window.b5Rooms[index];
        const text = findText(doc.getXmlFragment('prosemirror'));
        if (!text) throw new Error('No editable Y.XmlText in independent room');
        text.insert(text.length, marker);
        const { forceSave } = await import('/blocks/shared/forcesave.js');
        return forceSave(provider);
      }, room);
      expect(result.ok).toBe(true);
      await expect.poll(() => roomsPage.evaluate(({ peer }) => window.b5Peers[peer].doc.getXmlFragment('prosemirror').toString(), room), { timeout: 30000 }).toContain(room.marker.trim());
      await expect.poll(async () => (await (await api(request, 'GET', room.route, undefined, 200)).text()).includes(room.marker.trim()), { timeout: 30000 }).toBe(true);
      expect(await (await api(request, 'GET', room.other, undefined, 200)).text()).toBe(otherBytes);
      expect(await (await api(request, 'GET', `${h6}/race.html`, undefined, 200)).text()).toBe(html('B5 newer alias write'));
      const prefix = `SOURCE PUT ${room.route} match=${etag} status=201 `;
      await expect.poll(() => fs.readFileSync(log, 'utf8').slice(offset).includes(prefix), { timeout: 10000 }).toBe(true);
      const line = fs.readFileSync(log, 'utf8').slice(offset).split('\n').find((entry) => entry.includes(prefix));
      expect(line).toContain('initiator=collab');
      expect(line).toContain('auth=present');
      expect(await roomsPage.evaluate(() => window.b5Rooms.slice(1).map(({ closes }) => closes))).toEqual(independentCloses);
      expect(await roomsPage.evaluate(() => window.b5Rooms.slice(1).every(({ provider }) => provider.synced && provider.wsconnected))).toBe(true);
      console.log(`B5 INDEPENDENT ROOM RECEIPT ${JSON.stringify({ route: room.route, ifMatch: etag, peerObserved: true, flush: true, status: 201 })}`);
    }
    // Cover the Worker's save debounce and a possible delayed stale replay.
    await new Promise((resolve) => setTimeout(resolve, 3200));
    expect(await (await api(request, 'GET', `${h6}/race.html`, undefined, 200)).text()).toBe(newerBytes);
    expect(await (await api(request, 'GET', `${da}/race.html`, undefined, 200)).text()).toBe(newerBytes);
    const stableAlias = await freshAlias();
    expect(stableAlias.text).toContain('B5 newer alias write');
    expect(stableAlias.text).not.toContain('old delayed edit');
    expect(stableAlias.text).not.toContain('B5 alias race seed');
    expect(stableAlias).toMatchObject({ count: 1, sentinel: null, oldFenced: true, oldDestroyed: true, oldShouldConnect: false });
    expect(await roomsPage.evaluate(() => {
      const { fresh } = window.b5Rooms[0];
      return { connected: fresh.provider.wsconnected, synced: fresh.provider.synced, broadcast: fresh.provider.bcconnected, reloads: fresh.reloads };
    })).toEqual({ connected: true, synced: true, broadcast: false, reloads: 0 });
    expect(await roomsPage.evaluate(() => window.b5Rooms.slice(1).map(({ closes }) => closes))).toEqual(independentCloses);
    expect(await noticeControl('GET', 'status')).toMatchObject({ received: 1, forwarded: 1, status: 200 });
    expect(trace.blocked).toEqual([]);
    expect(trace.errors).toEqual([]);
    console.log(`B5 RACE RECEIPT ${JSON.stringify({ route: `${h6}/race.html`, canonical: `${da}/race.html`, ifMatch: previous, status: 412, close: 4412, aliasFenced: fenced.fenced, oldDocDestroyed: fenced.destroyed, freshAlias: true, broadcast: false, noticeReceived: held.received, noticeForwarded: 1 })}`);
  } finally {
    try {
      const { state } = await control('GET', 'status');
      if (state === 'pending') await control('POST', 'release');
      else if (state === 'armed') await control('POST', 'cancel');
    } catch { /* runner releases */ }
    try { if ((await noticeControl('GET', 'status')).state === 'pending') await noticeControl('POST', 'release'); } catch { /* runner releases */ }
    await closeObserved(context);
  }
});

test('B5 full: deletion and same-name recreation fence an in-flight Worker PUT', async ({ request, browser }) => {
  fullOnly();
  test.setTimeout(120000);
  const gate = `http://127.0.0.1:${process.env.H6_GATE_PORT}`;
  const control = async (method, action) => {
    verifyOwner();
    const r = await request.fetch(`${gate}/__gate__/${action}`, { method, headers: { 'x-h6-gate': process.env.H6_GATE_NONCE }, maxRedirects: 0 });
    expect(r.status()).toBe(200);
    return r.json();
  };
  const trace = observed();
  const { context, page } = await browserPage(browser, trace);
  try {
    const reuse = `${h6}/reuse.html`;
    const defaultReuse = `${base}/reuse.html`;
    const defaultBody = html('B5 reuse default seed');
    await api(request, 'POST', defaultReuse, defaultBody, 201, 'text/html');
    await api(request, 'POST', reuse, html('B5 reuse branch seed'), 201, 'text/html');
    expect(await (await api(request, 'GET', defaultReuse, undefined, 200)).text()).toBe(defaultBody);
    await page.goto(`${ui}/canvas?da-admin=local&da-source=da-rs&da-collab=local#/h6test/work~draft/reuse`);
    const editor = page.locator('ew-editor-doc .ProseMirror');
    await expect(editor).toContainText('B5 reuse branch seed', { timeout: 30000 });
    expect((await page.locator('ew-editor-doc').evaluate((element) => element.forceSave())).ok).toBe(true);
    const old = await api(request, 'HEAD', reuse, undefined, 200);
    strong(old.headers().etag);
    const snapshot = await api(request, 'POST', `${reuse}/.versions?operation=version&comment=retired`, undefined, 201, undefined, { 'if-match': old.headers().etag });
    const retiredLocation = snapshot.headers().location;
    expect(await (await api(request, 'GET', retiredLocation, undefined, 200)).text()).toContain('B5 reuse branch seed');
    await page.evaluate(() => sessionStorage.removeItem('h6-alias-close-codes'));
    await control('POST', 'arm');
    await editor.click();
    await editor.press('End');
    await page.keyboard.insertText(' old delayed edit');
    await expect.poll(async () => (await control('GET', 'status')).state, { timeout: 30000 }).toBe('pending');
    const pending = await control('GET', 'status');
    expect(pending.match).toBe(old.headers().etag);
    expect(pending.containsEdit).toBe(true);
    const revision = (await metadata(request)).revision;
    await api(request, 'DELETE', `${branches}/draft?expectedBranchRevision=${revision + 1}`, undefined, 409);
    await api(request, 'DELETE', `${branches}/draft?expectedBranchRevision=${revision}`, undefined, 204);
    await api(request, 'POST', `${branches}/`, JSON.stringify({ name: 'draft' }), 201, 'application/json');
    const fresh = await api(request, 'GET', reuse, undefined, 200);
    strong(fresh.headers().etag);
    expect(fresh.headers().etag).not.toBe(old.headers().etag);
    expect(fresh.headers()['x-da-branch-instance']).not.toBe(old.headers()['x-da-branch-instance']);
    await api(request, 'GET', retiredLocation, undefined, 404);
    const freshBytes = await fresh.text();
    expect(freshBytes).toBe(defaultBody);
    await control('POST', 'release');
    await expect.poll(async () => (await control('GET', 'status')).status, { timeout: 30000 }).toBe(412);
    await expect.poll(() => page.evaluate(() => sessionStorage.getItem('h6-alias-close-codes') || '').catch(() => ''), { timeout: 30000 }).toContain('4412');
    expect(await (await api(request, 'GET', reuse, undefined, 200)).text()).toBe(freshBytes);
    expect(trace.blocked).toEqual([]);
    expect(trace.errors).toEqual([]);
    console.log(`B5 REUSE RECEIPT ${JSON.stringify({ oldInstance: old.headers()['x-da-branch-instance'], freshInstance: fresh.headers()['x-da-branch-instance'], oldEtag: pending.match, freshEtag: fresh.headers().etag, status: 412, close: 4412 })}`);
  } finally {
    try {
      const { state } = await control('GET', 'status');
      if (state === 'pending') await control('POST', 'release');
      else if (state === 'armed') await control('POST', 'cancel');
    } catch { /* runner releases */ }
    await closeObserved(context);
  }
});
