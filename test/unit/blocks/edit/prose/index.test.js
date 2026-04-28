/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { Y } from 'da-y-wrapper';
import {
  createConnection,
  createAwarenessStatusWidget,
} from '../../../../../blocks/edit/prose/index.js';
import initProse from '../../../../../blocks/edit/prose/index.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function buildFakeWsProvider({ withSynced = false } = {}) {
  const listeners = new Map();
  const winListeners = [];
  const awarenessListeners = new Map();
  const states = new Map();
  let clientID = 42;

  const provider = {
    synced: withSynced,
    awareness: {
      clientID,
      setLocalStateField(field, value) {
        const cur = states.get(clientID) || {};
        states.set(clientID, { ...cur, [field]: value });
      },
      getStates() { return states; },
      on(event, cb) {
        if (!awarenessListeners.has(event)) awarenessListeners.set(event, []);
        awarenessListeners.get(event).push(cb);
      },
      off() {},
      // helper for tests:
      _emit(event, ...args) {
        (awarenessListeners.get(event) || []).forEach((cb) => cb(...args));
      },
      _setClientID(id) { clientID = id; provider.awareness.clientID = id; },
    },
    on(event, cb) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event).push(cb);
    },
    off(event, cb) {
      const arr = listeners.get(event);
      if (!arr) return;
      const i = arr.indexOf(cb);
      if (i > -1) arr.splice(i, 1);
    },
    _emit(event, ...args) {
      (listeners.get(event) || []).forEach((cb) => cb(...args));
    },
    connect() { provider._connectCalled = (provider._connectCalled || 0) + 1; },
    disconnect() { provider._disconnectCalled = (provider._disconnectCalled || 0) + 1; },
    maxBackoffTime: 0,
    _winListeners: winListeners,
  };
  return provider;
}

describe('prose/index createConnection', () => {
  let savedNxIms;
  beforeEach(() => {
    savedNxIms = window.localStorage.getItem('nx-ims');
    window.localStorage.removeItem('nx-ims');
  });
  afterEach(() => {
    if (savedNxIms) window.localStorage.setItem('nx-ims', savedNxIms);
  });

  it('Returns a wsProvider and a Y.Doc with maxBackoffTime configured', async () => {
    const result = await createConnection('https://admin.da.live/source/org/repo/page.html');
    expect(result.wsProvider).to.exist;
    expect(result.ydoc).to.exist;
    expect(result.wsProvider.maxBackoffTime).to.equal(30000);
    // Clean up the underlying WS connection
    result.wsProvider.disconnect();
    result.wsProvider.destroy?.();
    result.ydoc.destroy();
  });
});

