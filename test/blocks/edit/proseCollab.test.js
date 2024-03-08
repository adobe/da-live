import { expect } from '@esm-bundle/chai';

// This is needed to make a dynamic import work that is indirectly referenced
// from edit/prose/index.js
const { setLibs } = await import('../../../scripts/utils.js');
setLibs('/bheuaark/', { hostname: 'localhost' });

const pi = await import('../../../blocks/edit/prose/index.js');

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

  it('Test YDoc firstUpdate callback', (done) => {
    const ydocMap = new Map();
    ydocMap.set('initial', 'Some intial text');

    const ydocOnCalls = [];
    const ydoc = {
      getMap: (n) => (n === 'aem' ? ydocMap : null),
      on: (n, f) => ydocOnCalls.push({ n, f }),
    };

    const setAEMDocCalls = [];
    const fnSetAEMDoc = () => setAEMDocCalls.push('called');

    pi.handleYDocUpdates({
      daTitle: {},
      editor: {},
      ydoc,
      path: {},
      schema: {},
      wsProvider: {},
      yXmlFragment: {},
      fnInitProse: () => {},
    }, {}, fnSetAEMDoc);
    expect(ydocOnCalls.length).to.equal(1);
    expect(ydocOnCalls[0].n).to.equal('update');

    ydocOnCalls[0].f();
    setTimeout(() => {
      expect(setAEMDocCalls).to.deep.equal(['called']);

      // the function call again, it should not perform any action this time
      ydocOnCalls[0].f();
      setTimeout(() => {
        expect(setAEMDocCalls).to.deep.equal(
          ['called'],
          'First update code should only be called once',
        );
        done();
      }, 200);
    }, 200);
  });

  it('Test YDoc server update callback', () => {
    const daTitle = {
      collabStatus: 'yeah',
      collabUsers: 'some',
    };
    const editor = {};

    const ydocMap = new Map();
    ydocMap.set('svrinv', 'Some svrinv text');

    const ydocCalls = [];
    const ydocOnCalls = [];
    const ydoc = {
      getMap: (n) => (n === 'aem' ? ydocMap : null),
      destroy: () => ydocCalls.push('destroy'),
      on: (n, f) => ydocOnCalls.push({ n, f }),
    };

    const wspCalls = [];
    const wsp = { destroy: () => wspCalls.push('destroy') };

    const initProseCalls = [];
    const mockInitProse = () => initProseCalls.push('init');

    pi.handleYDocUpdates({
      daTitle,
      editor,
      ydoc,
      path: {},
      schema: {},
      wsProvider: wsp,
      yXmlFragment: {},
      fnInitProse: mockInitProse,
    }, {}, () => {});
    expect(ydocOnCalls.length).to.equal(1);
    expect(ydocOnCalls[0].n).to.equal('update');

    expect(daTitle.collabStatus).to.equal('yeah', 'Precondition');
    expect(daTitle.collabUsers).to.equal('some', 'Precondition');

    // Calls server invalidation
    ydocOnCalls[0].f();

    expect(daTitle.collabStatus).to.be.undefined;
    expect(daTitle.collabUsers).to.be.undefined;
    expect(ydocCalls).to.deep.equal(['destroy']);
    expect(wspCalls).to.deep.equal(['destroy']);
    expect(initProseCalls).to.deep.equal(['init']);
    expect(editor.innerHTML).to.equal('');
  });
});
