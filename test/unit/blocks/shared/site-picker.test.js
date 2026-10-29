import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../setup-nx.js';
import { getNx2Api } from '../../../../scripts/utils.js';
import { connectSiteSelector } from '../../../../blocks/shared/site-picker.js';
import { getSiteOptions } from '../../../../blocks/shared/site-picker-utils.js';
import { addExistingSite } from '../../../../blocks/shared/site-access.js';

const { source, config } = await getNx2Api();
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('shared site selector adapter', () => {
  let selector;
  let connection;
  let adapter;
  let list;
  let href;
  let recentSites;

  beforeEach(async () => {
    href = window.location.href;
    recentSites = localStorage.getItem('da-sites');
    window.history.replaceState(null, '', '#/aemsites/devlive/folder');
    localStorage.setItem('da-sites', '["aemsites/devlive","exp-workspace/frescopaco"]');
    list = sinon.stub(source, 'list').resolves({ ok: true, items: [] });
    sinon.stub(config, 'get').resolves(new Response('{}', { headers: { 'x-da-actions': '/=read' } }));
    selector = document.createElement('div');
    document.body.append(selector);
    connection = new AbortController();
    adapter = connectSiteSelector({ selector, signal: connection.signal });
    await adapter.ready;
  });

  afterEach(() => {
    connection.abort();
    selector.remove();
    window.history.replaceState(null, '', href);
    if (recentSites === null) localStorage.removeItem('da-sites');
    else localStorage.setItem('da-sites', recentSites);
    sinon.restore();
  });

  it('deduplicates valid identifiers and includes current site outside history', () => {
    expect(getSiteOptions({
      current: 'adobe/current',
      recentSites: ['adobe/other', 'adobe/current', '/bad/path', 'adobe/.trash', null],
    })).to.deep.equal([
      { value: 'adobe/current', label: '(adobe, current)' },
      { value: 'adobe/other', label: '(adobe, other)' },
    ]);
  });

  it('keeps selection independent of folder changes without repeating access checks', async () => {
    expect(selector.value).to.equal('aemsites/devlive');
    list.resetHistory();
    window.history.replaceState(null, '', '#/aemsites/devlive/other');
    await adapter.refresh();
    expect(selector.value).to.equal('aemsites/devlive');
    expect(list.called).to.be.false;
  });

  it('leaves Landing unselected despite remembered sites, selects explicitly and resets on Home', async () => {
    const remembered = localStorage.getItem('da-sites');
    window.history.replaceState(null, '', '?landing=true');
    await adapter.refresh();
    expect(selector.value).to.equal('');
    expect(selector.heading).to.equal('Your recent sites');
    expect(selector.sites).to.have.length(2);
    expect(localStorage.getItem('da-sites')).to.equal(remembered);
    const value = 'exp-workspace/frescopaco';
    selector.dispatchEvent(new CustomEvent('site-select', { detail: { value } }));
    await adapter.refresh();
    expect(selector.value).to.equal(value);
    expect(selector.sites.find((site) => site.value === value).label).to.equal('(exp-workspace, frescopaco)');
    window.history.replaceState(null, '', '?landing=true');
    await adapter.refresh();
    expect(selector.value).to.equal('');
    expect(selector.heading).to.equal('Your recent sites');
    expect(selector.sites.map((site) => site.value)).to.have.members(['aemsites/devlive', value]);
    localStorage.setItem('da-sites', '[]');
    await adapter.refresh();
    expect(selector.value).to.equal('');
    expect(selector.sites).to.deep.equal([]);
  });

  it('remembers denied routed sites before checking access and retains all choices', async () => {
    list.resolves({ ok: false });
    sinon.stub(source, 'getMetadata').resolves(new Response(null, { status: 403 }));
    localStorage.setItem('da-sites', '["exp-workspace/frescopaco"]');
    await adapter.refresh();
    expect(selector.sites.map(({ value }) => value))
      .to.deep.equal(['aemsites/devlive', 'exp-workspace/frescopaco']);
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.include('aemsites/devlive');
    expect(selector.error).to.be.undefined;
  });

  it('keeps Devlive after successfully adding and selecting Frescopaco', async () => {
    list.callsFake(async (path) => ({
      ok: path.startsWith('/exp-workspace'),
      items: path === '/exp-workspace' ? [{ name: 'frescopaco' }] : [],
    }));
    sinon.stub(source, 'getMetadata').resolves(new Response(null, { status: 403 }));
    const value = 'exp-workspace/frescopaco';
    await addExistingSite({ value, source, signal: connection.signal });
    selector.dispatchEvent(new CustomEvent('site-select', { detail: { value } }));
    await adapter.refresh();
    expect(selector.value).to.equal(value);
    expect(selector.sites.map((site) => site.value)).to.deep.equal([value, 'aemsites/devlive']);
    expect(JSON.parse(localStorage.getItem('da-sites'))).to.deep.equal([value, 'aemsites/devlive']);
  });

  it('rejects unknown selection without changing the route', () => {
    const { hash } = window.location;
    selector.dispatchEvent(new CustomEvent('site-select', { detail: { value: 'unknown/site' } }));
    expect(window.location.hash).to.equal(hash);
    expect(selector.error).to.include('no longer available');
  });

  it('refreshes cross-tab history without deleting remembered sites', async () => {
    localStorage.setItem('da-sites', '["other/site"]');
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-sites' }));
    await adapter.refresh();
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['aemsites/devlive', 'other/site']);
  });

  it('reports corrupt history without overwriting it and recovers after repair', async () => {
    for (const invalid of ['[', '{}']) {
      localStorage.setItem('da-sites', invalid);
      await adapter.refresh();
      expect(selector.error).to.include('Could not read recent sites');
      expect(selector.value).to.equal('aemsites/devlive');
      expect(localStorage.getItem('da-sites')).to.equal(invalid);
    }
    localStorage.setItem('da-sites', '[]');
    await adapter.refresh();
    expect(selector.error).to.be.undefined;
  });

  it('reports unavailable storage and failed access verification explicitly', async () => {
    const save = sinon.stub(Storage.prototype, 'setItem').throws(new Error('Storage unavailable'));
    window.history.replaceState(null, '', '#/other/site');
    await adapter.refresh();
    expect(selector.error).to.include('Could not save the current site');
    save.restore();
    list.rejects(new Error('Offline'));
    await adapter.refresh();
    expect(selector.error).to.include('Offline');
  });

  it('opens one lazy Add dialog without navigating and restores trigger focus on cancel', async () => {
    const focus = sinon.spy(selector, 'focus');
    const { hash } = window.location;
    document.dispatchEvent(new CustomEvent('site-add'));
    document.dispatchEvent(new CustomEvent('site-add'));
    await customElements.whenDefined('da-add-site');
    await tick();
    const dialogs = document.querySelectorAll('da-add-site');
    expect(dialogs).to.have.length(1);
    const [dialog] = dialogs;
    await dialog.updateComplete;
    expect(dialog.org).to.equal('aemsites');
    expect(dialog.shadowRoot.querySelector('.site-creation')).to.be.null;
    expect(window.location.hash).to.equal(hash);
    dialog.dispatchEvent(new Event('close'));
    expect(dialog.isConnected).to.be.false;
    expect(focus.calledOnce).to.be.true;
  });

  it('retries an uncertain access failure even when history and route are unchanged', async () => {
    list.rejects(new Error('Offline'));
    localStorage.setItem('da-sites', '["other/site"]');
    await adapter.refresh();
    expect(selector.error).to.include('Offline');
    list.resolves({ ok: true, items: [] });
    selector.dispatchEvent(new CustomEvent('site-retry'));
    await tick();
    expect(selector.error).to.be.undefined;
    expect(selector.sites.map(({ value }) => value)).to.deep.equal(['aemsites/devlive', 'other/site']);
  });

  it('closes Add on route changes and updates the landing heading', async () => {
    document.dispatchEvent(new CustomEvent('site-add'));
    await customElements.whenDefined('da-add-site');
    await tick();
    window.history.replaceState(null, '', '?landing=true#/exp-workspace/frescopaco');
    await adapter.refresh();
    expect(document.querySelector('da-add-site')).to.be.null;
    expect(selector.heading).to.equal('Your recent sites');
  });

  it('aborts pending checks and removes all listeners and dialogs on disconnect', async () => {
    let checking;
    list.callsFake((path, { opts: { signal } }) => {
      checking = signal;
      return new Promise(() => {});
    });
    localStorage.setItem('da-sites', '["new/site"]');
    adapter.refresh();
    await tick();
    connection.abort();
    expect(checking.aborted).to.be.true;
    list.resetHistory();
    document.dispatchEvent(new CustomEvent('site-add'));
    window.dispatchEvent(new StorageEvent('storage', { key: 'da-sites' }));
    window.dispatchEvent(new Event('hashchange'));
    await tick();
    expect(list.called).to.be.false;
    expect(document.querySelector('da-add-site')).to.be.null;
  });

  it('does not connect a detached or already aborted selector', () => {
    selector.remove();
    expect(connectSiteSelector({ selector, signal: connection.signal })).to.be.undefined;
    document.body.append(selector);
    connection.abort();
    expect(connectSiteSelector({ selector, signal: connection.signal })).to.be.undefined;
  });
});