describe('prose/index createAwarenessStatusWidget', () => {
  let fakeTitle;
  let savedQuery;

  beforeEach(() => {
    fakeTitle = { collabUsers: undefined, collabStatus: undefined };
    // Stub document.querySelector('da-title')
    savedQuery = document.querySelector.bind(document);
    document.querySelector = (sel) => {
      if (sel === 'da-title') return fakeTitle;
      return savedQuery(sel);
    };
  });

  afterEach(() => {
    document.querySelector = savedQuery;
  });

  it('Wires the awareness update event onto daTitle.collabUsers', async () => {
    const provider = buildFakeWsProvider();
    const fakeWin = {
      document,
      addEventListener: () => {},
    };
    createAwarenessStatusWidget(provider, fakeWin, 'https://admin.da.live/source/o/r/p.html');
    // Set up a remote user state
    const remoteId = 99;
    provider.awareness.getStates().set(remoteId, { user: { id: 'u1', name: 'Alice' } });
    provider.awareness._emit('update', { added: [remoteId], updated: [], removed: [] });
    expect(fakeTitle.collabUsers).to.deep.equal(['Alice']);
  });

  it('Falls back to "Anonymous" when awareness state has no user id', () => {
    const provider = buildFakeWsProvider();
    const fakeWin = { document, addEventListener: () => {} };
    createAwarenessStatusWidget(provider, fakeWin, 'https://admin.da.live/source/o/r/p.html');
    const remoteId = 7;
    provider.awareness.getStates().set(remoteId, { user: { /* no id */ name: 'X' } });
    provider.awareness._emit('update', { added: [remoteId], updated: [], removed: [] });
    expect(fakeTitle.collabUsers).to.deep.equal(['Anonymous']);
  });

  it('Updates collabStatus on status events', () => {
    const provider = buildFakeWsProvider();
    const fakeWin = { document, addEventListener: () => {} };
    createAwarenessStatusWidget(provider, fakeWin, 'https://admin.da.live/source/o/r/p.html');
    provider._emit('status', { status: 'connected' });
    expect(fakeTitle.collabStatus).to.equal('connected');
    provider._emit('status', { status: 'disconnected' });
    expect(fakeTitle.collabStatus).to.equal('disconnected');
  });

  it('On focus reconnects, on blur schedules disconnect', async () => {
    const provider = buildFakeWsProvider();
    const winListeners = new Map();
    const fakeWin = {
      document,
      addEventListener: (event, cb) => {
        if (!winListeners.has(event)) winListeners.set(event, []);
        winListeners.get(event).push(cb);
      },
    };
    createAwarenessStatusWidget(provider, fakeWin, 'https://admin.da.live/source/o/r/p.html');
    // online/offline both set status
    winListeners.get('online').forEach((cb) => cb());
    expect(fakeTitle.collabStatus).to.equal('online');
    winListeners.get('offline').forEach((cb) => cb());
    expect(fakeTitle.collabStatus).to.equal('offline');
    // focus connects
    winListeners.get('focus').forEach((cb) => cb());
    expect(provider._connectCalled).to.equal(1);
    // blur schedules disconnect (10 minutes); just verify it set a timer (no throw)
    winListeners.get('blur').forEach((cb) => cb());
  });

  it('Removes user from set when delta.removed is sent', () => {
    const provider = buildFakeWsProvider();
    const fakeWin = { document, addEventListener: () => {} };
    createAwarenessStatusWidget(provider, fakeWin, 'https://admin.da.live/source/o/r/p.html');
    const id = 11;
    provider.awareness.getStates().set(id, { user: { id: 'u1', name: 'Alice' } });
    provider.awareness._emit('update', { added: [id], updated: [], removed: [] });
    expect(fakeTitle.collabUsers).to.deep.equal(['Alice']);
    provider.awareness._emit('update', { added: [], updated: [], removed: [id] });
    expect(fakeTitle.collabUsers).to.deep.equal([]);
  });
});

