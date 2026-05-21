/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { Y } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import initProse, {
  createConnection,
  createAwarenessStatusWidget,
} from '../../../../../blocks/edit/prose/index.js';
import { forceSave } from '../../../../../blocks/edit/prose/forcesave.js';

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
  beforeEach(() => {
    window.localStorage.removeItem('nx-ims');
  });
  afterEach(() => {
    // Always remove rather than restoring a prior value — if a leak entered
    // this block, restoring it would propagate the leak to later test files.
    window.localStorage.removeItem('nx-ims');
    document.querySelectorAll('da-dialog.da-auth-banner').forEach((el) => el.remove());
  });

  it('Returns a wsProvider and a Y.Doc with maxBackoffTime configured', async () => {
    const result = await createConnection('https://admin.da.live/source/org/repo/page.html');
    expect(result.wsProvider).to.exist;
    expect(result.ydoc).to.exist;
    expect(result.wsProvider.maxBackoffTime).to.equal(30000);
    // Clean up the underlying WS connection
    result.wsProvider.disconnect({ data: 'Client navigation' });
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

      wsProvider.disconnect({ data: 'Client navigation' });
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

      wsProvider.disconnect({ data: 'Client navigation' });
      wsProvider.destroy?.();
      ydoc.destroy();
    } finally {
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
  });

  it('Stops reconnecting on 4401 when imslib cannot produce a token, shows banner', async () => {
    window.localStorage.setItem('nx-ims', 'true');
    const savedIMS = window.adobeIMS;
    let refreshCalls = 0;
    window.adobeIMS = {
      getAccessToken: () => ({ token: 'T-initial' }),
      refreshToken: async () => { refreshCalls += 1; },
      signIn: () => {},
    };

    try {
      const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/org/repo/page.html');

      // After construction, simulate imslib losing the token (SSO expired)
      window.adobeIMS.getAccessToken = () => null;

      wsProvider.emit('connection-close', [{ code: 4401, reason: 'auth' }, wsProvider]);
      // Allow the dynamic banner import + mount to settle
      await new Promise((r) => { setTimeout(r, 80); });

      expect(refreshCalls).to.equal(1);
      expect(wsProvider.shouldConnect).to.equal(false);
      expect(document.querySelector('da-dialog.da-auth-banner')).to.exist;

      document.querySelector('da-dialog.da-auth-banner')?.remove();
      wsProvider.disconnect({ data: 'Client navigation' });
      wsProvider.destroy?.();
      ydoc.destroy();
    } finally {
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
  });

  it('Anonymous user hitting a private doc bails on 4401 without showing banner', async () => {
    window.localStorage.removeItem('nx-ims');
    const savedIMS = window.adobeIMS;
    window.adobeIMS = {
      getAccessToken: () => null,
      refreshToken: async () => {},
      signIn: () => {},
    };

    try {
      const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/org/repo/page.html');
      expect(wsProvider.protocols).to.deep.equal(['yjs']);

      wsProvider.emit('connection-close', [{ code: 4401, reason: 'auth' }, wsProvider]);
      await new Promise((r) => { setTimeout(r, 80); });

      expect(wsProvider.shouldConnect).to.equal(false);
      expect(document.querySelector('da-dialog.da-auth-banner')).to.not.exist;

      wsProvider.disconnect({ data: 'Client navigation' });
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

      wsProvider.disconnect({ data: 'Client navigation' });
      wsProvider.destroy?.();
      ydoc.destroy();
    } finally {
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
  });

  it('Blocks y-websocket auto-reconnect during the in-flight refresh on 4401', async () => {
    // Regression: y-websocket's onclose schedules setTimeout(setupWS, 100ms)
    // synchronously; if shouldConnect stays true through the await
    // refreshToken() round-trip the auto-reconnect fires with the stale token
    // and burns a HEAD 401 on da-admin. shouldConnect must flip to false
    // synchronously before the first await.
    window.localStorage.setItem('nx-ims', 'true');
    const savedIMS = window.adobeIMS;
    let refreshResolve;
    const refreshPromise = new Promise((r) => { refreshResolve = r; });
    let tokenIndex = 0;
    const tokens = ['T-old', 'T-new'];
    window.adobeIMS = {
      getAccessToken: () => ({ token: tokens[tokenIndex] }),
      refreshToken: () => refreshPromise,
    };

    try {
      const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/org/repo/page.html');
      expect(wsProvider.shouldConnect).to.equal(true);

      // Fire 4401 — handler runs sync up to first await, then yields.
      wsProvider.emit('connection-close', [{ code: 4401, reason: 'auth' }, wsProvider]);
      // Microtask boundary: handler has hit `await refreshToken()` and yielded.
      await Promise.resolve();

      // During the in-flight refresh, shouldConnect MUST be false so a stale
      // y-websocket reconnect timer fires as a no-op.
      expect(wsProvider.shouldConnect).to.equal(false);

      // Resolve the refresh; rotate the token so getAuthToken() returns T-new.
      tokenIndex = 1;
      refreshResolve();
      await new Promise((r) => { setTimeout(r, 0); });

      // After refresh: fresh token applied and reconnect explicitly re-enabled.
      expect(wsProvider.protocols).to.deep.equal(['yjs', 'T-new']);
      expect(wsProvider.shouldConnect).to.equal(true);

      wsProvider.disconnect({ data: 'Client navigation' });
      wsProvider.destroy?.();
      ydoc.destroy();
    } finally {
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
  });

  it('Non-auth close with no token keeps anonymous protocols and engages rapid-reconnect guard', async () => {
    window.localStorage.removeItem('nx-ims');
    const savedIMS = window.adobeIMS;
    delete window.adobeIMS;

    try {
      const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/org/repo/page.html');
      expect(wsProvider.protocols).to.deep.equal(['yjs']);

      // Simulate a generic network drop — no custom code
      wsProvider.emit('connection-close', [{ code: 1006 }, wsProvider]);
      await new Promise((r) => { setTimeout(r, 0); });

      // Protocols stay anonymous (no IMS token in this scenario).
      expect(wsProvider.protocols).to.deep.equal(['yjs']);
      // COR-44 rapid-reconnect guard: this close was not preceded by a
      // long-lived 'status' connected event, so the guard treats
      // it as a short session and parks the provider in manual-reconnect
      // mode.
      expect(wsProvider.shouldConnect).to.equal(false);

      wsProvider.disconnect({ data: 'Client navigation' });
      wsProvider.destroy?.();
      ydoc.destroy();
    } finally {
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
  });
});

describe('prose/index createConnection rapid-reconnect guard (COR-44)', () => {
  let originalSetTimeout;
  let originalClearTimeout;
  let originalDateNow;
  let originalWebSocket;
  let timers;
  let now;

  function installFakes() {
    now = 1000000;
    timers = [];
    originalDateNow = Date.now;
    Date.now = () => now;
    originalSetTimeout = window.setTimeout;
    originalClearTimeout = window.clearTimeout;
    window.setTimeout = (fn, delay) => {
      const id = timers.length + 1;
      timers.push({ id, fn, delay: delay || 0, cancelled: false });
      return id;
    };
    window.clearTimeout = (id) => {
      const t = timers.find((x) => x.id === id);
      if (t) t.cancelled = true;
    };
    originalWebSocket = window.WebSocket;
    window.WebSocket = function FakeWebSocket() {
      this.readyState = 0;
      this.close = () => {};
      this.send = () => {};
    };
  }

  function uninstallFakes() {
    if (originalSetTimeout) window.setTimeout = originalSetTimeout;
    if (originalClearTimeout) window.clearTimeout = originalClearTimeout;
    if (originalDateNow) Date.now = originalDateNow;
    if (originalWebSocket) window.WebSocket = originalWebSocket;
  }

  function advance(ms) { now += ms; }
  function clearTimers() { timers = []; }
  function lastManualBackoff() {
    return [...timers].reverse().find((t) => !t.cancelled && t.delay >= 1000);
  }

  function flushMicrotasks() {
    return new Promise((resolve) => { originalSetTimeout.call(window, resolve, 0); });
  }

  beforeEach(() => {
    installFakes();
    window.localStorage.removeItem('nx-ims');
  });

  afterEach(() => {
    uninstallFakes();
    window.localStorage.removeItem('nx-ims');
    document.querySelectorAll('da-dialog.da-auth-banner').forEach((el) => el.remove());
  });

  it('Healthy reconnect: long-lived session does not trigger manual backoff', async () => {
    const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/o/r/p.html');
    clearTimers();
    const disconnectSpy = sinon.spy(wsProvider, 'disconnect');

    wsProvider.emit('status', [{ status: 'connected' }]);
    advance(6000);
    wsProvider.emit('connection-close', [{ code: 1011 }, wsProvider]);
    await flushMicrotasks();

    expect(disconnectSpy.called).to.equal(false);
    expect(lastManualBackoff()).to.equal(undefined);

    disconnectSpy.restore();
    ydoc.destroy();
  });

  it('Single short session arms a 1s manual backoff and reconnects', async () => {
    const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/o/r/p.html');
    clearTimers();
    const disconnectSpy = sinon.spy(wsProvider, 'disconnect');
    const connectSpy = sinon.spy(wsProvider, 'connect');

    wsProvider.emit('status', [{ status: 'connected' }]);
    advance(200);
    wsProvider.emit('connection-close', [{ code: 1011 }, wsProvider]);
    await flushMicrotasks();

    expect(disconnectSpy.called).to.equal(true);
    expect(wsProvider.shouldConnect).to.equal(false);
    const t = lastManualBackoff();
    expect(t).to.exist;
    expect(t.delay).to.equal(1000);

    t.fn();
    expect(wsProvider.shouldConnect).to.equal(true);
    expect(connectSpy.called).to.equal(true);

    disconnectSpy.restore();
    connectSpy.restore();
    ydoc.destroy();
  });

  it('Repeated short sessions back off exponentially: 1s, 2s, 4s', async () => {
    const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/o/r/p.html');
    clearTimers();
    const delays = [];

    for (let i = 0; i < 3; i += 1) {
      wsProvider.emit('status', [{ status: 'connected' }]);
      advance(200);
      wsProvider.emit('connection-close', [{ code: 1011 }, wsProvider]);
      // eslint-disable-next-line no-await-in-loop
      await flushMicrotasks();
      const t = lastManualBackoff();
      delays.push(t.delay);
      t.cancelled = true;
    }

    expect(delays).to.deep.equal([1000, 2000, 4000]);

    ydoc.destroy();
  });

  it('Backoff caps at 30s after many short sessions', async () => {
    const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/o/r/p.html');
    clearTimers();

    for (let i = 0; i < 6; i += 1) {
      wsProvider.emit('status', [{ status: 'connected' }]);
      advance(200);
      wsProvider.emit('connection-close', [{ code: 1011 }, wsProvider]);
      // eslint-disable-next-line no-await-in-loop
      await flushMicrotasks();
      const t = lastManualBackoff();
      if (t) t.cancelled = true;
    }

    // 7th short close: pre-increment value is 6, so 2 ** 6 * 1000 = 64000,
    // capped at SHORT_SESSION_MAX_MS = 30000.
    wsProvider.emit('status', [{ status: 'connected' }]);
    advance(200);
    wsProvider.emit('connection-close', [{ code: 1011 }, wsProvider]);
    await flushMicrotasks();
    const last = lastManualBackoff();
    expect(last.delay).to.equal(30000);

    ydoc.destroy();
  });

  it('Long-lived session resets the counter so next short close is 1s again', async () => {
    const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/o/r/p.html');
    clearTimers();

    for (let i = 0; i < 2; i += 1) {
      wsProvider.emit('status', [{ status: 'connected' }]);
      advance(200);
      wsProvider.emit('connection-close', [{ code: 1011 }, wsProvider]);
      // eslint-disable-next-line no-await-in-loop
      await flushMicrotasks();
      const t = lastManualBackoff();
      if (t) t.cancelled = true;
    }

    // One healthy session: open, live > 5s, then close. No manual backoff.
    wsProvider.emit('status', [{ status: 'connected' }]);
    advance(6000);
    wsProvider.emit('connection-close', [{ code: 1011 }, wsProvider]);
    await flushMicrotasks();
    expect(lastManualBackoff()).to.equal(undefined);

    // Next short close should use the base delay again.
    wsProvider.emit('status', [{ status: 'connected' }]);
    advance(200);
    wsProvider.emit('connection-close', [{ code: 1011 }, wsProvider]);
    await flushMicrotasks();
    expect(lastManualBackoff().delay).to.equal(1000);

    ydoc.destroy();
  });

  it('Second close without a reconnect open is treated as a short session', async () => {
    const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/o/r/p.html');
    clearTimers();

    // Healthy first session: open, live > 5s, close — no backoff, counter reset.
    wsProvider.emit('status', [{ status: 'connected' }]);
    advance(6000);
    wsProvider.emit('connection-close', [{ code: 1011 }, wsProvider]);
    await flushMicrotasks();
    expect(lastManualBackoff()).to.equal(undefined);

    // Reconnect attempt fails before 'connected' fires — second close arrives
    // with no new lastOpenAt. Without the reset the stale timestamp from 6s ago
    // would make sessionMs look healthy and suppress the backoff.
    wsProvider.emit('connection-close', [{ code: 1011 }, wsProvider]);
    await flushMicrotasks();
    expect(lastManualBackoff()).to.exist;
    expect(lastManualBackoff().delay).to.equal(1000);

    ydoc.destroy();
  });

  it('Auth-close (4401) does NOT engage rapid-reconnect guard', async () => {
    window.localStorage.setItem('nx-ims', 'true');
    const savedIMS = window.adobeIMS;
    let tokenIndex = 0;
    const tokens = ['T-old', 'T-new'];
    window.adobeIMS = {
      getAccessToken: () => ({ token: tokens[tokenIndex] }),
      refreshToken: async () => { tokenIndex = 1; },
    };

    try {
      const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/o/r/p.html');
      clearTimers();
      const disconnectSpy = sinon.spy(wsProvider, 'disconnect');

      wsProvider.emit('status', [{ status: 'connected' }]);
      advance(200);
      wsProvider.emit('connection-close', [{ code: 4401, reason: 'auth' }, wsProvider]);
      await flushMicrotasks();
      await flushMicrotasks();

      expect(wsProvider.protocols).to.deep.equal(['yjs', 'T-new']);
      expect(disconnectSpy.called).to.equal(false);
      expect(lastManualBackoff()).to.equal(undefined);

      disconnectSpy.restore();
      ydoc.destroy();
    } finally {
      if (savedIMS === undefined) delete window.adobeIMS; else window.adobeIMS = savedIMS;
    }
  });

  it('Auth-close (4401) with stale token still stops the loop and shows the banner', async () => {
    window.localStorage.setItem('nx-ims', 'true');
    const savedIMS = window.adobeIMS;
    window.adobeIMS = {
      getAccessToken: () => ({ token: 'T-same' }),
      refreshToken: async () => {},
    };

    try {
      const { wsProvider, ydoc } = await createConnection('https://admin.da.live/source/o/r/p.html');
      clearTimers();
      const connectSpy = sinon.spy(wsProvider, 'connect');

      wsProvider.emit('status', [{ status: 'connected' }]);
      advance(200);
      wsProvider.emit('connection-close', [{ code: 4401, reason: 'auth' }, wsProvider]);
      await new Promise((r) => { originalSetTimeout.call(window, r, 100); });

      expect(wsProvider.shouldConnect).to.equal(false);
      expect(connectSpy.called).to.equal(false);
      expect(document.querySelector('da-dialog.da-auth-banner')).to.exist;

      connectSpy.restore();
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

  it('Skips checkDoc HEAD on auth-close codes (4401/4403)', async () => {
    // checkDoc is intended to detect doc-deleted-externally (404). On 4401/4403
    // the doc is fine — da-collab signalled an auth failure. Firing checkDoc
    // here just doubles the HEAD 401 traffic to da-admin via daFetch's
    // refresh-and-retry, so it must be skipped.
    const provider = buildFakeWsProvider();
    const fakeWin = { document, addEventListener: () => {} };
    const fetchCalls = [];
    const savedFetch = window.fetch;
    window.fetch = (...args) => {
      fetchCalls.push(args);
      return Promise.resolve(new Response('', { status: 200, headers: {} }));
    };
    try {
      createAwarenessStatusWidget(provider, fakeWin, 'https://admin.da.live/source/o/r/p.html');

      provider._emit('connection-close', { code: 4401, reason: 'auth' }, provider);
      provider._emit('connection-close', { code: 4403, reason: 'forbidden' }, provider);
      await new Promise((r) => { setTimeout(r, 0); });

      expect(fetchCalls.filter(([, o]) => o?.method === 'HEAD'))
        .to.have.lengthOf(0);

      // Sanity: a non-auth close still does fire checkDoc.
      provider._emit('connection-close', { code: 1006 }, provider);
      await new Promise((r) => { setTimeout(r, 0); });
      expect(fetchCalls.some(([, o]) => o?.method === 'HEAD')).to.equal(true);
    } finally {
      window.fetch = savedFetch;
    }
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

// ---- registerErrorHandler tests ----

describe('prose/index registerErrorHandler', () => {
  let fakeContent;
  let fakeTitle;
  let savedQuery;
  let savedFetch;

  function setupFakeContent() {
    Object.defineProperty(fakeContent, 'proseEl', {
      configurable: true,
      set(v) {
        v.getRootNode = () => ({ host: document.createElement('div') });
        this._proseEl = v;
      },
      get() { return this._proseEl; },
    });
  }

  async function initAndGetYDoc() {
    const ydoc = new Y.Doc();
    const provider = buildFakeWsProvider({ withSynced: false });
    setupFakeContent();
    await initProse({
      path: 'https://admin.da.live/source/o/r/p.html',
      permissions: ['read'],
      doc: null,
      daContent: fakeContent,
      wsPromise: Promise.resolve({ wsProvider: provider, ydoc }),
    });
    return ydoc;
  }

  beforeEach(() => {
    if (window.view) {
      try { window.view.destroy(); } catch { /* */ }
      delete window.view;
    }
    fakeContent = { proseEl: null, wsProvider: null };
    fakeTitle = { collabUsers: undefined, collabStatus: undefined };
    savedQuery = document.querySelector.bind(document);
    document.querySelector = (sel) => {
      if (sel === 'da-title') return fakeTitle;
      if (sel === 'da-content') return null;
      return savedQuery(sel);
    };
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

  it('Routes 401 messages to console.warn', async () => {
    const ydoc = await initAndGetYDoc();
    const calls = [];
    const saved = console.warn;
    console.warn = (...args) => calls.push(args);
    try {
      ydoc.getMap('error').set('message', '401 Unauthorized');
      expect(calls).to.have.lengthOf(1);
      expect(calls[0][0]).to.equal('Message from collab: 401 Unauthorized');
    } finally {
      console.warn = saved;
    }
  });

  it('Routes 403 messages to console.log', async () => {
    const ydoc = await initAndGetYDoc();
    const calls = [];
    const saved = console.log;
    console.log = (...args) => calls.push(args);
    try {
      ydoc.getMap('error').set('message', '403 Forbidden');
      expect(calls).to.have.lengthOf(1);
      expect(calls[0][0]).to.equal('Message from collab: 403 Forbidden');
    } finally {
      console.log = saved;
    }
  });

  it('Routes other messages to console.error with toJSON payload', async () => {
    const ydoc = await initAndGetYDoc();
    const calls = [];
    const saved = console.error;
    console.error = (...args) => calls.push(args);
    try {
      ydoc.getMap('error').set('message', '500 Internal Server Error');
      expect(calls).to.have.lengthOf(1);
      expect(calls[0][0]).to.equal('Error message from collab: 500 Internal Server Error');
      expect(calls[0][1]).to.deep.equal({ message: '500 Internal Server Error' });
    } finally {
      console.error = saved;
    }
  });

  it('Clears the error map after logging', async () => {
    const ydoc = await initAndGetYDoc();
    const saved = console.warn;
    console.warn = () => {};
    try {
      const errorMap = ydoc.getMap('error');
      errorMap.set('message', '401 Unauthorized');
      expect(errorMap.size).to.equal(0);
    } finally {
      console.warn = saved;
    }
  });

  it('Falls back to JSON when no message key is set', async () => {
    const ydoc = await initAndGetYDoc();
    const calls = [];
    const saved = console.error;
    console.error = (...args) => calls.push(args);
    try {
      ydoc.getMap('error').set('code', 'UNKNOWN');
      expect(calls).to.have.lengthOf(1);
      expect(calls[0][0]).to.equal('Error message from collab: {"code":"UNKNOWN"}');
      expect(calls[0][1]).to.deep.equal({ code: 'UNKNOWN' });
    } finally {
      console.error = saved;
    }
  });
});

// ---- forceSave tests ----

function buildFakeWs({ connected = true, responseOk = true, responseError = '', delayMs = 0 } = {}) {
  const listeners = [];
  const sent = [];

  const ws = {
    sent,
    addEventListener(type, cb) { if (type === 'message') listeners.push(cb); },
    removeEventListener(type, cb) {
      if (type !== 'message') return;
      const i = listeners.indexOf(cb);
      if (i > -1) listeners.splice(i, 1);
    },
    send(data) {
      sent.push(data);
      if (!connected) return;
      // Simulate server response after optional delay
      setTimeout(() => {
        // Build MSG_FLUSH_RESPONSE (3) + ok flag + optional error string
        let resp;
        if (responseOk) {
          resp = new Uint8Array([3, 1]);
        } else {
          const errBytes = new TextEncoder().encode(responseError);
          resp = new Uint8Array([3, 0, errBytes.length, ...errBytes]);
        }
        listeners.forEach((cb) => cb({ data: resp.buffer }));
      }, delayMs);
    },
  };
  return ws;
}

function buildFakeProvider({ wsconnected = true, ws = null } = {}) {
  const listeners = new Map();
  return {
    wsconnected,
    ws,
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
  };
}

describe('forceSave', () => {
  it('returns ok:true when server acks the flush', async () => {
    const ws = buildFakeWs({ responseOk: true });
    const provider = buildFakeProvider({ wsconnected: true, ws });

    const result = await forceSave(provider);
    expect(result.ok).to.be.true;
    expect(ws.sent).to.have.length(1);
    expect(ws.sent[0][0]).to.equal(2); // MSG_FLUSH_REQUEST
  });

  it('returns ok:false with error message when server reports failure', async () => {
    const ws = buildFakeWs({ responseOk: false, responseError: 'save failed' });
    const provider = buildFakeProvider({ wsconnected: true, ws });

    const result = await forceSave(provider);
    expect(result.ok).to.be.false;
    expect(result.error).to.equal('save failed');
  });

  it('waits for connection then sends flush when initially disconnected', async () => {
    const ws = buildFakeWs({ responseOk: true });
    const provider = buildFakeProvider({ wsconnected: false, ws });

    // Simulate reconnect after a tick
    setTimeout(() => {
      provider.wsconnected = true;
      provider._emit('status', { status: 'connected' });
    }, 5);

    const result = await forceSave(provider);
    expect(result.ok).to.be.true;
    expect(ws.sent).to.have.length(1);
  });

  it('ignores unrelated message types while waiting for ack', async () => {
    const listeners = [];
    const sent = [];

    const ws = {
      sent,
      addEventListener(type, cb) { if (type === 'message') listeners.push(cb); },
      removeEventListener(type, cb) {
        if (type !== 'message') return;
        const i = listeners.indexOf(cb);
        if (i > -1) listeners.splice(i, 1);
      },
      send(data) {
        sent.push(data);
        // Send a yjs sync message (type 0) first, then the real ack
        setTimeout(() => {
          listeners.forEach((cb) => cb({ data: new Uint8Array([0, 0]).buffer }));
        }, 5);
        setTimeout(() => {
          listeners.forEach((cb) => cb({ data: new Uint8Array([3, 1]).buffer }));
        }, 10);
      },
    };
    const provider = buildFakeProvider({ wsconnected: true, ws });
    const result = await forceSave(provider);
    expect(result.ok).to.be.true;
  });
});
