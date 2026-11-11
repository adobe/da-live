import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx, getNx, getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';
import { setDaConfigs } from '../../../fixtures/nx/utils/daConfig.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { notifyCanvasEditorActive, default: decorate } = await import('../../../../blocks/canvas/canvas.js');
const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { PANEL_EVENT, setPanelMocks } = await import(`${getNx()}/utils/panel.js`);
const { setChatAvailability } = await getNxEWFlags();
const { config: configApi } = await getNx2Api();

describe('canvas editor view visibility', () => {
  let doc;
  let wysiwyg;

  beforeEach(async () => {
    doc = document.createElement('ew-editor-doc');
    wysiwyg = document.createElement('ew-editor-wysiwyg');
    document.body.append(doc, wysiwyg);
    await Promise.all([doc.updateComplete, wysiwyg.updateComplete]);
  });

  describe('canvas chat availability', () => {
    it('only registers and restores available chat, and closes it when the org disables it', async () => {
      const registrations = [];
      const listeners = [];
      const wrapper = document.createElement('div');
      const block = document.createElement('div');
      wrapper.append(block);
      setPanelMocks({
        wasOpen: () => true,
        register: (section) => registrations.push(section),
      });
      setChatAvailability(async ({ org }) => org === 'allowed');
      hashChange._set({ org: 'disabled' });
      const waitForChat = (type) => new Promise((resolve) => {
        const listener = (event) => {
          if (event.detail?.section !== 'chat') return;
          document.removeEventListener(type, listener);
          resolve(event);
        };
        listeners.push({ type, listener });
        document.addEventListener(type, listener);
      });
      try {
        const initiallyClosed = waitForChat(PANEL_EVENT.CLOSE);
        await decorate(block);
        await initiallyClosed;
        expect(registrations).not.to.include('chat');

        const restored = waitForChat(PANEL_EVENT.OPEN);
        hashChange._set({ org: 'allowed' });
        await restored;
        expect(registrations.filter((section) => section === 'chat')).to.have.length(1);

        const closed = waitForChat(PANEL_EVENT.CLOSE);
        hashChange._set({ org: 'disabled' });
        await closed;
        expect(registrations.filter((section) => section === 'chat')).to.have.length(1);
      } finally {
        listeners.forEach(({ type, listener }) => document.removeEventListener(type, listener));
        setPanelMocks();
        setChatAvailability(async () => false);
        hashChange._set({});
      }
    });
  });

  describe('canvas Recent files', () => {
    it('records opened documents in Recent', async () => {
      const wrapper = document.createElement('div');
      const block = document.createElement('div');
      wrapper.append(block);
      document.body.append(wrapper);
      const configsLoaded = new Promise((resolve) => {
        const requested = new Set();
        sinon.stub(configApi, 'get').callsFake(async ({ org, site }) => {
          requested.add(`${org}/${site ?? ''}`);
          if (requested.has('org/') && requested.has('org/site')) resolve();
          return { ok: true, permissions: [], json: async () => ({}) };
        });
      });
      // Capture writes without sharing Recent data with concurrently running test pages.
      const setItem = sinon.stub(Storage.prototype, 'setItem');
      const writes = [];
      setItem.callsFake(function record(key, value) {
        if (key === 'da-recent-files') writes.push(JSON.parse(value)['/org/site'][0]);
        else setItem.wrappedMethod.call(this, key, value);
      });
      const subscribe = sinon.spy(hashChange, 'subscribe');
      let observer;
      const notPermitted = new Promise((resolve) => {
        observer = new MutationObserver(() => {
          if (block.querySelector('.nx-not-permitted')) resolve();
        });
        observer.observe(block, { childList: true, subtree: true });
      });
      try {
        await decorate(block);
        hashChange._set({ org: 'org', site: 'site', path: 'docs/other.html' });
        hashChange._set({ org: 'org', site: 'site', path: 'docs/page' });
        expect(writes).to.include.members(['/org/site/docs/other.html', '/org/site/docs/page.html']);
        await Promise.all([notPermitted, configsLoaded]);
      } finally {
        observer.disconnect();
        subscribe.returnValues.forEach((unsubscribe) => unsubscribe());
        hashChange._set({});
        sinon.restore();
        wrapper.remove();
      }
    });
  });

  afterEach(() => {
    doc.remove();
    wysiwyg.remove();
  });

  it('shows only the chosen editors for Layout, Content and Split', () => {
    notifyCanvasEditorActive('layout');
    expect(doc.hidden).to.be.true;
    expect(wysiwyg.hidden).to.be.false;

    notifyCanvasEditorActive('content');
    expect(doc.hidden).to.be.false;
    expect(wysiwyg.hidden).to.be.true;

    notifyCanvasEditorActive('split');
    expect(doc.hidden).to.be.false;
    expect(wysiwyg.hidden).to.be.false;
  });
});