describe('prose/index initProse default export', () => {
  let fakeContent;
  let fakeTitle;
  let savedQuery;

  beforeEach(async () => {
    // Clean up window.view from a previous test
    if (window.view) {
      try { window.view.destroy(); } catch { /* */ }
      delete window.view;
    }
    fakeContent = { proseEl: null, wsProvider: null };
    fakeTitle = { collabUsers: undefined, collabStatus: undefined };
    savedQuery = document.querySelector.bind(document);
    document.querySelector = (sel) => {
      if (sel === 'da-title') return fakeTitle;
      if (sel === 'da-content') return null; // setPreviewBody short-circuits
      return savedQuery(sel);
    };
  });

  afterEach(() => {
    if (window.view) {
      try { window.view.destroy(); } catch { /* */ }
      delete window.view;
    }
    document.querySelector = savedQuery;
  });

  it('Mounts a ProseMirror view, calls handleProseLoaded, and assigns daContent.proseEl/wsProvider', async () => {
    const ydoc = new Y.Doc();
    const provider = buildFakeWsProvider({ withSynced: true });
    const wsPromise = Promise.resolve({ wsProvider: provider, ydoc });

    // Build a host element for handleProseLoaded path
    const host = document.createElement('div');
    Object.defineProperty(host, 'getRootNode', { value: () => ({ host }) });

    const proseEl = await new Promise((resolve) => {
      // Patch daContent's setter: when proseEl is assigned, override its
      // getRootNode so handleProseLoaded can dispatch on a host element.
      Object.defineProperty(fakeContent, 'proseEl', {
        configurable: true,
        set(v) {
          this._proseEl = v;
          // Wrap so getRootNode returns our host
          v.getRootNode = () => ({ host });
          resolve(v);
        },
        get() { return this._proseEl; },
      });
      initProse({ path: 'https://admin.da.live/source/o/r/p.html', permissions: ['read', 'write'], doc: null, daContent: fakeContent, wsPromise });
    });

    expect(proseEl).to.exist;
    expect(window.view).to.exist;
    expect(fakeContent.wsProvider).to.equal(provider);
    // Wait for handleProseLoaded's setTimeout
    await wait(20);
  });

  it('Reads-only when permissions has no write', async () => {
    const ydoc = new Y.Doc();
    const provider = buildFakeWsProvider({ withSynced: false });
    const wsPromise = Promise.resolve({ wsProvider: provider, ydoc });
    Object.defineProperty(fakeContent, 'proseEl', {
      configurable: true,
      set(v) {
        v.getRootNode = () => ({ host: document.createElement('div') });
        this._proseEl = v;
      },
      get() { return this._proseEl; },
    });
    await initProse({ path: 'https://admin.da.live/source/o/r/p.html', permissions: ['read'], doc: null, daContent: fakeContent, wsPromise });
    // ProseMirror exposes editable via someProp: it returns the editable() result
    expect(window.view.someProp('editable')(window.view)).to.be.false;
  });

  it('Sets an Anonymous user when adobeIMS is not signed in', async () => {
    const ydoc = new Y.Doc();
    const provider = buildFakeWsProvider({ withSynced: false });
    const wsPromise = Promise.resolve({ wsProvider: provider, ydoc });
    Object.defineProperty(fakeContent, 'proseEl', {
      configurable: true,
      set(v) {
        v.getRootNode = () => ({ host: document.createElement('div') });
        this._proseEl = v;
      },
      get() { return this._proseEl; },
    });
    delete window.adobeIMS;
    await initProse({ path: 'https://admin.da.live/source/o/r/p.html', permissions: ['read', 'write'], doc: null, daContent: fakeContent, wsPromise });
    const states = [...provider.awareness.getStates().values()];
    const userState = states.find((s) => s.user);
    expect(userState.user.name).to.equal('Anonymous');
    expect(userState.user.id).to.match(/^anonymous-/);
  });

  it('Calls adobeIMS.getProfile when signed in and assigns user info to awareness', async () => {
    const ydoc = new Y.Doc();
    const provider = buildFakeWsProvider({ withSynced: false });
    const wsPromise = Promise.resolve({ wsProvider: provider, ydoc });
    Object.defineProperty(fakeContent, 'proseEl', {
      configurable: true,
      set(v) {
        v.getRootNode = () => ({ host: document.createElement('div') });
        this._proseEl = v;
      },
      get() { return this._proseEl; },
    });
    let getProfileCalled = false;
    window.adobeIMS = {
      isSignedInUser: () => true,
      getProfile: () => {
        getProfileCalled = true;
        return Promise.resolve({ email: 'a@b.com', userId: 'uid', displayName: 'Alice' });
      },
    };
    try {
      await initProse({ path: 'https://admin.da.live/source/o/r/p.html', permissions: ['read', 'write'], doc: null, daContent: fakeContent, wsPromise });
      await wait(10);
      expect(getProfileCalled).to.be.true;
    } finally {
      delete window.adobeIMS;
    }
  });

  it('Destroys an existing window.view before creating a new one', async () => {
    let destroyed = 0;
    window.view = { destroy: () => { destroyed += 1; } };
    const ydoc = new Y.Doc();
    const provider = buildFakeWsProvider({ withSynced: false });
    Object.defineProperty(fakeContent, 'proseEl', {
      configurable: true,
      set(v) {
        v.getRootNode = () => ({ host: document.createElement('div') });
        this._proseEl = v;
      },
      get() { return this._proseEl; },
    });
    await initProse({ path: 'https://admin.da.live/source/o/r/p.html', permissions: ['read'], doc: null, daContent: fakeContent, wsPromise: Promise.resolve({ wsProvider: provider, ydoc }) });
    expect(destroyed).to.equal(1);
  });
});
