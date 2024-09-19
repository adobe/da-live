import { expect } from '@esm-bundle/chai';

// This is needed to make a dynamic import work that is indirectly referenced
// from edit/prose/index.js
const { setNx } = await import('../../../../scripts/utils.js');
setNx('/bheuaark/', { hostname: 'localhost' });

const pi = await import('../../../../blocks/edit/prose/index.js');

describe('Prose collab', () => {
  it('Test awareness status', () => {
    const dat = {};
    const doc = { querySelector: (e) => (e === 'da-title' ? dat : null) };
    const winEventListeners = [];
    const win = {
      addEventListener: (n, f) => winEventListeners.push({ n, f }),
      document: doc,
    };

    const awarenessOnCalled = [];
    const awarenessStates = new Map();
    const awareness = {
      clientID: 123,
      getStates: () => awarenessStates,
      on: (n, f) => awarenessOnCalled.push({ n, f }),
      getLocalState: () => awarenessStates.get(123),
    };
    const wspOnCalled = [];
    const wsp = {
      awareness,
      on: (n, f) => wspOnCalled.push({ n, f }),
    };

    const daTitle = pi.createAwarenessStatusWidget(wsp, win);
    expect(daTitle).to.equal(dat);

    expect(winEventListeners.length).to.equal(2);
    const el0 = winEventListeners[0];
    const el1 = winEventListeners[1];
    const elOnline = el0.n === 'online' ? el0 : el1;
    const elOffline = el0.n === 'offline' ? el0 : el1;

    elOnline.f(); // Call the callback function sent to the listener
    expect(daTitle.collabStatus).to.equal('online');
    elOffline.f(); // Call the callback function sent to the listener
    expect(daTitle.collabStatus).to.equal('offline');

    expect(wspOnCalled.length).to.equal(1);
    expect(wspOnCalled[0].n).to.equal('status');
    wspOnCalled[0].f({ status: 'connected' });
    expect(daTitle.collabStatus).to.equal('connected');

    expect(awarenessOnCalled.length).to.equal(1);
    expect(awarenessOnCalled[0].n).to.equal('update');

    // The current user
    const knownUser123 = { user: { name: 'Daffy Duck', id: 'daffy' } };
    awarenessStates.set(123, knownUser123);
    // Another known user
    const knownUser789 = { user: { name: 'Joe Bloggs', id: 'bloggs' } };
    awarenessStates.set(789, knownUser789);

    const delta1 = { added: [123], removed: [], updated: [] };
    awarenessOnCalled[0].f(delta1); // Call the callback function
    expect(daTitle.collabUsers.length).to.equal(0);

    const delta2 = {
      added: [111, 456, 789, 123],
      removed: [456],
      updated: [234],
    };

    awarenessOnCalled[0].f(delta2); // Call the callback function
    expect(daTitle.collabUsers).to.deep.equal(['Anonymous', 'Anonymous', 'Joe Bloggs']);
  });

  it('Test poll for updates', async () => {
    const setIntervalFuncs = [];
    const mockSetInterval = (func) => {
      setIntervalFuncs.push(func);
    };

    const daPreview = {};
    const daContent = { shadowRoot: { querySelector: (e) => (e === 'da-preview' ? daPreview : null) } };
    const doc = { querySelector: (e) => (e === 'da-content' ? daContent : null) };
    const win = { view: { root: { querySelector: (e) => (e === '.ProseMirror' ? {} : null) } } };

    const savedSetInterval = window.setInterval;
    try {
      window.setInterval = mockSetInterval;

      expect(setIntervalFuncs.length).to.equal(0, 'Precondition');
      pi.pollForUpdates(doc, win);
      pi.pollForUpdates(doc, win);
      expect(setIntervalFuncs.length).to.equal(1, 'Should only have set up the preview interval once');
    } finally {
      window.setInterval = savedSetInterval;
    }
  });
});
