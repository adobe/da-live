import { expect } from '@esm-bundle/chai';

// This is needed to make a dynamic import work that is indirectly referenced
// from edit/prose/index.js
const { setLibs } = await import('../../../scripts/utils.js');
setLibs('/bheuaark/', { hostname: 'localhost' });

const pi = await import('../../../blocks/edit/prose/index.js');

describe('Prose collab', () => {
  const testConenctionStatus = (status) => {
    const mockImg = {};

    pi.setConnectionStatus(mockImg, status);

    expect(mockImg.alt).to.equal(status);
    expect(mockImg.title).to.equal(status);
    return mockImg.src;
  };

  it('Test setConnectionStatus connected', async () => {
    expect(testConenctionStatus('connected'))
      .to.equal('/blocks/edit/prose/img/Smock_Cloud_18_N.svg');
    expect(testConenctionStatus('online'))
      .to.equal('/blocks/edit/prose/img/Smock_Cloud_18_N.svg');
    expect(testConenctionStatus('connecting'))
      .to.equal('/blocks/edit/prose/img/Smock_CloudDisconnected_18_N.svg');
    expect(testConenctionStatus('offline'))
      .to.equal('/blocks/edit/prose/img/Smock_CloudDisconnected_18_N.svg');
    expect(testConenctionStatus('anythingelse'))
      .to.equal('/blocks/edit/prose/img/Smock_CloudError_18_N.svg');
  });

  it('Test awareness status', () => {
    const c0 = {};
    const c1 = {};
    const contInserted = [];
    const cont = {
      children: [c0, c1],
      insertBefore: (e, r) => {
        if (r === c1) {
          contInserted.push(e);
        }
      },
    };
    const tsr = { children: [cont] };
    const titleEl = { shadowRoot: tsr };

    const dcu = {};
    const connImg = {};
    const divEl = {
      querySelector: (e) => {
        switch (e) {
          case 'div.collab-users': return dcu;
          case 'img.collab-connection': return connImg;
          default: return null;
        }
      },
    };
    const doc = {
      createElement: (e) => (e === 'div' ? divEl : null),
      querySelector: (e) => (e === 'da-title' ? titleEl : null),
    };
    const winEventListeners = [];
    const win = {
      addEventListener: (n, f) => winEventListeners.push({ n, f }),
      document: doc,
    };

    const awarenessOnCalled = [];
    const awarenessStates = new Map();
    const awareness = {
      getStates: () => awarenessStates,
      on: (n, f) => awarenessOnCalled.push({ n, f }),
    };
    const wspOnCalled = [];
    const wsp = {
      awareness,
      on: (n, f) => wspOnCalled.push({ n, f }),
    };

    const stdiv = pi.createAwarenessStatusWidget(wsp, win);
    expect(stdiv.classList).to.equal('collab-awareness');
    expect(stdiv.innerHTML).to.contain('<img class="collab-connection collab-icon">');
    expect(contInserted).to.deep.equal([divEl]);

    // check all 'called' arrays
    expect(winEventListeners.length).to.equal(2);
    const el0 = winEventListeners[0];
    const el1 = winEventListeners[1];
    const elOnline = el0.n === 'online' ? el0 : el1;
    const elOffline = el0.n === 'offline' ? el0 : el1;

    elOnline.f(); // Call the callback function sent to the listener
    expect(connImg.title).to.equal('online');
    elOffline.f();
    expect(connImg.title).to.equal('offline');

    expect(wspOnCalled.length).to.equal(1);
    expect(wspOnCalled[0].n).to.equal('status');
    wspOnCalled[0].f({ status: 'connected' }); // Call the callback function
    expect(connImg.title).to.equal('connected');

    // Check the awareness callback
    expect(awarenessOnCalled.length).to.equal(1);
    expect(awarenessOnCalled[0].n).to.equal('update');

    const knownUser = { user: { name: 'Joe Bloggs' } };
    awarenessStates.set(789, knownUser);
    const delta = {
      added: [123, 456, 789],
      removed: [456],
      updated: [234],
    };

    awarenessOnCalled[0].f(delta); // Call the callback function
    // Should contain 123, 234, 789
    expect(dcu.innerHTML).to.contain('alt="123"');
    expect(dcu.innerHTML).to.contain('alt="234"');
    expect(dcu.innerHTML).to.contain('class="collab-initial" title="Joe Bloggs"><p>J</p>');
    expect(dcu.innerHTML).to.not.contain('789');
  });
});
