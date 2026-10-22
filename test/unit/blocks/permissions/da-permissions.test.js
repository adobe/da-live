import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../blocks/permissions/da-permissions/da-permissions.js');

const INFO_KEY = 'da-permissions-info-dismissed';

const CONFIG_BODY = {
  ':names': ['permissions'],
  ':version': 3,
  permissions: {
    total: 1,
    limit: 1,
    data: [{ path: 'CONFIG', groups: 'admin@example.com', actions: 'write' }],
  },
};

const NO_SHEET_BODY = {
  ':names': ['data'],
  data: { total: 0, limit: 0, data: [] },
};

function mockFetch({ configFor, sitesFor = () => [], foldersFor = () => [] }) {
  const putCalls = [];
  const pending = [];
  window.fetch = async (url, opts = {}) => {
    const href = String(url);
    // isHlx6's upgrade-status probe — answer plain (no upgrade header) so
    // `source.list` falls through to the legacy list endpoint below.
    if (href.includes('/ping/')) return new Response('', { status: 200 });
    if (opts.method === 'PUT') {
      putCalls.push({ url: href, opts });
      return new Promise((resolve) => { pending.push(resolve); });
    }
    if (href.includes('/list/')) {
      const afterList = href.split('/list/')[1];
      const orgEnd = afterList.indexOf('/');
      if (orgEnd === -1) {
        // `/list/{org}` — site list.
        return new Response(JSON.stringify(sitesFor(afterList)), { status: 200 });
      }
      // `/list/{org}/{site}{path}` — folder list.
      const org = afterList.slice(0, orgEnd);
      const rest = afterList.slice(orgEnd + 1);
      const siteEnd = rest.indexOf('/');
      const site = siteEnd === -1 ? rest : rest.slice(0, siteEnd);
      const path = siteEnd === -1 ? '/' : rest.slice(siteEnd);
      return new Response(JSON.stringify(foldersFor(org, site, path)), { status: 200 });
    }
    const match = href.match(/\/config\/([^/]+)/);
    const org = match ? match[1] : null;
    return new Response(JSON.stringify(configFor(org)), { status: 200 });
  };
  return {
    putCalls,
    resolvePut(status = 200) {
      const resolve = pending.shift();
      resolve(new Response('', { status }));
    },
  };
}

async function waitUntil(predicate, { tries = 50, intervalMs = 10 } = {}) {
  for (let i = 0; i < tries && !predicate(); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
  }
}

// Like `waitUntil`, but always flushes one more `updateComplete` after the
// predicate is met — a reactive property can satisfy the predicate before
// its corresponding render has actually committed to the DOM.
async function settle(el, predicate, { tries = 50, intervalMs = 10 } = {}) {
  for (let i = 0; i < tries && !predicate(); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, intervalMs); });
    // eslint-disable-next-line no-await-in-loop
    await el.updateComplete;
  }
  await el.updateComplete;
}

async function mount(org, site = null) {
  const el = document.createElement('da-permissions');
  el.org = org;
  el.site = site;
  document.body.append(el);
  await el.updateComplete;
  // _load() is async (fetch-backed); poll until it settles past 'loading'.
  for (let i = 0; i < 50 && el._status === 'loading'; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, 10); });
    // eslint-disable-next-line no-await-in-loop
    await el.updateComplete;
  }
  return el;
}

