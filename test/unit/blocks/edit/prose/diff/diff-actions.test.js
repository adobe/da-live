import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createTabbedActions } from '../../../../../../blocks/edit/prose/diff/diff-actions.js';
import {
  getDaMetadata,
  setDaMetadata,
  initDaMetadata,
} from '../../../../../../blocks/edit/utils/helpers.js';

describe('diff-actions - createTabbedActions', () => {
  function render(onKeepDeleted, onKeepAdded, onKeepBoth, onSwitchTab) {
    const container = createTabbedActions(onKeepDeleted, onKeepAdded, onKeepBoth, onSwitchTab);
    document.body.appendChild(container);
    return container;
  }

  it('renders container and three composite action buttons with correct classes and labels', () => {
    const spies = {
      onKeepDeleted: sinon.spy(),
      onKeepAdded: sinon.spy(),
      onKeepBoth: sinon.spy(),
      onSwitchTab: sinon.spy(),
    };

    const container = render(
      spies.onKeepDeleted,
      spies.onKeepAdded,
      spies.onKeepBoth,
      spies.onSwitchTab,
    );

    expect(container.className).to.equal('diff-tabbed-actions loc-floating-overlay');
    const actionButtons = container.querySelector('.diff-action-buttons.loc-sticky-buttons');
    expect(actionButtons).to.exist;

    const wrappers = [...actionButtons.querySelectorAll('.da-diff-btn.da-diff-btn-base')];
    expect(wrappers.length).to.equal(3);

    const [localWrap, upstreamWrap, diffWrap] = wrappers;

    expect(localWrap.classList.contains('is-local')).to.be.true;
    expect(localWrap.classList.contains('is-active')).to.be.true;
    expect(upstreamWrap.classList.contains('is-upstream')).to.be.true;
    expect(upstreamWrap.classList.contains('is-active')).to.be.false;
    expect(diffWrap.classList.contains('is-diff')).to.be.true;
    expect(diffWrap.classList.contains('is-active')).to.be.false;

    const labels = wrappers.map((w) => {
      const switchBtn = w.querySelector('.switch-btn');
      const textNode = [...switchBtn.childNodes].find((n) => n.nodeType === Node.TEXT_NODE);
      return textNode?.textContent.trim();
    });
    expect(labels).to.deep.equal(['Local', 'Upstream', 'Difference']);
  });

  it('attaches tooltips and aria-labels correctly to switch and confirm buttons', () => {
    const container = render(sinon.spy(), sinon.spy(), sinon.spy(), sinon.spy());
    const wrappers = [...container.querySelectorAll('.da-diff-btn.da-diff-btn-base')];

    const expected = [
      { variant: 'is-local', switchTip: 'View Local', confirmAria: 'Accept Local' },
      { variant: 'is-upstream', switchTip: 'View Upstream', confirmAria: 'Accept Upstream' },
      { variant: 'is-diff', switchTip: 'View Diff', confirmAria: 'Accept Both' },
    ];

    wrappers.forEach((wrap, idx) => {
      expect(wrap.classList.contains(expected[idx].variant)).to.be.true;

      const switchBtn = wrap.querySelector('.switch-btn.da-diff-btn-base-element');
      const confirmBtn = wrap.querySelector('.confirm-btn.da-diff-btn-base-element');

      expect(switchBtn).to.exist;
      expect(confirmBtn).to.exist;

      const switchTip = switchBtn.querySelector('.diff-tooltip');
      const confirmTip = confirmBtn.querySelector('.diff-tooltip');
      expect(switchTip?.textContent).to.equal(expected[idx].switchTip);
      expect(confirmTip?.textContent).to.equal(expected[idx].confirmAria);

      expect(confirmBtn.getAttribute('aria-label')).to.equal(expected[idx].confirmAria);
    });
  });

  it('wires confirm buttons to the provided keep handlers', () => {
    const onKeepDeleted = sinon.spy();
    const onKeepAdded = sinon.spy();
    const onKeepBoth = sinon.spy();
    const onSwitchTab = sinon.spy();
    const container = render(onKeepDeleted, onKeepAdded, onKeepBoth, onSwitchTab);

    const wrappers = [...container.querySelectorAll('.da-diff-btn.da-diff-btn-base')];
    const [localWrap, upstreamWrap, diffWrap] = wrappers;

    localWrap.querySelector('.confirm-btn').click();
    upstreamWrap.querySelector('.confirm-btn').click();
    diffWrap.querySelector('.confirm-btn').click();

    expect(onKeepAdded.calledOnce).to.be.true;
    expect(onKeepDeleted.calledOnce).to.be.true;
    expect(onKeepBoth.calledOnce).to.be.true;
    expect(onSwitchTab.called).to.be.false;
  });

  it('wires switch buttons to onSwitchTab with correct tab ids', () => {
    const spies = {
      onKeepDeleted: sinon.spy(),
      onKeepAdded: sinon.spy(),
      onKeepBoth: sinon.spy(),
      onSwitchTab: sinon.spy(),
    };

    const container = render(
      spies.onKeepDeleted,
      spies.onKeepAdded,
      spies.onKeepBoth,
      spies.onSwitchTab,
    );

    const wrappers = [...container.querySelectorAll('.da-diff-btn.da-diff-btn-base')];
    const ids = ['added', 'deleted', 'diff'];
    wrappers.forEach((wrap, idx) => {
      wrap.querySelector('.switch-btn').click();
      expect(spies.onSwitchTab.getCall(idx).args[0]).to.equal(ids[idx]);
    });

    expect(spies.onSwitchTab.callCount).to.equal(3);
  });
});