describe('canvas tool panel view refresh', () => {
  const assetId = 'aem-assets-panel';
  const config = { data: [{ key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' }] };
  let onShow;
  let toolPanel;
  let aside;
  let opened;
  let originalUrl;

  function setSite(site) {
    window.history.replaceState(null, '', `#/org/${site}`);
  }

  function holdConfig() {
    let resolve;
    let started;
    const pending = new Promise((res) => { resolve = res; });
    const loading = new Promise((res) => { started = res; });
    setDaConfigs([{
      then(onResolve, onReject) {
        started();
        pending.then(onResolve, onReject);
      },
    }]);
    return { loading, resolve: () => resolve(config) };
  }

  before(async () => {
    const wrapper = document.createElement('div');
    const block = document.createElement('div');
    wrapper.append(block);
    hashChange._set({});
    setPanelMocks({
      register: (section, registration) => {
        if (section === 'tools') onShow = registration.onShow;
      },
    });
    try {
      await decorate(block);
    } finally {
      setPanelMocks();
    }
  });

  beforeEach(() => {
    originalUrl = window.location.href;
    opened = [];
    toolPanel = {
      dataset: { extKey: 'org/previous' },
      contextKey: 'org/previous',
      org: 'org',
      site: 'previous',
      views: [{ id: assetId }],
      updateComplete: Promise.resolve(),
      async showPanel(id, options) {
        opened.push({ id, options, org: this.org, site: this.site });
      },
    };
    aside = { querySelector: () => toolPanel };
  });

  afterEach(() => {
    setDaConfigs([]);
    window.history.replaceState(null, '', originalUrl);
  });

  it('waits for the in-flight site refresh before opening the asset modal', async () => {
    setSite('current');
    const held = holdConfig();
    const refreshing = onShow(aside);
    await held.loading;
    const opening = onShow(aside, assetId, { modal: true });
    await new Promise((resolve) => { setTimeout(resolve); });
    expect(opened).to.deep.equal([]);

    held.resolve();
    await Promise.all([refreshing, opening]);
    expect(opened).to.deep.equal([
      { id: assetId, options: { modal: true }, org: 'org', site: 'current' },
    ]);
    expect(toolPanel.views.map((view) => view.id)).to.include(assetId);
  });

  it('discards a pending modal request if another site supersedes its refresh', async () => {
    setSite('first');
    const held = holdConfig();
    const opening = onShow(aside, assetId, { modal: true });
    await held.loading;

    setSite('second');
    setDaConfigs([config]);
    await onShow(aside);
    const currentViews = toolPanel.views;
    held.resolve();
    await opening;

    expect(opened).to.deep.equal([]);
    expect(toolPanel.site).to.equal('second');
    expect(toolPanel.views).to.equal(currentViews);
    await onShow(aside, assetId, { modal: true });
    expect(opened[0].site).to.equal('second');
  });

  it('does not reuse a superseded refresh when navigating back to the same site', async () => {
    setSite('first');
    const held = holdConfig();
    const opening = onShow(aside, assetId, { modal: true });
    await held.loading;

    setSite('second');
    setDaConfigs([config]);
    await onShow(aside);
    setSite('first');
    await onShow(aside);
    const currentViews = toolPanel.views;
    held.resolve();
    await opening;

    expect(opened).to.deep.equal([]);
    expect(toolPanel.site).to.equal('first');
    expect(toolPanel.views).to.equal(currentViews);
  });
});