describe('da-permissions', () => {
  let savedFetch;

  beforeEach(() => {
    savedFetch = window.fetch;
    localStorage.removeItem(INFO_KEY);
    window.daTestToasts = [];
  });

  afterEach(() => {
    window.fetch = savedFetch;
    document.querySelectorAll('da-permissions').forEach((el) => el.remove());
    localStorage.removeItem(INFO_KEY);
  });

  it('403 -> "You don\'t have admin access to this org."', async () => {
    window.fetch = async () => new Response('', { status: 403 });
    const el = await mount('myorg');
    expect(el.shadowRoot.textContent).to.contain("You don't have admin access to this org.");
  });

  it('500 -> "Could not load permissions (500)."', async () => {
    window.fetch = async () => new Response('', { status: 500 });
    const el = await mount('myorg');
    expect(el.shadowRoot.textContent).to.contain('Could not load permissions (500).');
  });

  it('no permissions sheet -> the no-sheet copy, a link to /config#/myorg/, and no card "+" buttons', async () => {
    window.fetch = async () => new Response(JSON.stringify(NO_SHEET_BODY), { status: 200 });
    const el = await mount('myorg');
    expect(el.shadowRoot.textContent).to.contain('This org has no permissions sheet yet');
    const link = el.shadowRoot.querySelector('a[href="/config#/myorg/"]');
    expect(link).to.not.equal(null);
    expect(el.shadowRoot.querySelector('da-permissions-cards')).to.equal(null);
  });

  it('ok -> renders cards with slots from buildSlots, and the picker items include site names', async () => {
    window.fetch = async (url) => {
      const href = String(url);
      if (href.includes('/list/')) {
        return new Response(JSON.stringify([{ name: 'site1' }, { name: 'site2' }]), { status: 200 });
      }
      return new Response(JSON.stringify(CONFIG_BODY), { status: 200 });
    };
    const el = await mount('myorg');

    const cards = el.shadowRoot.querySelector('da-permissions-cards');
    expect(cards).to.not.equal(null);
    expect(cards.slots.some((s) => s.path === 'CONFIG')).to.be.true;

    const picker = el.shadowRoot.querySelector('nx-picker');
    const labels = picker.items.filter((i) => !i.divider).map((i) => i.label);
    expect(labels).to.include('site1');
    expect(labels).to.include('site2');
  });

  it('dismissing the info note sets localStorage, and the note stays hidden on remount', async () => {
    window.fetch = async () => new Response('', { status: 403 });
    let el = await mount('myorg');

    expect(el.shadowRoot.querySelector('.permissions-info-note')).to.not.equal(null);
    el.shadowRoot.querySelector('.permissions-info-note button').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.permissions-info-note')).to.equal(null);
    expect(localStorage.getItem(INFO_KEY)).to.equal('true');
    el.remove();

    el = await mount('myorg');
    expect(el.shadowRoot.querySelector('.permissions-info-note')).to.equal(null);
  });

  it('org === null -> renders an org form; submitting "myorg" sets location.hash', async () => {
    const el = await mount(null);
    const form = el.shadowRoot.querySelector('form');
    expect(form).to.not.equal(null);

    window.location.hash = '';
    const input = el.shadowRoot.querySelector('input[name="org"]');
    input.value = 'myorg';
    form.requestSubmit();
    await el.updateComplete;
    expect(window.location.hash).to.equal('#/myorg');
  });

  it('add saves one PUT, renders the new pill, closes the input, clears _busy; "+" buttons disable while pending', async () => {
    const { putCalls, resolvePut } = mockFetch({ configFor: () => CONFIG_BODY });
    const el = await mount('myorg');
    const cards = el.shadowRoot.querySelector('da-permissions-cards');
    await cards.updateComplete;

    const addBtn = cards.shadowRoot.querySelector('article.scope-card[data-path="CONFIG"] .level-row[data-level="read"] .row-add');
    addBtn.click();
    await el.updateComplete;
    await cards.updateComplete;

    const input = cards.shadowRoot.querySelector('.row-add-input');
    expect(input).to.not.equal(null);
    input.value = 'reader@x.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitUntil(() => putCalls.length === 1);
    await el.updateComplete;
    await cards.updateComplete;

    expect(putCalls.length).to.equal(1);
    expect(cards.shadowRoot.querySelector('.row-add-input')).to.equal(null);
    expect(el._busy).to.equal(true);
    const addButtons = [...cards.shadowRoot.querySelectorAll('.row-add')];
    expect(addButtons.length).to.be.greaterThan(0);
    addButtons.forEach((btn) => expect(btn.disabled).to.equal(true));

    resolvePut(200);
    await waitUntil(() => el._busy === false);
    await el.updateComplete;
    await cards.updateComplete;

    expect(el._busy).to.equal(false);
    const readPills = cards.shadowRoot.querySelector('article.scope-card[data-path="CONFIG"] .level-row[data-level="read"] nx-pills');
    expect(readPills.items.some((i) => i.id === 'reader@x.com')).to.equal(true);
  });

  it('add input with comma list saves both', async () => {
    const { putCalls, resolvePut } = mockFetch({ configFor: () => CONFIG_BODY });
    const el = await mount('myorg');
    const cards = el.shadowRoot.querySelector('da-permissions-cards');
    await cards.updateComplete;

    const addBtn = cards.shadowRoot.querySelector('article.scope-card[data-path="CONFIG"] .level-row[data-level="write"] .row-add');
    addBtn.click();
    await el.updateComplete;
    await cards.updateComplete;

    const input = cards.shadowRoot.querySelector('.row-add-input');
    input.value = 'x@x.com, y@x.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitUntil(() => putCalls.length === 1);
    await el.updateComplete;

    resolvePut(200);
    await el.updateComplete;

    expect(putCalls.length).to.equal(1);
    const saved = JSON.parse(putCalls[0].opts.body.get('config'));
    const rule = saved.permissions.data.find((r) => r.path === 'CONFIG' && r.actions === 'write');
    expect(rule.groups.endsWith('x@x.com, y@x.com')).to.equal(true);
  });

  it('remove opens an nx-dialog with title "Remove member" and the scope/level text; Confirm PUTs, Cancel does not', async () => {
    const SITE_CONFIG_BODY = {
      ':names': ['permissions'],
      ':version': 3,
      permissions: {
        total: 1,
        limit: 1,
        data: [{ path: '/mysite/ + **', groups: 'a@x.com', actions: 'write' }],
      },
    };
    const { putCalls, resolvePut } = mockFetch({ configFor: () => SITE_CONFIG_BODY });
    const el = await mount('myorg', 'mysite');
    const cards = el.shadowRoot.querySelector('da-permissions-cards');
    await cards.updateComplete;

    const writePills = cards.shadowRoot.querySelector('article.scope-card[data-path="/mysite/ + **"] .level-row[data-level="write"] nx-pills');
    expect(writePills).to.not.equal(null);

    writePills.dispatchEvent(new CustomEvent('nx-pill-remove', { detail: { id: 'a@x.com' }, bubbles: true }));
    await el.updateComplete;

    let dialog = el.shadowRoot.querySelector('nx-dialog');
    expect(dialog).to.not.equal(null);
    expect(dialog.getAttribute('title')).to.equal('Remove member');
    expect(el.shadowRoot.textContent).to.contain('Remove a@x.com from All site content · Write?');

    dialog.querySelector('[slot="actions"].nx-action-btn').click();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-dialog')).to.equal(null);
    expect(putCalls.length).to.equal(0);

    writePills.dispatchEvent(new CustomEvent('nx-pill-remove', { detail: { id: 'a@x.com' }, bubbles: true }));
    await el.updateComplete;
    dialog = el.shadowRoot.querySelector('nx-dialog');
    dialog.querySelector('[slot="actions"].nx-btn-primary').click();
    await waitUntil(() => putCalls.length === 1);
    await el.updateComplete;

    expect(putCalls.length).to.equal(1);
    resolvePut(200);
    await el.updateComplete;
  });

  it('PUT 403 -> shows the read-only copy and removes the "+" buttons', async () => {
    const { putCalls, resolvePut } = mockFetch({ configFor: () => CONFIG_BODY });
    const el = await mount('myorg');
    const cards = el.shadowRoot.querySelector('da-permissions-cards');
    await cards.updateComplete;

    const addBtn = cards.shadowRoot.querySelector('article.scope-card[data-path="CONFIG"] .level-row[data-level="read"] .row-add');
    addBtn.click();
    await el.updateComplete;
    await cards.updateComplete;
    const input = cards.shadowRoot.querySelector('.row-add-input');
    input.value = 'reader@x.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitUntil(() => putCalls.length === 1);
    await el.updateComplete;

    resolvePut(403);
    await waitUntil(() => el._readOnly === true);
    await el.updateComplete;
    await cards.updateComplete;

    expect(el.shadowRoot.textContent).to.contain('You have read-only access to this configuration.');
    expect(cards.shadowRoot.querySelector('.row-add')).to.equal(null);
  });

  it('PUT 500 -> shows an error toast', async () => {
    const { putCalls, resolvePut } = mockFetch({ configFor: () => CONFIG_BODY });
    const el = await mount('myorg');
    const cards = el.shadowRoot.querySelector('da-permissions-cards');
    await cards.updateComplete;
    const addBtn = cards.shadowRoot.querySelector('article.scope-card[data-path="CONFIG"] .level-row[data-level="read"] .row-add');
    addBtn.click();
    await el.updateComplete;
    await cards.updateComplete;
    const input = cards.shadowRoot.querySelector('.row-add-input');
    input.value = 'reader@x.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitUntil(() => putCalls.length === 1);
    await el.updateComplete;

    resolvePut(500);
    await waitUntil(() => window.daTestToasts.length > 0);
    await el.updateComplete;

    expect(window.daTestToasts.some((t) => t.variant === 'error')).to.equal(true);
  });

  it('PUT network failure (rejected fetch) -> _busy returns to false and shows an error toast', async () => {
    window.fetch = async (url, opts = {}) => {
      const href = String(url);
      if (opts.method === 'PUT') return Promise.reject(new TypeError('Failed to fetch'));
      if (href.includes('/list/')) return new Response(JSON.stringify([]), { status: 200 });
      return new Response(JSON.stringify(CONFIG_BODY), { status: 200 });
    };
    const el = await mount('myorg');
    const cards = el.shadowRoot.querySelector('da-permissions-cards');
    await cards.updateComplete;
    const addBtn = cards.shadowRoot.querySelector('article.scope-card[data-path="CONFIG"] .level-row[data-level="read"] .row-add');
    addBtn.click();
    await el.updateComplete;
    await cards.updateComplete;
    const input = cards.shadowRoot.querySelector('.row-add-input');
    input.value = 'reader@x.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    await waitUntil(() => el._busy === false);
    await waitUntil(() => window.daTestToasts.length > 0);
    await el.updateComplete;
    await cards.updateComplete;

    expect(el._busy).to.equal(false);
    const addButtons = [...cards.shadowRoot.querySelectorAll('.row-add')];
    expect(addButtons.length).to.be.greaterThan(0);
    addButtons.forEach((btn) => expect(btn.disabled).to.equal(false));
    expect(window.daTestToasts.some((t) => t.variant === 'error')).to.equal(true);
  });

  it('filtering narrows rows, auto-expands matches, and clearing restores the prior expand state', async () => {
    const SITE_CONFIG_BODY = {
      ':names': ['permissions'],
      ':version': 3,
      permissions: {
        total: 3,
        limit: 3,
        data: [
          { path: '/ + **', groups: 'orgwriter@example.com', actions: 'write' },
          { path: '/mysite/ + **', groups: 'sitewriter@example.com', actions: 'write' },
          { path: '/mysite/blog/ + **', groups: 'blogwriter@example.com', actions: 'write' },
        ],
      },
    };
    mockFetch({ configFor: () => SITE_CONFIG_BODY });
    const el = await mount('myorg', 'mysite');
    const search = el.shadowRoot.querySelector('nx-search');

    const configPath = '/mysite/CONFIG';
    const contentPath = '/mysite/ + **';
    const blogPath = '/mysite/blog/ + **';

    // Expand the CONFIG row before filtering, so we can verify it's restored.
    el._expanded = new Set([configPath]);
    await el.updateComplete;

    search.value = 'blog';
    search.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await el.updateComplete;

    let cards = el.shadowRoot.querySelector('da-permissions-cards');
    expect(cards.slots.map((s) => s.path)).to.deep.equal([blogPath]);
    expect(cards.expanded.has(blogPath)).to.equal(true);

    search.value = 'orgwriter@example.com';
    search.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await el.updateComplete;

    cards = el.shadowRoot.querySelector('da-permissions-cards');
    expect(cards.slots.map((s) => s.path)).to.deep.equal([contentPath]);
    expect(cards.expanded.has(contentPath)).to.equal(true);

    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await el.updateComplete;

    cards = el.shadowRoot.querySelector('da-permissions-cards');
    expect(cards.slots.map((s) => s.path)).to.include.members([configPath, contentPath, blogPath]);
    expect(cards.expanded.has(configPath)).to.equal(true);
    expect(cards.expanded.has(blogPath)).to.equal(false);
    expect(cards.expanded.has(contentPath)).to.equal(false);
  });

  it('a filter query that matches a big card passes filtering=true, hiding its card-toggle', async () => {
    const writers = Array.from({ length: 20 }, (_, i) => `writer${i}@example.com`);
    const SITE_CONFIG_BODY = {
      ':names': ['permissions'],
      ':version': 3,
      permissions: {
        total: 1,
        limit: 1,
        data: [{ path: '/mysite/ + **', groups: writers.join(', '), actions: 'write' }],
      },
    };
    mockFetch({ configFor: () => SITE_CONFIG_BODY });
    const el = await mount('myorg', 'mysite');
    const search = el.shadowRoot.querySelector('nx-search');

    search.value = 'writer';
    search.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await el.updateComplete;

    const cards = el.shadowRoot.querySelector('da-permissions-cards');
    expect(cards.filtering).to.equal(true);
    await cards.updateComplete;
    expect(cards.shadowRoot.querySelector('.card-toggle')).to.equal(null);
    expect(cards.shadowRoot.querySelector('.row-more')).to.equal(null);
  });

  it('no match -> shows "No scopes match "zzz"" and no cards', async () => {
    mockFetch({ configFor: () => CONFIG_BODY });
    const el = await mount('myorg');
    const search = el.shadowRoot.querySelector('nx-search');

    search.value = '  zzz  ';
    search.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('da-permissions-cards')).to.equal(null);
    expect(el.shadowRoot.textContent).to.contain('No scopes match "zzz"');
  });

  it('changing site resets the filter query and the nx-search value', async () => {
    mockFetch({ configFor: () => CONFIG_BODY });
    const el = await mount('myorg');
    const search = el.shadowRoot.querySelector('nx-search');

    search.value = 'blog';
    search.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    await el.updateComplete;
    expect(el._query).to.equal('blog');

    el.site = 'mysite';
    await el.updateComplete;

    expect(el._query).to.equal('');
    expect(el.shadowRoot.querySelector('nx-search').value).to.equal('');
  });

  it('changing site resets a pending remove-confirmation dialog', async () => {
    mockFetch({ configFor: () => CONFIG_BODY });
    const el = await mount('myorg');

    el._confirmRemove = { path: 'CONFIG', level: 'write', who: 'admin@example.com' };
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('nx-dialog')).to.not.equal(null);

    el.site = 'mysite';
    await el.updateComplete;

    expect(el._confirmRemove).to.equal(null);
    expect(el.shadowRoot.querySelector('nx-dialog')).to.equal(null);
  });

  it('adding only members that already exist (case-insensitive) shows a warning toast and makes no PUT', async () => {
    const { putCalls } = mockFetch({ configFor: () => CONFIG_BODY });
    const el = await mount('myorg');
    const cards = el.shadowRoot.querySelector('da-permissions-cards');
    await cards.updateComplete;

    const addBtn = cards.shadowRoot.querySelector('article.scope-card[data-path="CONFIG"] .level-row[data-level="write"] .row-add');
    addBtn.click();
    await el.updateComplete;
    await cards.updateComplete;

    const input = cards.shadowRoot.querySelector('.row-add-input');
    input.value = 'Admin@example.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitUntil(() => window.daTestToasts.length > 0);
    await el.updateComplete;

    expect(putCalls.length).to.equal(0);
    expect(window.daTestToasts.length).to.equal(1);
    expect(window.daTestToasts[0].variant).to.equal('warning');
    expect(window.daTestToasts[0].text).to.equal('Already has access: Admin@example.com');
  });

  it('save result ignored after org change', async () => {
    const OTHER_CONFIG_BODY = {
      ':names': ['permissions'],
      ':version': 3,
      permissions: {
        total: 1,
        limit: 1,
        data: [{ path: 'CONFIG', groups: 'other-admin@example.com', actions: 'write' }],
      },
    };
    const { putCalls, resolvePut } = mockFetch({ configFor: (org) => (org === 'other' ? OTHER_CONFIG_BODY : CONFIG_BODY) });
    const el = await mount('myorg');
    const cards = el.shadowRoot.querySelector('da-permissions-cards');
    await cards.updateComplete;

    const addBtn = cards.shadowRoot.querySelector('article.scope-card[data-path="CONFIG"] .level-row[data-level="read"] .row-add');
    addBtn.click();
    await el.updateComplete;
    await cards.updateComplete;
    const input = cards.shadowRoot.querySelector('.row-add-input');
    input.value = 'reader@x.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitUntil(() => putCalls.length === 1);
    await el.updateComplete;

    expect(putCalls.length).to.equal(1);

    el.org = 'other';
    await el.updateComplete;
    for (let i = 0; i < 50 && el._status === 'loading'; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 10); });
      // eslint-disable-next-line no-await-in-loop
      await el.updateComplete;
    }

    const toastCountBefore = window.daTestToasts.length;
    resolvePut(200);
    await new Promise((resolve) => { setTimeout(resolve, 20); });
    await el.updateComplete;

    expect(el._rules).to.deep.equal(OTHER_CONFIG_BODY.permissions.data);
    expect(window.daTestToasts.length).to.equal(toastCountBefore);
  });
});