describe('diff-actions - hash tracking metadata', () => {
  let mockMap;

  beforeEach(() => {
    // Create a simple mock for Y.Map
    const storage = new Map();
    mockMap = {
      get: (key) => storage.get(key) || null,
      set: (key, value) => storage.set(key, value),
      delete: (key) => storage.delete(key),
      entries: () => storage.entries(),
      [Symbol.iterator]: () => storage.entries(),
    };
    initDaMetadata(mockMap);

    // Mock global view and window.objectHash
    window.view = {
      state: {
        schema: { nodes: {} },
        doc: {
          resolve: () => ({
            parent: { type: { name: 'paragraph' } },
            before: () => 0,
          }),
        },
      },
      dispatch: sinon.spy(),
    };

    // Mock objectHash
    window.objectHash = (obj) => {
      // Simple hash function for testing
      const str = typeof obj === 'string' ? obj : JSON.stringify(obj);
      let hash = 0;
      for (let i = 0; i < str.length; i += 1) {
        const char = str.charCodeAt(i);
        // eslint-disable-next-line no-bitwise
        hash = ((hash << 5) - hash) + char;
        // eslint-disable-next-line no-bitwise
        hash &= hash;
      }
      return Math.abs(hash).toString(16).padStart(12, '0');
    };
  });

  afterEach(() => {
    delete window.view;
    delete window.objectHash;
  });

  it('Tracks metadata keys for accepted and rejected hashes', () => {
    // Initially, no hashes should be stored
    expect(getDaMetadata('acceptedHashes')).to.be.null;
    expect(getDaMetadata('rejectedHashes')).to.be.null;

    // Set some hashes
    setDaMetadata('acceptedHashes', 'abc123,def456');
    setDaMetadata('rejectedHashes', 'ghi789');

    // Verify they are stored correctly
    expect(getDaMetadata('acceptedHashes')).to.equal('abc123,def456');
    expect(getDaMetadata('rejectedHashes')).to.equal('ghi789');
  });

  it('Appends new hashes to existing metadata', () => {
    // Set initial hash
    setDaMetadata('acceptedHashes', 'hash1');
    expect(getDaMetadata('acceptedHashes')).to.equal('hash1');

    // Simulate adding another hash
    const existing = getDaMetadata('acceptedHashes');
    const hashes = new Set(existing.split(','));
    hashes.add('hash2');
    setDaMetadata('acceptedHashes', Array.from(hashes).join(','));

    expect(getDaMetadata('acceptedHashes')).to.equal('hash1,hash2');
  });

  it('Does not duplicate hashes in metadata', () => {
    setDaMetadata('acceptedHashes', 'hash1,hash2');

    // Try to add hash1 again
    const existing = getDaMetadata('acceptedHashes');
    const hashes = new Set(existing.split(','));
    hashes.add('hash1'); // This should not add a duplicate
    hashes.add('hash3');
    setDaMetadata('acceptedHashes', Array.from(hashes).join(','));

    const final = getDaMetadata('acceptedHashes');
    const finalHashes = final.split(',');
    expect(finalHashes.length).to.equal(3);
    expect(finalHashes).to.include('hash1');
    expect(finalHashes).to.include('hash2');
    expect(finalHashes).to.include('hash3');
  });

  it('Handles empty metadata gracefully', () => {
    const hashStr = getDaMetadata('acceptedHashes');
    const hashes = hashStr ? new Set(hashStr.split(',')) : new Set();
    hashes.add('first-hash');
    setDaMetadata('acceptedHashes', Array.from(hashes).join(','));

    expect(getDaMetadata('acceptedHashes')).to.equal('first-hash');
  });

  it('Can clear all hashes by setting to null', () => {
    setDaMetadata('acceptedHashes', 'hash1,hash2,hash3');
    expect(getDaMetadata('acceptedHashes')).to.equal('hash1,hash2,hash3');

    setDaMetadata('acceptedHashes', null);
    expect(getDaMetadata('acceptedHashes')).to.be.null;
  });

  it('Maintains separate storage for accepted and rejected hashes', () => {
    setDaMetadata('acceptedHashes', 'accepted1,accepted2');
    setDaMetadata('rejectedHashes', 'rejected1,rejected2');

    expect(getDaMetadata('acceptedHashes')).to.equal('accepted1,accepted2');
    expect(getDaMetadata('rejectedHashes')).to.equal('rejected1,rejected2');

    // Clearing one should not affect the other
    setDaMetadata('acceptedHashes', null);
    expect(getDaMetadata('acceptedHashes')).to.be.null;
    expect(getDaMetadata('rejectedHashes')).to.equal('rejected1,rejected2');
  });
});
