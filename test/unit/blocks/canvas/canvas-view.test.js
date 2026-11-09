import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx, getNx, getNx2Api, getNxEWFlags } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { notifyCanvasEditorActive, default: decorate } = await import('../../../../blocks/canvas/canvas.js');
const { hashChange } = await import(`${getNx()}/utils/utils.js`);
const { PANEL_EVENT, setPanelMocks } = await import(`${getNx()}/utils/panel.js`);
const { setChatAvailability } = await getNxEWFlags();
const { config } = await getNx2Api();

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

  describe('canvas Recent files', () => {
    it('records the opened document in Recent with a single .html extension', async () => {
      const wrapper = document.createElement('div');
      const block = document.createElement('div');
      wrapper.append(block);
      document.body.append(wrapper);
      // Site configs resolve locally; each org and site config is requested once, then cached.
      const configsLoaded = new Promise((resolve) => {
        const requested = new Set();
        sinon.stub(config, 'get').callsFake(async ({ org, site }) => {
          requested.add(`${org}/${site ?? ''}`);
          if (requested.has('org/') && requested.has('org/site')) resolve();
          return { ok: true, permissions: [], json: async () => ({}) };
        });
      });
      // Capture the real Recent write without sharing it with concurrently running test pages.
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
        expect(writes.every((path) => !path.endsWith('.html.html'))).to.equal(true);
        // The signed-out session and tool panel configs settle before the stubs are restored.
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
});