describe('da-permissions folder permission', () => {
  let savedFetch;

  beforeEach(() => {
    savedFetch = window.fetch;
    localStorage.removeItem(INFO_KEY);
  });

  afterEach(() => {
    window.fetch = savedFetch;
    document.querySelectorAll('da-permissions').forEach((el) => el.remove());
    localStorage.removeItem(INFO_KEY);
  });

  const SITE_CONFIG_BODY = {
    ':names': ['permissions'],
    ':version': 3,
    permissions: {
      total: 1,
      limit: 1,
      data: [{ path: '/mysite/ + **', groups: 'a@x.com', actions: 'write' }],
    },
  };

  async function openFolderDialog(el) {
    const openBtn = [...el.shadowRoot.querySelectorAll('button')]
      .find((btn) => btn.textContent.includes('Add folder permission'));
    openBtn.click();
    await el.updateComplete;
    const picker = el.shadowRoot.querySelector('da-folder-picker');
    await settle(picker, () => picker._columns.length > 0);
    return picker;
  }

  function pickFolder(picker, name) {
    const btn = [...picker.shadowRoot.querySelectorAll('.folder-item')]
      .find((b) => b.textContent.trim() === name);
    btn.click();
  }

  it('folder-select: dialog closes, the row is pending + expanded, and the Read add input is open', async () => {
    mockFetch({
      configFor: () => SITE_CONFIG_BODY,
      foldersFor: () => [{ name: 'blog', path: '/myorg/mysite/blog' }],
    });
    const el = await mount('myorg', 'mysite');

    const picker = await openFolderDialog(el);
    pickFolder(picker, 'blog');
    await settle(picker, () => picker._selected === 'blog' && !picker._loading);

    const addBtn = picker.shadowRoot.querySelector('.nx-btn-accent');
    addBtn.click();
    await el.updateComplete;

    expect(el.shadowRoot.querySelector('nx-dialog')).to.equal(null);
    expect(el._pendingFolder).to.equal('blog');

    const cards = el.shadowRoot.querySelector('da-permissions-cards');
    const blogPath = '/mysite/blog/ + **';
    expect(cards.slots.some((s) => s.path === blogPath && s.pending)).to.equal(true);
    expect(cards.expanded.has(blogPath)).to.equal(true);
    expect(cards.adding).to.deep.equal({ path: blogPath, level: 'read' });
  });

  it('cancelling the add leaves the pending row without saving', async () => {
    const { putCalls } = mockFetch({
      configFor: () => SITE_CONFIG_BODY,
      foldersFor: () => [{ name: 'blog', path: '/myorg/mysite/blog' }],
    });
    const el = await mount('myorg', 'mysite');

    const picker = await openFolderDialog(el);
    pickFolder(picker, 'blog');
    await settle(picker, () => picker._selected === 'blog' && !picker._loading);
    picker.shadowRoot.querySelector('.nx-btn-accent').click();
    await el.updateComplete;

    const cards = el.shadowRoot.querySelector('da-permissions-cards');
    await cards.updateComplete;
    const blogPath = '/mysite/blog/ + **';
    const input = cards.shadowRoot.querySelector('.row-add-input');
    expect(input).to.not.equal(null);
    input.dispatchEvent(new FocusEvent('blur'));
    await el.updateComplete;
    await cards.updateComplete;

    expect(putCalls.length).to.equal(0);
    expect(el._pendingFolder).to.equal('blog');
    expect(cards.slots.some((s) => s.path === blogPath && s.pending)).to.equal(true);
    expect(cards.shadowRoot.querySelector('.row-add-input')).to.equal(null);
  });

  it('adding a member saves a rule with path "/s/blog/ + **", and the row is no longer pending', async () => {
    const SITE_S_CONFIG_BODY = {
      ':names': ['permissions'],
      ':version': 3,
      permissions: {
        total: 1,
        limit: 1,
        data: [{ path: '/s/ + **', groups: 'a@x.com', actions: 'write' }],
      },
    };
    const { putCalls, resolvePut } = mockFetch({
      configFor: () => SITE_S_CONFIG_BODY,
      foldersFor: () => [{ name: 'blog', path: '/myorg/s/blog' }],
    });
    const el = await mount('myorg', 's');

    const picker = await openFolderDialog(el);
    pickFolder(picker, 'blog');
    await settle(picker, () => picker._selected === 'blog' && !picker._loading);
    picker.shadowRoot.querySelector('.nx-btn-accent').click();
    await el.updateComplete;

    const blogPath = '/s/blog/ + **';
    expect(el._pendingFolder).to.equal('blog');

    const cards = el.shadowRoot.querySelector('da-permissions-cards');
    await cards.updateComplete;
    const input = cards.shadowRoot.querySelector('.row-add-input');
    input.value = 'reader@x.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await waitUntil(() => putCalls.length === 1);
    await el.updateComplete;

    expect(putCalls.length).to.equal(1);
    const saved = JSON.parse(putCalls[0].opts.body.get('config'));
    const rule = saved.permissions.data.find((r) => r.path === blogPath && r.actions === 'read');
    expect(rule).to.not.equal(undefined);
    expect(rule.groups).to.equal('reader@x.com');

    resolvePut(200);
    await settle(el, () => el._pendingFolder === null);

    expect(el._pendingFolder).to.equal(null);
    const updatedCards = el.shadowRoot.querySelector('da-permissions-cards');
    expect(updatedCards.slots.some((s) => s.path === blogPath && s.pending)).to.equal(false);
  });

  it('navigating to another site clears the pending folder', async () => {
    mockFetch({
      configFor: () => SITE_CONFIG_BODY,
      sitesFor: () => [{ name: 'mysite' }, { name: 'othersite' }],
      foldersFor: () => [{ name: 'blog', path: '/myorg/mysite/blog' }],
    });
    const el = await mount('myorg', 'mysite');

    const picker = await openFolderDialog(el);
    pickFolder(picker, 'blog');
    await settle(picker, () => picker._selected === 'blog' && !picker._loading);
    picker.shadowRoot.querySelector('.nx-btn-accent').click();
    await el.updateComplete;

    expect(el._pendingFolder).to.equal('blog');

    el.site = 'othersite';
    await el.updateComplete;

    expect(el._pendingFolder).to.equal(null);
  });
});
