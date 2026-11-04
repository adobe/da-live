import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { loadConfigs, listSites, saveConfig, setupLibrary } = await import('../../../../blocks/config/api.js');
const { applyValues } = await import('../../../../blocks/config/sheets.js');
await import('../../../../blocks/config/da-config/da-config.js');

const ORG_CONFIG = { ':names': ['data'], ':version': 3, ':type': 'multi-sheet', data: { total: 0, limit: 0, data: [] } };

// A config whose only sheet is `name`, as da-admin returns multi-sheet configs.
const multi = (name, rows) => ({
  [name]: { total: rows.length, limit: rows.length, offset: 0, data: rows },
  ':names': [name],
  ':version': 3,
  ':type': 'multi-sheet',
});

const kv = (rows) => ({
  total: rows.length, limit: rows.length, offset: 0, data: rows, ':sheetname': 'data', ':type': 'sheet',
});

const status = (code) => () => new Response('', { status: code });

const toResponse = (value) => (value instanceof Response
  ? value
  : new Response(JSON.stringify(value), { status: 200 }));

// configFor receives (org, site|null); sitesFor receives org. PUTs are recorded in `puts`
// as { org, site, body } and answered by putFor.
function mockFetch({
  configFor = () => ORG_CONFIG,
  sitesFor = () => [],
  putFor = () => new Response('', { status: 200 }),
  sourceFor = () => status(404)(),
} = {}) {
  const puts = [];
  window.fetch = async (url, opts = {}) => {
    const href = String(url);
    if (href.includes('/ping/')) return new Response('', { status: 200 });
    if (href.includes('/list/')) return toResponse(await sitesFor(href.split('/list/')[1].split('/')[0]));
    const src = href.match(/\/source\/([^/]+)\/([^/]+)(\/[^?]*)/);
    if (src) {
      const [, org, site, path] = src;
      if (opts.method === 'POST') {
        const text = await opts.body.get('data').text();
        let body = text;
        try { body = JSON.parse(text); } catch { /* an HTML document */ }
        puts.push({ org, site, path, body });
        return putFor();
      }
      return toResponse(await sourceFor(org, site, path));
    }
    const match = href.match(/\/config\/([^/]+)\/(?:([^/?]+)\/)?/);
    const [org, site] = [match?.[1] ?? null, match?.[2] ?? null];
    if (opts.method === 'PUT') {
      puts.push({ org, site, body: JSON.parse(opts.body.get('config')) });
      return putFor();
    }
    return toResponse(await configFor(org, site));
  };
  return puts;
}

// Polls every 10ms for up to 500ms.
const WAIT_STEPS = 50;
const WAIT_STEP_MS = 10;

async function waitUntil(predicate, el) {
  for (let i = 0; i < WAIT_STEPS && !predicate(); i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve, WAIT_STEP_MS); });
  }
  await el.updateComplete;
}

describe('config api', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  describe('loadConfigs', () => {
    it('returns both configs when they exist', async () => {
      mockFetch({ configFor: (org, site) => ({ ...ORG_CONFIG, who: site ?? org }) });
      const result = await loadConfigs('lc1', 'site1');
      expect([result.status, result.org.who, result.site.who]).to.deep.equal(['ok', 'lc1', 'site1']);
    });

    it('skips the site config at org scope', async () => {
      const asked = [];
      mockFetch({
        configFor: (org, site) => {
          asked.push(site);
          return ORG_CONFIG;
        },
      });
      expect((await loadConfigs('lc2')).site).to.equal(null);
      expect(asked).to.deep.equal([null]);
    });

    it('treats a 404 as an empty config', async () => {
      mockFetch({ configFor: (org, site) => (site ? status(404)() : ORG_CONFIG) });
      const result = await loadConfigs('lc3', 'site3');
      expect([result.status, result.site]).to.deep.equal(['ok', null]);
    });

    it('reports no-access on 401/403 from either level', async () => {
      mockFetch({ configFor: (org, site) => (site ? status(403)() : ORG_CONFIG) });
      expect((await loadConfigs('lc4', 'site4')).status).to.equal('no-access');
      mockFetch({ configFor: status(401) });
      expect((await loadConfigs('lc5')).status).to.equal('no-access');
    });

    it('reports other failures as errors with the http status', async () => {
      mockFetch({ configFor: status(500) });
      const { status: s, httpStatus } = await loadConfigs('lc6');
      expect([s, httpStatus]).to.deep.equal(['error', 500]);
    });
  });

  describe('listSites', () => {
    it('keeps folders from the org listing', async () => {
      mockFetch({ sitesFor: () => [{ name: 'zeta' }, { name: 'a', ext: 'json' }] });
      expect(await listSites('ls1')).to.deep.equal(['zeta']);
    });

    it('returns no sites when the listing fails', async () => {
      mockFetch({ sitesFor: status(500) });
      expect(await listSites('ls2')).to.deep.equal([]);
    });
  });

  describe('setupLibrary', () => {
    const TEMPLATES = { title: 'Templates', paths: ['/docs/library/templates.json', '/library/templates.json'] };
    const paths = (puts) => puts.map((p) => p.path ?? 'config');

    it('creates the primary file when none exists, then registers it', async () => {
      const puts = mockFetch({ configFor: () => status(404)() });
      const result = await setupLibrary('sl1', 'site1', TEMPLATES);
      expect([result.ok, result.path]).to.deep.equal([true, '/docs/library/templates.json']);
      expect(paths(puts)).to.deep.equal(['/docs/library/templates.json', 'config']);
      expect(puts[0].body).to.include({ ':sheetname': 'data', ':type': 'sheet' });
      expect(puts[1].body.library.data).to.deep.equal([{ title: 'Templates', path: '/docs/library/templates.json' }]);
    });

    it('registers the primary file when it exists, without rewriting it', async () => {
      const puts = mockFetch({ sourceFor: (o, s, path) => (path.startsWith('/docs/') ? kv([]) : status(404)()) });
      const result = await setupLibrary('sl2', 'site2', TEMPLATES);
      expect(result.path).to.equal('/docs/library/templates.json');
      expect(paths(puts)).to.deep.equal(['config']);
    });

    it('falls back to the second path when only that exists', async () => {
      const puts = mockFetch({ sourceFor: (o, s, path) => (path === '/library/templates.json' ? kv([]) : status(404)()) });
      const result = await setupLibrary('sl3', 'site3', TEMPLATES);
      expect(result.path).to.equal('/library/templates.json');
      expect(puts[0].body.library.data).to.deep.equal([{ title: 'Templates', path: '/library/templates.json' }]);
    });

    it('keeps an existing single-path file, like an EDS placeholders sheet', async () => {
      const existing = kv([{ Key: 'read-more', Text: 'Read more' }]);
      const puts = mockFetch({ sourceFor: () => existing });
      await setupLibrary('sl4', 'site4', { title: 'Placeholders', paths: ['/placeholders.json'] });
      expect(paths(puts)).to.deep.equal(['config']);
    });

    it('stops without writing when a file cannot be read', async () => {
      const puts = mockFetch({ sourceFor: status(500) });
      expect(await setupLibrary('sl5', 'site5', TEMPLATES)).to.deep.equal({ ok: false, status: 500 });
      expect(puts).to.have.length(0);
    });
  });

  describe('saveConfig', () => {
    const setK = (json) => applyValues(json, { k: 'v' }, 'data');

    it('re-reads the config, applies the change and saves it', async () => {
      const puts = mockFetch({ configFor: () => kv([{ key: 'old', value: '1' }]) });
      const result = await saveConfig('sc1', 'site1', setK);
      expect(result.ok).to.equal(true);
      expect(puts).to.have.length(1);
      expect([puts[0].org, puts[0].site]).to.deep.equal(['sc1', 'site1']);
      expect(puts[0].body.data).to.deep.equal([{ key: 'old', value: '1' }, { key: 'k', value: 'v' }]);
      expect(result.config).to.deep.equal(puts[0].body);
    });

    it('creates a config when none exists yet', async () => {
      const puts = mockFetch({ configFor: status(404) });
      expect((await saveConfig('sc2', null, setK)).ok).to.equal(true);
      expect(puts[0].body.data).to.deep.equal([{ key: 'k', value: 'v' }]);
    });

    it('skips the save when nothing changed', async () => {
      const puts = mockFetch({ configFor: () => kv([{ key: 'k', value: 'v' }]) });
      expect((await saveConfig('sc3', null, setK)).ok).to.equal(true);
      expect(puts).to.have.length(0);
    });

    it('reports read and save failures with their status', async () => {
      mockFetch({ configFor: status(403) });
      expect(await saveConfig('sc4', null, setK)).to.deep.equal({ ok: false, status: 403 });
      mockFetch({ putFor: status(500) });
      expect(await saveConfig('sc5', null, setK)).to.include({ ok: false, status: 500 });
    });

    it('reports network errors as status 0', async () => {
      mockFetch({ putFor: () => { throw new Error('offline'); } });
      expect(await saveConfig('sc6', null, setK)).to.deep.equal({ ok: false, status: 0, error: 'offline' });
      mockFetch({ configFor: () => { throw new Error('offline'); } });
      expect(await loadConfigs('sc7')).to.deep.include({ status: 'error', httpStatus: 0 });
    });
  });
});

