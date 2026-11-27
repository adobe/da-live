import { expect } from '@esm-bundle/chai';

const { setNx, getNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: init, handleRoute } = await import('../../../../blocks/config/config.js');
const { hashChange } = await import(`${getNx()}/utils/utils.js`);

describe('config handleRoute', () => {
  let el;
  let savedFetch;

  beforeEach(() => {
    el = document.createElement('div');
    savedFetch = window.fetch;
    window.fetch = async () => new Response('', { status: 404 });
  });

  afterEach(() => {
    window.fetch = savedFetch;
  });

  it('mounts da-config with org and site', async () => {
    const cmp = await handleRoute(el, { org: 'o', site: 's' });
    expect(el.querySelector('da-config')).to.equal(cmp);
    expect(cmp.org).to.equal('o');
    expect(cmp.site).to.equal('s');
  });

  it('reuses the mounted element on later routes', async () => {
    const first = await handleRoute(el, { org: 'o', site: 's' });
    const second = await handleRoute(el, { org: 'o', site: null });
    expect(second).to.equal(first);
    expect(el.querySelectorAll('da-config')).to.have.length(1);
    expect(second.site).to.equal(null);
  });

  it('mounts with nulls when there is no route', async () => {
    const cmp = await handleRoute(el, null);
    expect(cmp.org).to.equal(null);
    expect(cmp.site).to.equal(null);
  });
});

describe('config init', () => {
  let savedFetch;
  beforeEach(() => {
    savedFetch = window.fetch;
    window.fetch = async () => new Response('', { status: 404 });
  });
  afterEach(() => { window.fetch = savedFetch; });

  it('clears the block and follows the hash', async () => {
    const el = document.createElement('div');
    el.append(document.createElement('p'));
    init(el);
    hashChange._set({ org: 'h1', site: 'x' });
    // Polls every 10ms for up to 500ms.
    for (let i = 0; i < 50 && !el.querySelector('da-config')?.org; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    const cmp = el.querySelector('da-config');
    expect([el.querySelector('p'), cmp?.org, cmp?.site]).to.deep.equal([null, 'h1', 'x']);
  });
});

describe('config browser history', () => {
  let el;
  let cmp;
  let savedFetch;
  let savedUrl;
  let savedState;
  let routed;

  const route = () => {
    const [org, site] = window.location.hash.slice(2).split('/');
    routed = handleRoute(el, { org, site: site || null });
  };
  const ready = async () => {
    await routed;
    await cmp.updateComplete;
    for (let i = 0; i < 50 && cmp._status !== 'ok'; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    await cmp.updateComplete;
    expect(cmp._status).to.equal('ok');
  };
  const traverse = async (action) => {
    const changed = new Promise((resolve) => {
      window.addEventListener('popstate', resolve, { once: true });
    });
    action();
    await changed;
    // Let a following hashchange finish too, when only the fragment differs.
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await ready();
  };
  const open = async (tab, nextScope) => {
    window.history.replaceState(null, '', `?tab=${tab}#/history1`);
    route();
    cmp = await routed;
    await ready();
    window.history.pushState({ existing: 'retained' }, '', `?tab=${tab}#/${nextScope}`);
    route();
    await ready();
  };

  beforeEach(() => {
    savedFetch = window.fetch;
    savedUrl = window.location.href;
    savedState = window.history.state;
    window.fetch = async () => new Response('', { status: 404 });
    el = document.createElement('div');
    document.body.append(el);
    window.addEventListener('hashchange', route);
  });

  afterEach(() => {
    window.removeEventListener('hashchange', route);
    el.remove();
    window.fetch = savedFetch;
    window.history.replaceState(savedState, '', savedUrl);
  });

  it('keeps a row draft on Back cancellation and discards it only after confirmation', async () => {
    await open('plugins', 'history1/alpha');
    const tabs = cmp.shadowRoot.querySelector('.config-tabs-secondary');
    tabs.dispatchEvent(new CustomEvent('change', { detail: { value: 'prepare' } }));
    await cmp.updateComplete;
    expect(window.history.state.existing).to.equal('retained');
    tabs.dispatchEvent(new CustomEvent('change', { detail: { value: 'plugins' } }));
    await cmp.updateComplete;
    cmp._onRowAdd({ title: 'Unsaved tool', path: '/tools/unsaved' });
    cmp._onDraftApply();
    await cmp.updateComplete;

    await traverse(() => window.history.back());
    expect([cmp.org, cmp.site, !!cmp._confirm]).to.deep.equal(['history1', 'alpha', true]);
    expect(cmp._edit.list.rows.map((row) => row.title)).to.deep.equal(['Unsaved tool']);
    await traverse(() => cmp._resolveConfirm(false));
    expect(window.location.hash).to.equal('#/history1/alpha');
    expect(cmp._edit.dirty).to.equal(true);

    await traverse(() => window.history.back());
    await traverse(() => window.history.forward());
    expect([!!cmp._confirm, cmp._edit.dirty]).to.deep.equal([false, true]);

    // Repeating Back must still reach the original org entry, not a replaced site entry.
    await traverse(() => window.history.back());
    expect(!!cmp._confirm).to.equal(true);
    cmp._resolveConfirm(true);
    await ready();
    expect([cmp.org, cmp.site, cmp._edit.dirty]).to.deep.equal(['history1', null, false]);
    await traverse(() => window.history.forward());
    expect([cmp.org, cmp.site, cmp._edit.dirty]).to.deep.equal(['history1', 'alpha', false]);
    expect(window.history.state.existing).to.equal('retained');
  });

  it('guards Forward to another org and retains settings when navigation is cancelled', async () => {
    await open('plugins', 'history2/beta');
    cmp._sectionId = 'aem-assets';
    await cmp.updateComplete;
    await traverse(() => window.history.back());
    expect([cmp.org, cmp.site]).to.deep.equal(['history1', null]);
    cmp._onEdit('aem.repositoryId', 'author-p1-e2.adobeaemcloud.com');
    await cmp.updateComplete;
    await handleRoute(el, { org: 'history1', site: null });
    await cmp.updateComplete;
    expect([!!cmp._confirm, cmp._edit.dirty]).to.deep.equal([false, true]);

    await traverse(() => window.history.forward());
    expect([cmp.org, cmp.site, !!cmp._confirm]).to.deep.equal(['history1', null, true]);
    await traverse(() => cmp._resolveConfirm(false));
    expect(window.location.hash).to.equal('#/history1');
    expect(cmp._edit.dirty).to.equal(true);
    expect(cmp.shadowRoot.querySelector('[id="config-aem.repositoryId"]').value)
      .to.equal('author-p1-e2.adobeaemcloud.com');

    await traverse(() => window.history.forward());
    cmp._resolveConfirm(true);
    await ready();
    expect([cmp.org, cmp.site, cmp._edit.dirty]).to.deep.equal(['history2', 'beta', false]);
  });
});
