/* eslint-disable max-len */
import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { createTabbedActions } from '../../../../../../blocks/edit/prose/diff/diff-actions.js';

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

    const container = render(spies.onKeepDeleted, spies.onKeepAdded, spies.onKeepBoth, spies.onSwitchTab);

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

    const container = render(spies.onKeepDeleted, spies.onKeepAdded, spies.onKeepBoth, spies.onSwitchTab);

    const wrappers = [...container.querySelectorAll('.da-diff-btn.da-diff-btn-base')];
    const ids = ['added', 'deleted', 'diff'];
    wrappers.forEach((wrap, idx) => {
      wrap.querySelector('.switch-btn').click();
      expect(spies.onSwitchTab.getCall(idx).args[0]).to.equal(ids[idx]);
    });

    expect(spies.onSwitchTab.callCount).to.equal(3);
  });
});
