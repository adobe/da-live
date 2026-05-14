/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { Y } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import initProse, {
  createConnection,
  createAwarenessStatusWidget,
} from '../../../../../blocks/edit/prose/index.js';

// initProse lazily imports da-library.js, which (a) builds URLs from
// `${getNx()}/...` and (b) calls loadLibrary() at module import time.
// Without a configured nx base and a path-like hash, both produce
// "error was thrown outside a promise" warnings on the first initProse
// run. Set them once for the test file.
setNx('/test/fixtures/nx', { hostname: 'example.com' });
if (!window.location.hash.startsWith('#/')) {
  window.location.hash = '#/org/repo';
}

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
    if (savedNxIms) {
      window.localStorage.setItem('nx-ims', savedNxIms);
    } else {
      window.localStorage.removeItem('nx-ims');
    }
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

  it('Refreshes protocols with the live IMS token on connection-close', async () => {
    window.localStorage.setItem('nx-ims', 'true');
    const savedIMS = window.adobeIMS;
    let tokenIndex = 0;
    const tokens = ['T-initial', 'T-rotated'];
    window.adobeIMS = {
      getAccessToken: () => {
        const t = tokens[tokenIndex];
        tokenIndex += 1;
        return { token: t };
      },
    };

    try {
      const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/org/repo/page.html');
      expect(wsProvider.protocols).to.deep.equal(['yjs', 'T-initial']);

      // Simulate a server-signalled auth failure
      wsProvider.emit('connection-close', [{ code: 4401, reason: 'auth' }, wsProvider]);
      await new Promise((r) => { setTimeout(r, 0); });

      expect(wsProvider.protocols).to.deep.equal(['yjs', 'T-rotated']);
      expect(wsProvider.shouldConnect).to.equal(true);

      wsProvider.disconnect();
      wsProvider.destroy?.();
      ydoc.destroy();
    } finally {
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
  });

  it('Stops reconnecting on a 4403 forbidden close', async () => {
    window.localStorage.setItem('nx-ims', 'true');
    const savedIMS = window.adobeIMS;
    window.adobeIMS = { getAccessToken: () => ({ token: 'T-initial' }) };

    try {
      const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/org/repo/page.html');
      expect(wsProvider.shouldConnect).to.equal(true);

      wsProvider.emit('connection-close', [{ code: 4403, reason: 'forbidden' }, wsProvider]);
      await new Promise((r) => { setTimeout(r, 0); });

      expect(wsProvider.shouldConnect).to.equal(false);

      wsProvider.disconnect();
      wsProvider.destroy?.();
      ydoc.destroy();
    } finally {
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
  });

  it('Stops reconnecting on 4401 when imslib cannot produce a token, triggers sign-in', async () => {
    window.localStorage.setItem('nx-ims', 'true');
    const savedIMS = window.adobeIMS;
    let refreshCalls = 0;
    let signInCalls = 0;
    window.adobeIMS = {
      getAccessToken: () => ({ token: 'T-initial' }),
      refreshToken: async () => { refreshCalls += 1; },
      signIn: () => { signInCalls += 1; },
    };

    try {
      const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/org/repo/page.html');

      // After construction, simulate imslib losing the token (SSO expired)
      window.adobeIMS.getAccessToken = () => null;

      wsProvider.emit('connection-close', [{ code: 4401, reason: 'auth' }, wsProvider]);
      // Allow the dynamic import + signIn call to settle
      await new Promise((r) => { setTimeout(r, 50); });

      expect(refreshCalls).to.equal(1);
      expect(wsProvider.shouldConnect).to.equal(false);
      expect(signInCalls).to.equal(1);

      wsProvider.disconnect();
      wsProvider.destroy?.();
      ydoc.destroy();
    } finally {
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
  });

  it('Anonymous user hitting a private doc bails on 4401 without sign-in redirect', async () => {
    window.localStorage.removeItem('nx-ims');
    const savedIMS = window.adobeIMS;
    let signInCalls = 0;
    window.adobeIMS = {
      getAccessToken: () => null,
      refreshToken: async () => {},
      signIn: () => { signInCalls += 1; },
    };

    try {
      const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/org/repo/page.html');
      expect(wsProvider.protocols).to.deep.equal(['yjs']);

      wsProvider.emit('connection-close', [{ code: 4401, reason: 'auth' }, wsProvider]);
      await new Promise((r) => { setTimeout(r, 50); });

      expect(wsProvider.shouldConnect).to.equal(false);
      expect(signInCalls).to.equal(0);

      wsProvider.disconnect();
      wsProvider.destroy?.();
      ydoc.destroy();
    } finally {
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
  });

  it('Stops reconnecting on 4401 when imslib hands back the same stale token', async () => {
    window.localStorage.setItem('nx-ims', 'true');
    const savedIMS = window.adobeIMS;
    window.adobeIMS = {
      getAccessToken: () => ({ token: 'T-same' }),
      refreshToken: async () => {},
    };

    try {
      const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/org/repo/page.html');
      expect(wsProvider.protocols).to.deep.equal(['yjs', 'T-same']);

      wsProvider.emit('connection-close', [{ code: 4401, reason: 'auth' }, wsProvider]);
      await new Promise((r) => { setTimeout(r, 0); });

      // No new token to try — don't loop.
      expect(wsProvider.shouldConnect).to.equal(false);

      wsProvider.disconnect();
      wsProvider.destroy?.();
      ydoc.destroy();
    } finally {
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
  });

  it('Non-auth close with no token reconnects as anonymous', async () => {
    window.localStorage.removeItem('nx-ims');
    const savedIMS = window.adobeIMS;
    delete window.adobeIMS;

    try {
      const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/org/repo/page.html');
      expect(wsProvider.protocols).to.deep.equal(['yjs']);

      // Simulate a generic network drop — no custom code
      wsProvider.emit('connection-close', [{ code: 1006 }, wsProvider]);
      await new Promise((r) => { setTimeout(r, 0); });

      expect(wsProvider.protocols).to.deep.equal(['yjs']);
      expect(wsProvider.shouldConnect).to.equal(true);

      wsProvider.disconnect();
      wsProvider.destroy?.();
      ydoc.destroy();
    } finally {
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
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
  let savedFetch;

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
    // Stub fetch — initProse lazily imports da-library.js which fetches
    // a stylesheet on first import and triggers loadLibrary() → fetchConfig.
    // fetchConfig parses the body as JSON, so return an empty JSON object.
    savedFetch = window.fetch;
    window.fetch = () => Promise.resolve(new Response('{}', { status: 200 }));
  });

  afterEach(() => {
    if (window.view) {
      try { window.view.destroy(); } catch { /* */ }
      delete window.view;
    }
    document.querySelector = savedQuery;
    window.fetch = savedFetch;
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
