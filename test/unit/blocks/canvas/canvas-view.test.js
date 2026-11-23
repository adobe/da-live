import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx, getNx, getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';
import { DA_ORIGIN } from '../../../../blocks/shared/constants.js';

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
      const subscribe = sinon.spy(hashChange, 'subscribe');
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
        // The last subscription is this canvas's route callback; keep shared chat active.
        subscribe.lastCall?.returnValue();
        subscribe.restore();
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
      const realFetch = window.fetch.bind(window);
      const fetch = sinon.stub(window, 'fetch').callsFake((target, options) => {
        const url = String(target);
        const method = options?.method ?? 'GET';
        if (url === 'https://admin.hlx.page/ping/org/site' && method === 'GET') {
          return Promise.resolve(new Response(''));
        }
        if (url === `${DA_ORIGIN}/branches/org/site/capabilities` && method === 'GET') {
          return Promise.resolve(new Response(JSON.stringify({ supported: false })));
        }
        if (/^https:\/\/admin\.da\.live\/source\/org\/site\/docs\/(other|page)\.html$/.test(url)
          && method === 'HEAD') {
          return Promise.resolve(new Response(null, { status: 403 }));
        }
        return realFetch(target, options);
      });
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
        // The default IMS fixture is signed out: Recent is updated synchronously,
        // but the content store must not be queried before sign-in.
        expect(block.querySelector('.nx-not-permitted').textContent).to.include('Sign in required');
        expect(fetch.getCalls().some(({ args }) => args[1]?.method === 'HEAD')).to.equal(false);
      } finally {
        observer.disconnect();
        subscribe.returnValues.forEach((unsubscribe) => unsubscribe());
        hashChange._set({});
        sinon.restore();
        wrapper.remove();
      }
    });
  });

  describe('canvas direct entry on imported content', () => {
    const IMPORTED_CAPS = {
      apiVersion: 1,
      transport: 'helix6',
      contentProfile: 'aem-import',
      readOnly: true,
      openKinds: ['image', 'sheet'],
      collaboration: false,
      branching: false,
      generation: 'g-test',
    };

    [
      ['an imported site', () => Response.json(IMPORTED_CAPS), 'wknd'],
      ['an imported branch URL', () => Response.json(IMPORTED_CAPS), 'wknd~draft'],
      ['failed capability discovery', () => new Response('', { status: 500 }), 'wknd'],
    ].forEach(([label, capsResponse, site]) => {
      it(`blocks ${label} before Recent, document session, create or editors`, async () => {
        const { invalidateDaRsDiscovery } = await import('../../../../blocks/shared/da-rs-provider.js');
        const { source } = await getNx2Api();
        const savedHref = window.location.href;
        const wrapper = document.createElement('div');
        const block = document.createElement('div');
        wrapper.append(block);
        document.body.append(wrapper);
        window.history.replaceState(null, '', `/canvas?da-source=da-rs#/demo/${site}/docs/page`);
        invalidateDaRsDiscovery();
        sinon.stub(configApi, 'get').resolves({ ok: true, permissions: [], json: async () => ({}) });
        const realFetch = window.fetch.bind(window);
        const fetch = sinon.stub(window, 'fetch').callsFake(async (target, options) => {
          const url = String(target);
          if (!options?.method || options.method === 'GET') {
            if (url === `${DA_ORIGIN}/ping/demo/wknd`) {
              return new Response('', { headers: { 'x-api-upgrade-available': 'true' } });
            }
            if (url === `${DA_ORIGIN}/demo/sites/wknd/source-capabilities`) return capsResponse();
            // Canvas shell org config is read-only and not a document or branch request.
            if (url === `${DA_ORIGIN}/config/demo/`) return Response.json({});
          }
          return realFetch(target, options);
        });
        const get = sinon.stub(source, 'get').resolves({ status: 200, ok: true, permissions: ['write'] });
        const save = sinon.stub(source, 'save').resolves({ ok: true });
        const setItem = sinon.stub(Storage.prototype, 'setItem');
        const recents = [];
        setItem.callsFake(function record(key, value) {
          if (key === 'da-recent-files') recents.push(value);
          else setItem.wrappedMethod.call(this, key, value);
        });
        const subscribe = sinon.spy(hashChange, 'subscribe');
        let observer;
        const denied = new Promise((resolve) => {
          observer = new MutationObserver(() => {
            if (block.querySelector('.nx-not-permitted')) resolve();
          });
          observer.observe(block, { childList: true, subtree: true });
        });
        try {
          await decorate(block);
          hashChange._set({ org: 'demo', site, path: 'docs/page' });
          await denied;
          const requests = fetch.getCalls().map(({ args }) => String(args[0]));
          expect(requests).to.include(`${DA_ORIGIN}/demo/sites/wknd/source-capabilities`);
          expect(requests.some((url) => /\/source\/|\/branching\/|admin\.hlx\.page/.test(url))).to.equal(false);
          expect(wrapper.querySelector('da-branch-selector').site).to.equal(undefined);
          expect(block.querySelector('ew-editor-doc')).to.equal(null);
          expect(get.called).to.equal(false);
          expect(save.called).to.equal(false);
          expect(recents).to.deep.equal([]);
        } finally {
          observer.disconnect();
          subscribe.returnValues.forEach((unsubscribe) => unsubscribe());
          hashChange._set({});
          sinon.restore();
          window.history.replaceState(null, '', savedHref);
          invalidateDaRsDiscovery();
          wrapper.remove();
        }
      });
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