describe('da-config', () => {
  let el;
  let savedFetch;
  let savedUrl;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedUrl = window.location.href;
    window.history.replaceState(null, '', window.location.pathname);
    localStorage.removeItem('da-config-sections');
    mockFetch({ sitesFor: () => [{ name: 'alpha' }, { name: 'beta' }] });
    el = document.createElement('da-config');
    document.body.append(el);
  });

  afterEach(() => {
    el.remove();
    window.fetch = savedFetch;
    window.history.replaceState(null, '', savedUrl);
  });

  const q = (sel) => el.shadowRoot.querySelector(sel);
  // Assert on booleans, not elements: when an expect() on a live element fails, chai hangs
  // while formatting it for the error message.
  const has = (sel) => !!q(sel);
  const values = (sel) => q(sel).items.map((i) => i.value);
  // Flush the pending update first so a just-started reload is visible to the predicate.
  const ready = async () => {
    await el.updateComplete;
    await waitUntil(() => el._status === 'ok' && el._sites.length > 0, el);
  };

  it('asks for an org when there is none', async () => {
    await el.updateComplete;
    expect(has('.config-org-form')).to.equal(true);
    expect(has('nx-segmented-btn')).to.equal(false);
  });

  it('opens the org entered in the form', async () => {
    await el.updateComplete;
    q('.config-org-form input').value = ' acme ';
    q('.config-org-form').dispatchEvent(new Event('submit', { cancelable: true }));
    expect(window.location.hash).to.equal('#/acme');
  });

  it('changes scope through the picker, after confirming unsaved changes', async () => {
    el.org = 'nav1';
    el._sectionId = 'aem-assets';
    await ready();
    const picker = q('.config-scope-picker nx-picker');
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'beta' } }));
    expect(window.location.hash).to.equal('#/nav1/beta');

    el._onEdit('aem.repositoryId', 'author-p1-e2.adobeaemcloud.com');
    await el.updateComplete;
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: '' } }));
    await el.updateComplete;
    expect([window.location.hash, !!el._confirm]).to.deep.equal(['#/nav1/beta', true]);
    el._resolveConfirm(false);
    expect(picker.value).to.equal('');
  });

  it('warns before leaving the page with unsaved changes', async () => {
    el.org = 'nav2';
    el._sectionId = 'aem-assets';
    await ready();
    const leave = () => {
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(leave()).to.equal(false);
    el._onEdit('aem.repositoryId', 'author-p1-e2.adobeaemcloud.com');
    expect(leave()).to.equal(true);
  });

  it('shows only org tabs at org scope, and no secondary row for single-section tabs', async () => {
    el.org = 'dc1';
    await ready();
    expect(values('.config-tabs-primary')).to.deep.equal(['extensions', 'workspace', 'integrations', 'multi-site']);
    expect(q('.config-tabs-primary').value).to.equal('extensions');
    expect(values('.config-tabs-secondary')).to.deep.equal(['plugins', 'prepare']);
    expect(new URL(window.location.href).searchParams.get('tab')).to.equal('plugins');

    q('.config-tabs-primary').dispatchEvent(new CustomEvent('change', { detail: { value: 'workspace' } }));
    await el.updateComplete;
    // Compare to a boolean: a failing expect() on a live element hangs while chai formats it.
    expect(has('.config-tabs-secondary')).to.equal(false);
  });

  it('shows site tabs and the secondary row at site scope', async () => {
    el.org = 'dc2';
    el.site = 'alpha';
    await ready();
    expect(values('.config-tabs-primary')).to.deep.equal(['library', 'extensions', 'workspace', 'integrations']);
    expect(values('.config-tabs-secondary')).to.deep.equal(['blocks', 'templates', 'icons', 'placeholders']);
    expect(q('.config-tabs-secondary').items[0].icon).to.match(/\/blocks\/config\/img\/box\.svg$/);
  });

  it('switches sections from both tab rows and records it in ?tab=', async () => {
    el.org = 'dc3';
    el.site = 'alpha';
    await ready();
    q('.config-tabs-primary').dispatchEvent(new CustomEvent('change', { detail: { value: 'integrations' } }));
    await el.updateComplete;
    expect(q('.config-tabs-secondary').value).to.equal('aem-assets');

    q('.config-tabs-secondary').dispatchEvent(new CustomEvent('change', { detail: { value: 'translation' } }));
    await el.updateComplete;
    expect(q('.config-panel').getAttribute('aria-label')).to.equal('Translation');
    expect(new URL(window.location.href).searchParams.get('tab')).to.equal('translation');
  });

  it('reopens the section last shown in a tab, and in the org/site after a reload', async () => {
    el.org = 'dc9';
    el.site = 'alpha';
    await ready();
    const pick = async (row, value) => {
      q(row).dispatchEvent(new CustomEvent('change', { detail: { value } }));
      await el.updateComplete;
    };
    await pick('.config-tabs-secondary', 'templates');
    await pick('.config-tabs-primary', 'extensions');
    expect(q('.config-tabs-secondary').value).to.equal('plugins');
    await pick('.config-tabs-primary', 'library');
    expect(q('.config-tabs-secondary').value).to.equal('templates');

    // A fresh page without ?tab= opens the section last shown for that org/site, if any.
    el.remove();
    window.history.replaceState(null, '', window.location.pathname);
    el = document.createElement('da-config');
    document.body.append(el);
    el.org = 'dc9';
    el.site = 'alpha';
    await ready();
    expect(el._selection.section.id).to.equal('templates');
    el.site = 'beta';
    await ready();
    expect(el._selection.section.id).to.equal('templates');
    el.remove();
    window.history.replaceState(null, '', window.location.pathname);
    el = document.createElement('da-config');
    document.body.append(el);
    el.org = 'dc9';
    el.site = 'gamma';
    await ready();
    expect(el._selection.section.id).to.equal('blocks');
  });

  it('keeps a shared section when moving to org scope, and falls back otherwise', async () => {
    el.org = 'dc4';
    el.site = 'alpha';
    await ready();
    el._sectionId = 'aem-assets';
    el.site = null;
    await ready();
    expect(q('.config-tabs-primary').value).to.equal('integrations');

    el.site = 'alpha';
    await ready();
    el._sectionId = 'icons';
    el.site = null;
    await ready();
    expect(q('.config-tabs-primary').value).to.equal('extensions');
  });

  it('adds the tab design to both segmented controls once', async () => {
    el.org = 'dc7';
    el.site = 'alpha';
    await ready();
    const rows = [...el.shadowRoot.querySelectorAll('nx-segmented-btn')];
    rows.forEach((row) => row.attachShadow({ mode: 'open' }));
    // Two updates: the first adds the sheet, the second proves it isn't added again.
    el.requestUpdate();
    await el.updateComplete;
    el.requestUpdate();
    await el.updateComplete;
    rows.forEach((row) => expect(row.shadowRoot.adoptedStyleSheets).to.have.length(1));
  });

  it('lists Org Configs, then listed sites merged with sites from the permissions rules', async () => {
    const withRules = {
      ':names': ['permissions'],
      permissions: { data: [{ path: '/gamma/+**', groups: 'a@b.com', actions: 'write' }] },
    };
    mockFetch({ configFor: () => withRules, sitesFor: () => [{ name: 'alpha' }] });
    el.org = 'dc5';
    await ready();
    const { items, value } = q('nx-picker');
    expect(value).to.equal('');
    expect(items).to.deep.equal([
      { value: '', label: 'Org Configs' },
      { divider: true },
      { value: 'alpha', label: 'alpha' },
      { value: 'gamma', label: 'gamma' },
    ]);
  });

  it('shows the no-access message', async () => {
    mockFetch({ configFor: status(403) });
    el.org = 'dc6';
    await waitUntil(() => el._status === 'no-access', el);
    expect(q('.config-alert[role="alert"]').textContent).to.include("don't have access");
    expect(has('nx-segmented-btn')).to.equal(false);
  });

  describe('AEM Assets panel', () => {
    const REPO = 'aem.repositoryId';
    const ORIGIN = 'aem.assets.prod.origin';
    const field = (key) => q(`[id="config-${key}"]`);
    const row = (key) => field(key).closest('.config-setting');
    const type = async (key, value) => {
      const input = field(key);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await el.updateComplete;
    };
    const click = async (selector) => {
      q(selector).click();
      await el.updateComplete;
    };
    const open = async ({ org, site = null }) => {
      el.org = org;
      el.site = site;
      el._sectionId = 'aem-assets';
      await ready();
    };

    it('renders every AEM Assets field with no save bar until something changes', async () => {
      await open({ org: 'aa1' });
      expect(el.shadowRoot.querySelectorAll('.config-setting')).to.have.length(7);
      expect(field(REPO).value).to.equal('');
      expect(has('.config-savebar')).to.equal(false);
    });

    it('saves edits in one write and clears the save bar', async () => {
      const puts = mockFetch({ sitesFor: () => [{ name: 'alpha' }] });
      await open({ org: 'aa2' });
      await type(REPO, ' author-p1-e2.adobeaemcloud.com ');
      expect(q('.config-savebar-count').textContent).to.equal('1 unsaved change');

      await click('.config-savebar .nx-form-btn-primary');
      await waitUntil(() => !el._busy, el);
      expect(puts).to.have.length(1);
      expect(puts[0].body.data.data).to.deep.equal([{ key: REPO, value: 'author-p1-e2.adobeaemcloud.com' }]);
      expect(has('.config-savebar')).to.equal(false);
      expect(field(REPO).value).to.equal('author-p1-e2.adobeaemcloud.com');
    });

    it('names the network error when a save cannot reach the server', async () => {
      mockFetch({ sitesFor: () => [{ name: 'alpha' }], putFor: () => { throw new Error('Failed to fetch'); } });
      window.daTestToasts.length = 0;
      await open({ org: 'aa8' });
      await type(REPO, 'author-p1-e2.adobeaemcloud.com');
      await click('.config-savebar .nx-form-btn-primary');
      await waitUntil(() => !el._busy && window.daTestToasts.length > 0, el);
      expect(window.daTestToasts.map((t) => t.text)).to.deep.equal(['Could not save changes (Failed to fetch).']);
    });

    it('keeps the edits and reports a failed save', async () => {
      mockFetch({ sitesFor: () => [{ name: 'alpha' }], putFor: status(500) });
      window.daTestToasts.length = 0;
      await open({ org: 'aa9' });
      await type(REPO, 'author-p1-e2.adobeaemcloud.com');
      await click('.config-savebar .nx-form-btn-primary');
      await waitUntil(() => !el._busy && window.daTestToasts.length > 0, el);
      expect(window.daTestToasts.map((t) => [t.text, t.variant])).to.deep.equal([['Could not save changes (500).', 'error']]);
      expect([has('.config-savebar'), el._readOnly]).to.deep.equal([true, false]);
    });

    it('blocks saving invalid values and discards edits', async () => {
      await open({ org: 'aa3' });
      await type(ORIGIN, 'https://assets.example.com');
      expect(!!row(ORIGIN).querySelector('.nx-input-error-msg')).to.equal(true);
      expect(q('.config-savebar .nx-form-btn-primary').disabled).to.equal(true);

      await click('.config-savebar .nx-form-btn-secondary');
      expect(has('.config-savebar')).to.equal(false);
      expect(field(ORIGIN).value).to.equal('');
    });

    it('shows inherited and overridden org values at site scope, and resets to the org default', async () => {
      const org = kv([{ key: REPO, value: 'author-p1-e1.adobeaemcloud.com' }, { key: ORIGIN, value: 'org.example.com' }]);
      const site = kv([{ key: ORIGIN, value: 'site.example.com' }]);
      const puts = mockFetch({ configFor: (o, s) => (s ? site : org), sitesFor: () => [{ name: 'alpha' }] });
      await open({ org: 'aa4', site: 'alpha' });

      expect(row(REPO).textContent).to.include('Inherited from org');
      expect(field(REPO).placeholder).to.equal('author-p1-e1.adobeaemcloud.com');
      expect(row(ORIGIN).querySelector('nx-pills.config-pill-override').items[0].label).to.equal('Overrides org');
      expect(row(REPO).querySelector('nx-pills.config-pill-neutral').items[0].label).to.equal('Required');

      row(ORIGIN).querySelector('.nx-action-btn-quiet').click();
      await el.updateComplete;
      await click('.config-savebar .nx-form-btn-primary');
      await waitUntil(() => !el._busy, el);
      expect(puts[0].site).to.equal('alpha');
      expect(puts[0].body.data).to.deep.equal([]);
      expect(row(ORIGIN).textContent).to.include('Inherited from org');
    });

    it('lets a site turn off an on/off value the org turned on', async () => {
      const DM = 'aem.asset.dm.delivery';
      const org = kv([{ key: DM, value: 'on' }]);
      const puts = mockFetch({ configFor: (o, s) => (s ? status(404)() : org), sitesFor: () => [{ name: 'alpha' }] });
      await open({ org: 'aa7', site: 'alpha' });
      const picker = field(DM);
      expect(picker.items.map((i) => i.label)).to.deep.equal(['Inherit from org', 'On', 'Off']);
      expect(row(DM).textContent).to.include('Inherited from org: On');

      picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'off' } }));
      await el.updateComplete;
      await click('.config-savebar .nx-form-btn-primary');
      await waitUntil(() => !el._busy, el);
      expect(puts[0].body.data).to.deep.equal([{ key: DM, value: 'off' }]);
      expect(!!row(DM).querySelector('nx-pills.config-pill-override')).to.equal(true);
    });

    it('asks before leaving a tab with unsaved changes', async () => {
      await open({ org: 'aa5' });
      await type(REPO, 'author-p1-e2.adobeaemcloud.com');
      const primary = q('.config-tabs-primary');
      primary.value = 'workspace';
      primary.dispatchEvent(new CustomEvent('change', { detail: { value: 'workspace' } }));
      await el.updateComplete;
      expect(has('nx-dialog')).to.equal(true);

      await click('nx-dialog .nx-form-btn-secondary');
      expect(primary.value).to.equal('integrations');
      expect(field(REPO).value).to.equal('author-p1-e2.adobeaemcloud.com');

      primary.dispatchEvent(new CustomEvent('change', { detail: { value: 'workspace' } }));
      await el.updateComplete;
      await click('nx-dialog .nx-form-btn-primary');
      expect(q('.config-panel').getAttribute('aria-label')).to.equal('Experience Workspace');
      expect(el._edits).to.deep.equal({});
    });

    it('switches to read-only when the save is denied', async () => {
      mockFetch({ putFor: status(403), sitesFor: () => [{ name: 'alpha' }] });
      await open({ org: 'aa6' });
      await type(REPO, 'author-p1-e2.adobeaemcloud.com');
      await click('.config-savebar .nx-form-btn-primary');
      await waitUntil(() => el._readOnly, el);
      expect(el.shadowRoot.textContent).to.include('read-only access');
      expect(field(ORIGIN).disabled).to.equal(true);
    });
  });
  describe('Experience Workspace panel', () => {
    const open = async ({ org, site = null }) => {
      el.org = org;
      el.site = site;
      el._sectionId = 'experience-workspace';
      await ready();
    };

    it('links to the setup app until ew.enabled has been set', async () => {
      await open({ org: 'ew1', site: 'alpha' });
      const link = q('.config-setup a');
      expect(link.href).to.match(/\/ew-setup\/ew-setup#\/ew1\/alpha$/);
      expect(link.target).to.equal('_blank');
      expect(has('.config-settings')).to.equal(false);
    });

    it('shows the flags once the org enabled it, and saves site changes to the flags sheet', async () => {
      const org = multi('flags', [{ key: 'ew.enabled', value: 'true' }]);
      const puts = mockFetch({ configFor: (o, s) => (s ? status(404)() : org), sitesFor: () => [{ name: 'alpha' }] });
      await open({ org: 'ew2', site: 'alpha' });
      expect(has('.config-setup')).to.equal(false);
      expect(el.shadowRoot.querySelectorAll('.config-setting')).to.have.length(4);
      expect(q('[id="config-ew.enabled"]').closest('.config-setting').textContent).to.include('Inherited from org: On');

      const view = q('[id="config-ew.canvasDefaultView"]');
      view.dispatchEvent(new CustomEvent('change', { detail: { value: 'split' } }));
      await el.updateComplete;
      q('.config-savebar .nx-form-btn-primary').click();
      await waitUntil(() => !el._busy, el);
      expect(puts[0].site).to.equal('alpha');
      expect(puts[0].body[':names']).to.deep.equal(['flags']);
      expect(puts[0].body.flags.data).to.deep.equal([{ key: 'ew.canvasDefaultView', value: 'split' }]);
    });

    it('always shows the org-wide fields at org scope', async () => {
      mockFetch({ configFor: () => multi('flags', []), sitesFor: () => [{ name: 'alpha' }] });
      await open({ org: 'ew3' });
      expect(has('.config-setup')).to.equal(false);
      expect(el.shadowRoot.querySelectorAll('.config-setting')).to.have.length(4);
      expect(el.shadowRoot.textContent).to.not.include('Run the setup app');
    });

    it('keeps the site fields editable after ew.enabled was turned off, with a setup link', async () => {
      mockFetch({ configFor: () => multi('flags', [{ key: 'ew.enabled', value: 'false' }]), sitesFor: () => [{ name: 'alpha' }] });
      await open({ org: 'ew5', site: 'alpha' });
      expect(has('.config-setup')).to.equal(false);
      expect(q('[id="config-ew.enabled"]').value).to.equal('false');
      const link = [...el.shadowRoot.querySelectorAll('.config-info a')].find((a) => a.textContent.includes('setup app'));
      expect(link.href).to.match(/#\/ew5\/alpha$/);
    });

    it('shows the Overrides org pill for site flags that differ from the org', async () => {
      const org = multi('flags', [{ key: 'ew.enabled', value: 'true' }, { key: 'ew.canvasDefaultView', value: 'layout' }]);
      const site = multi('flags', [{ key: 'ew.canvasDefaultView', value: 'split' }]);
      mockFetch({ configFor: (o, s) => (s ? site : org), sitesFor: () => [{ name: 'alpha' }] });
      await open({ org: 'ew6', site: 'alpha' });
      const viewRow = q('[id="config-ew.canvasDefaultView"]').closest('.config-setting');
      expect(!!viewRow.querySelector('nx-pills.config-pill-override')).to.equal(true);
      expect(viewRow.textContent).to.include('Org default: Layout');
      const enabledRow = q('[id="config-ew.enabled"]').closest('.config-setting');
      expect(!!enabledRow.querySelector('nx-pills.config-pill-override')).to.equal(false);
      expect(enabledRow.textContent).to.include('Inherited from org: On');
    });

    it('re-checks setup when the window regains focus', async () => {
      let enabled = false;
      mockFetch({
        configFor: () => multi('flags', enabled ? [{ key: 'ew.enabled', value: 'true' }] : []),
        sitesFor: () => [{ name: 'alpha' }],
      });
      await open({ org: 'ew7', site: 'alpha' });
      expect(has('.config-setup')).to.equal(true);
      enabled = true;
      window.dispatchEvent(new Event('focus'));
      await ready();
      expect(has('.config-setup')).to.equal(false);
      expect(el.shadowRoot.querySelectorAll('.config-setting')).to.have.length(4);
    });

    it('checks again after setup by reloading the config', async () => {
      let enabled = false;
      mockFetch({
        configFor: () => multi('flags', enabled ? [{ key: 'ew.enabled', value: 'true' }] : []),
        sitesFor: () => [{ name: 'alpha' }],
      });
      await open({ org: 'ew4', site: 'alpha' });
      enabled = true;
      q('.config-setup .nx-form-btn-secondary').click();
      await ready();
      expect(has('.config-setup')).to.equal(false);
    });
  });

  describe('Prepare panel', () => {
    const ROLLOUT = { title: 'Rollout', path: 'https://da.live/nx/public/plugins/rollout.html' };
    const open = async ({ org, site = null }) => {
      el.org = org;
      el.site = site;
      el._sectionId = 'prepare';
      await ready();
    };
    const dialogInput = (key) => q(`nx-dialog [id="config-${key}"]`);
    const type = async (key, value) => {
      const input = dialogInput(key);
      input.value = value;
      input.dispatchEvent(new Event('input'));
      await el.updateComplete;
    };
    const click = async (selector) => {
      q(selector).click();
      await el.updateComplete;
    };
    const buttonIn = (row, text) => [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

    it('adds a row through the dialog and saves the prepare sheet', async () => {
      const puts = mockFetch({ configFor: () => status(404)(), sitesFor: () => [{ name: 'alpha' }] });
      await open({ org: 'pr1' });
      expect(el.shadowRoot.textContent).to.include('No menu items yet');
      await click('.config-panel > div .nx-form-btn-secondary');
      await click('nx-dialog .nx-form-btn-primary');
      expect(has('nx-dialog .nx-input-error-msg')).to.equal(true);

      await type('title', 'Rollout');
      await type('path', ROLLOUT.path);
      await click('nx-dialog .nx-form-btn-primary');
      expect(has('nx-dialog')).to.equal(false);
      expect(q('.config-table tbody th').textContent).to.include('Rollout');
      expect(q('.config-savebar-count').textContent).to.equal('Unsaved changes');

      await click('.config-savebar .nx-form-btn-primary');
      await waitUntil(() => !el._busy, el);
      expect(puts[0].body[':names']).to.deep.equal(['prepare']);
      expect(puts[0].body.prepare.data).to.deep.equal([ROLLOUT]);
      expect(has('.config-savebar')).to.equal(false);
    });

    it('shows inherited org rows at site scope and overrides one with a site row', async () => {
      const org = multi('prepare', [ROLLOUT, { title: 'Send to Adobe Target' }]);
      const puts = mockFetch({ configFor: (o, s) => (s ? status(404)() : org), sitesFor: () => [{ name: 'alpha' }] });
      await open({ org: 'pr2', site: 'alpha' });
      const rows = [...el.shadowRoot.querySelectorAll('.config-table tbody tr')];
      expect(rows).to.have.length(2);
      expect(rows[0].querySelector('nx-pills').items[0].label).to.equal('Inherited from org');

      buttonIn(rows[0], 'Override').click();
      await el.updateComplete;
      expect(dialogInput('title').value).to.equal('Rollout');
      await type('ref', 'uat');
      await click('nx-dialog .nx-form-btn-primary');
      const first = q('.config-table tbody tr');
      expect(!!first.querySelector('nx-pills.config-pill-override')).to.equal(true);

      await click('.config-savebar .nx-form-btn-primary');
      await waitUntil(() => !el._busy, el);
      expect(puts[0].site).to.equal('alpha');
      expect(puts[0].body.prepare.data).to.deep.equal([{ ...ROLLOUT, ref: 'uat' }]);
    });

    it('edits and removes own rows, and discards pending changes', async () => {
      mockFetch({ configFor: () => multi('prepare', [ROLLOUT]), sitesFor: () => [{ name: 'alpha' }] });
      await open({ org: 'pr3' });
      buttonIn(q('.config-table tbody tr'), 'Edit').click();
      await el.updateComplete;
      await type('title', 'Rollout 2');
      await click('nx-dialog .nx-form-btn-primary');
      expect(q('.config-table tbody th').textContent).to.include('Rollout 2');

      buttonIn(q('.config-table tbody tr'), 'Remove').click();
      await el.updateComplete;
      expect(has('.config-table tbody tr')).to.equal(false);

      await click('.config-savebar .nx-form-btn-secondary');
      expect(q('.config-table tbody th').textContent).to.include('Rollout');
      expect(has('.config-savebar')).to.equal(false);
    });
  });

  describe('Apps panel', () => {
    it('lists only the site apps, without org inheritance, and saves the apps sheet', async () => {
      const SEARCH = { title: 'Search', path: 'https://da.live/app/o/s/tools/search' };
      const puts = mockFetch({
        configFor: (o, s) => (s ? multi('apps', [SEARCH]) : multi('apps', [{ title: 'Org app', path: '/x' }])),
        sitesFor: () => [{ name: 'alpha' }],
      });
      el.org = 'ap1';
      el.site = 'alpha';
      el._sectionId = 'apps';
      await ready();
      const rows = [...el.shadowRoot.querySelectorAll('.config-table tbody tr')];
      expect(rows).to.have.length(1);
      expect(rows[0].textContent).to.include('Search');
      expect(el.shadowRoot.textContent).to.not.include('inherited');

      [...rows[0].querySelectorAll('button')].find((b) => b.textContent.trim() === 'Edit').click();
      await el.updateComplete;
      expect(q('nx-dialog [id="config-description"]').tagName).to.equal('TEXTAREA');
      q('nx-dialog .nx-form-btn-secondary').click();
      await el.updateComplete;

      [...rows[0].querySelectorAll('button')].find((b) => b.textContent.trim() === 'Remove').click();
      await el.updateComplete;
      q('.config-savebar .nx-form-btn-primary').click();
      await waitUntil(() => !el._busy, el);
      expect(puts[0].body.apps.data).to.deep.equal([]);
    });
  });

  describe('Plugins panel', () => {
    it('edits plugin rows and saves them without touching the library entries', async () => {
      const BLOCKS = { title: 'Blocks', path: 'https://x.com/blocks.json' };
      const TOOL = { title: 'Tool', path: '/tools/tool.html' };
      const puts = mockFetch({ configFor: () => multi('library', [BLOCKS, TOOL]), sitesFor: () => [{ name: 'alpha' }] });
      el.org = 'pl1';
      el._sectionId = 'plugins';
      await ready();
      const rows = [...el.shadowRoot.querySelectorAll('.config-table tbody tr')];
      expect(rows.map((r) => r.querySelector('th').textContent.trim())).to.deep.equal(['Tool']);

      [...rows[0].querySelectorAll('button')].find((b) => b.textContent.trim() === 'Remove').click();
      await el.updateComplete;
      q('.config-savebar .nx-form-btn-primary').click();
      await waitUntil(() => !el._busy, el);
      expect(puts[0].body.library.data).to.deep.equal([BLOCKS]);
    });
  });

  describe('Library panels', () => {
    const libraryConfig = (rows) => multi('library', rows);
    const openSection = async (sectionId, org) => {
      el.org = org;
      el.site = 'alpha';
      el._sectionId = sectionId;
      await ready();
      await waitUntil(() => el._file && el._file.status !== 'loading', el);
    };
    const buttonIn = (row, text) => [...row.querySelectorAll('button')].find((b) => b.textContent.trim() === text);

    it('keeps the newly shown list when an earlier save finishes after navigating away', async () => {
      const BLOCKS = kv([{ name: 'Cards', path: '/library/blocks/cards' }]);
      const TEMPLATES = kv([{ key: 'Article', value: '/library/templates/article' }]);
      let finishSave;
      mockFetch({
        configFor: (o, s) => (s ? libraryConfig([
          { title: 'Blocks', path: '/library/blocks.json' },
          { title: 'Templates', path: '/library/templates.json' },
        ]) : ORG_CONFIG),
        sitesFor: () => [{ name: 'alpha' }],
        sourceFor: (o, s, path) => (path === '/library/blocks.json' ? BLOCKS : TEMPLATES),
        putFor: () => new Promise((resolve) => { finishSave = () => resolve(new Response('', { status: 200 })); }),
      });
      await openSection('blocks', 'lb9');
      buttonIn(q('.config-table tbody tr'), 'Remove').click();
      await el.updateComplete;
      q('.config-savebar .nx-form-btn-primary').click();
      await waitUntil(() => !!finishSave, el);

      // Navigate while the Blocks save is still in flight, and start editing Templates.
      el._sectionId = 'templates';
      el._clearEdits();
      await waitUntil(() => el._file?.path === '/library/templates.json' && el._file.status === 'ok', el);
      el._rows = [];
      finishSave();
      await waitUntil(() => !el._busy, el);

      expect([el._file.path, el._file.json]).to.deep.equal(['/library/templates.json', TEMPLATES]);
      expect(el._rows).to.deep.equal([]);
    });

    it('sets up an unregistered library and then lists its items', async () => {
      let registered = false;
      const puts = mockFetch({
        configFor: (o, s) => (s && registered ? libraryConfig([{ title: 'Templates', path: '/docs/library/templates.json' }]) : ORG_CONFIG),
        sitesFor: () => [{ name: 'alpha' }],
        sourceFor: () => (puts.length ? kv([]) : status(404)()),
        putFor: () => {
          if (puts.length === 2) registered = true;
          return new Response('', { status: 200 });
        },
      });
      await openSection('templates', 'lb1');
      expect(has('.config-setup')).to.equal(true);
      q('.config-setup .nx-form-btn-primary').click();
      await waitUntil(() => el._file?.status === 'ok', el);
      expect(puts.map((p) => p.path ?? 'config')).to.deep.equal(['/docs/library/templates.json', 'config']);
      expect(el.shadowRoot.textContent).to.include('No templates yet');
      expect(el.shadowRoot.textContent).to.include('previewed and published');
    });

    it('edits the first sheet of the file and keeps the other sheets', async () => {
      const CARDS = { name: 'Cards', path: 'https://content.da.live/lb2/alpha/library/blocks/cards' };
      const file = { blocks: { data: [CARDS] }, options: { data: [{ key: 'x' }] }, ':names': ['blocks', 'options'], ':type': 'multi-sheet' };
      const puts = mockFetch({
        configFor: (o, s) => (s ? libraryConfig([{ title: 'Blocks', path: 'https://content.da.live/lb2/alpha/library/blocks.json' }]) : ORG_CONFIG),
        sitesFor: () => [{ name: 'alpha' }],
        sourceFor: () => file,
      });
      await openSection('blocks', 'lb2');
      expect(el.shadowRoot.textContent).to.not.include('previewed and published');
      const row = q('.config-table tbody tr');
      expect(row.textContent).to.include('Cards');
      buttonIn(row, 'Remove').click();
      await el.updateComplete;
      q('.config-savebar .nx-form-btn-primary').click();
      await waitUntil(() => !el._busy, el);
      expect(puts[0].path).to.equal('/library/blocks.json');
      expect(puts[0].body.blocks.data).to.deep.equal([]);
      expect(puts[0].body.options.data).to.deep.equal([{ key: 'x' }]);
    });

    it('imports blocks from pages through the dialog and reloads the list', async () => {
      const PAGE = '<body><main><div><div class="hero"><div><div><h1>Hi</h1></div></div></div></div></main></body>';
      let saved = null;
      const puts = mockFetch({
        configFor: (o, s) => (s ? libraryConfig([{ title: 'Blocks', path: '/library/blocks.json' }]) : ORG_CONFIG),
        sitesFor: () => [{ name: 'alpha' }],
        sourceFor: (o, s, path) => {
          if (path === '/index.html') return new Response(PAGE);
          return saved ?? kv([]);
        },
        putFor: () => {
          const last = puts.at(-1);
          if (last.path === '/library/blocks.json') saved = last.body;
          return new Response('', { status: 200 });
        },
      });
      await openSection('blocks', 'lb5');
      buttonIn(q('.config-row-buttons'), 'Import blocks').click();
      await waitUntil(() => has('da-config-blocks-import'), el);
      const dialog = q('da-config-blocks-import');
      const inDialog = (sel) => dialog.querySelector(sel);
      const action = (text) => [...dialog.querySelectorAll('[slot="actions"]')].find((b) => b.textContent.trim().startsWith(text));

      inDialog('nx-segmented-btn').dispatchEvent(new CustomEvent('change', { detail: { value: 'pages' } }));
      await dialog.updateComplete;
      const pages = inDialog('textarea');
      pages.value = '/index';
      pages.dispatchEvent(new Event('input'));
      action('Find blocks').click();
      await waitUntil(() => dialog._step === 'select', dialog);
      expect([...dialog.querySelectorAll('.config-import-list li')].map((li) => li.textContent.trim())).to.deep.equal(['hero']);

      action('Import 1').click();
      await waitUntil(() => dialog._step === 'done', dialog);
      expect(puts.map((p) => p.path)).to.deep.equal(['/library/blocks/hero.html', '/library/blocks.json']);
      expect(puts[0].body).to.include('<h1>Hi</h1>');

      action('Done').click();
      await waitUntil(() => el._file?.status === 'ok' && !has('da-config-blocks-import'), el);
      expect(q('.config-table tbody tr').textContent).to.include('Hero');
    });

    it('disables the import while the list has unsaved changes', async () => {
      mockFetch({
        configFor: (o, s) => (s ? libraryConfig([{ title: 'Blocks', path: '/library/blocks.json' }]) : ORG_CONFIG),
        sitesFor: () => [{ name: 'alpha' }],
        sourceFor: () => kv([{ name: 'Hero', path: '/library/blocks/hero' }]),
      });
      await openSection('blocks', 'lb6');
      expect(buttonIn(q('.config-row-buttons'), 'Import blocks').disabled).to.equal(false);
      buttonIn(q('.config-table tbody tr'), 'Remove').click();
      await el.updateComplete;
      expect(buttonIn(q('.config-row-buttons'), 'Import blocks').disabled).to.equal(true);
    });

    it('offers setup when only the org registers the library', async () => {
      mockFetch({
        configFor: (o, s) => (s ? ORG_CONFIG : libraryConfig([{ title: 'Blocks', path: '/docs/library/blocks.json' }])),
        sitesFor: () => [{ name: 'alpha' }],
      });
      await openSection('blocks', 'lb7');
      expect(has('.config-setup')).to.equal(true);
    });

    it('says when the registered file was not found', async () => {
      mockFetch({
        configFor: (o, s) => (s ? libraryConfig([{ title: 'Blocks', path: '/docs/library/blocks.json' }]) : ORG_CONFIG),
        sitesFor: () => [{ name: 'alpha' }],
      });
      await openSection('blocks', 'lb4');
      expect(el.shadowRoot.textContent).to.include("doesn't exist yet");
      expect(has('.config-info a[href^="/sheet"]')).to.equal(false);
    });

    it('explains sources that are not files of this site', async () => {
      mockFetch({
        configFor: (o, s) => (s ? libraryConfig([{ title: 'Icons', path: 'https://example.com/icons.json' }]) : ORG_CONFIG),
        sitesFor: () => [{ name: 'alpha' }],
      });
      await openSection('icons', 'lb3');
      expect(el.shadowRoot.textContent).to.include("isn't a file of this site");
      expect(has('.config-table')).to.equal(false);
    });
  });

  describe('Multi-Site Manager panel', () => {
    it('adds base and satellite rows at org scope and saves the msm sheet', async () => {
      const puts = mockFetch({ configFor: () => ORG_CONFIG, sitesFor: () => [{ name: 'alpha' }] });
      el.org = 'ms1';
      el._sectionId = 'msm';
      await ready();
      const dialogInput = (key) => q(`nx-dialog [id="config-${key}"]`);
      const type = async (key, value) => {
        dialogInput(key).value = value;
        dialogInput(key).dispatchEvent(new Event('input'));
        await el.updateComplete;
      };
      const add = async (fields) => {
        q('.config-row-buttons .nx-form-btn-secondary').click();
        await el.updateComplete;
        await Object.entries(fields)
          .reduce((done, [key, value]) => done.then(() => type(key, value)), Promise.resolve());
        q('nx-dialog .nx-form-btn-primary').click();
        await el.updateComplete;
      };

      await add({ base: 'my-base', title: 'Base Site' });
      await add({ base: 'my-base', satellite: 'satellite-1' });
      await add({ base: 'other', satellite: 'satellite-1' });
      expect(q('nx-dialog .nx-input-error-msg').textContent).to.include('already a satellite');
      q('nx-dialog .nx-form-btn-secondary').click();
      await el.updateComplete;

      const cells = [...el.shadowRoot.querySelectorAll('.config-table tbody tr')]
        .map((tr) => [...tr.querySelectorAll('th, td:not(.config-table-actions)')].map((c) => c.textContent.trim()));
      expect(cells).to.deep.equal([['my-base', '', 'Base Site'], ['my-base', 'satellite-1', '']]);
      const headers = [...el.shadowRoot.querySelectorAll('.config-table thead th')].map((t) => t.textContent.trim());
      expect(headers).to.deep.equal(['Base site', 'Satellite site', 'Title', 'Row actions']);
      q('.config-savebar .nx-form-btn-primary').click();
      await waitUntil(() => !el._busy, el);
      expect(puts[0].site).to.equal(null);
      expect(puts[0].body.msm.data).to.deep.equal([
        { base: 'my-base', title: 'Base Site' },
        { base: 'my-base', satellite: 'satellite-1' },
      ]);
    });
  });

  describe('Translation panel', () => {
    const TRANSLATE = {
      config: { data: [{ key: 'translation.service.name', value: 'Smartling' }, { key: 'translation.service.prod.origin', value: 'https://translate.da.live/smartling' }] },
      languages: { data: [{ name: 'English', code: 'en', location: '/en' }] },
      ':names': ['config', 'languages'],
      ':version': 3,
      ':type': 'multi-sheet',
    };
    const open = async (org, sourceFor) => {
      const puts = mockFetch({ sitesFor: () => [{ name: 'alpha' }], sourceFor });
      el.org = org;
      el.site = 'alpha';
      el._sectionId = 'translation';
      await ready();
      await waitUntil(() => el._file && el._file.status !== 'loading', el);
      return puts;
    };
    const showPart = async (value) => {
      q('.config-parts nx-picker').dispatchEvent(new CustomEvent('change', { detail: { value } }));
      await el.updateComplete;
    };

    it('reads the site translate sheet and saves settings into its config tab', async () => {
      const puts = await open('tr1', (o, s, path) => (path === '/.da/translate.json' ? TRANSLATE : status(404)()));
      const links = [...q('.config-info').querySelectorAll('a.nx-action-btn')].map((a) => [a.textContent.trim(), a.getAttribute('href')]);
      expect(links[0]).to.deep.equal(['Open sheet', '/sheet#/tr1/alpha/.da/translate']);
      expect(q('[id="config-translation.service.name"]').value).to.equal('Smartling');
      el._onEdit('source.language', 'English');
      await el.updateComplete;
      q('.config-savebar .nx-form-btn-primary').click();
      await waitUntil(() => !el._busy, el);
      expect(puts[0].path).to.equal('/.da/translate.json');
      expect(puts[0].body.config.data.map((r) => r.key)).to.deep.equal([
        'translation.service.name', 'translation.service.prod.origin', 'source.language',
      ]);
      expect(puts[0].body.languages.data).to.deep.equal(TRANSLATE.languages.data);
    });

    it('switches parts and lists each tab', async () => {
      await open('tr2', () => TRANSLATE);
      await showPart('options');
      expect(q('.config-table tbody tr').textContent).to.include('translation.service.prod.origin');
      expect(el.shadowRoot.querySelectorAll('.config-table tbody tr').length).to.equal(1);
      await showPart('languages');
      expect(q('.config-table tbody tr').textContent).to.include('English');
      await showPart('dnt');
      expect(el.shadowRoot.textContent).to.include('No exclusions yet');
      expect(q('.config-parts nx-picker').items.every((item) => item.label)).to.equal(true);
    });

    it('starts empty when the sheet does not exist and creates it on save', async () => {
      const puts = await open('tr3', () => status(404)());
      expect(el.shadowRoot.textContent).to.include("doesn't exist yet");
      await showPart('dnt-content-rules');
      el._rows = [{ content: 'Acme' }];
      await el.updateComplete;
      q('.config-savebar .nx-form-btn-primary').click();
      await waitUntil(() => !el._busy, el);
      expect(puts[0].body['dnt-content-rules'].data).to.deep.equal([{ content: 'Acme' }]);
      expect(el._file.missing).to.equal(false);
    });

    it('asks before leaving a part with unsaved changes', async () => {
      await open('tr4', () => TRANSLATE);
      el._onEdit('source.language', 'English');
      await el.updateComplete;
      await showPart('languages');
      expect(el._ctx.part.id).to.equal('settings');
      expect(!!el._confirm).to.equal(true);
    });
  });
});
