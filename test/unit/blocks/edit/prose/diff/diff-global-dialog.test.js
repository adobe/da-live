/* eslint-disable max-len */
import { expect } from '@esm-bundle/chai';
import { showGlobalDialog, hideGlobalDialog } from '../../../../../../blocks/edit/prose/diff/diff-global-dialog.js';
import {
  setDaMetadata,
  initDaMetadata,
} from '../../../../../../blocks/edit/utils/helpers.js';

describe('diff-global-dialog - createGlobalOverlay', () => {
  let mockMap;
  let mockView;
  let proseMirrorContainer;

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

    // Create mock ProseMirror container
    proseMirrorContainer = document.createElement('div');
    proseMirrorContainer.className = 'da-prose-mirror';
    const pmEl = document.createElement('div');
    pmEl.className = 'ProseMirror';
    proseMirrorContainer.appendChild(pmEl);
    document.body.appendChild(proseMirrorContainer);

    // Create mock view
    mockView = {
      dom: {
        closest: (selector) => {
          if (selector === '.da-prose-mirror') return proseMirrorContainer;
          return null;
        },
      },
      state: { doc: { descendants: () => {} } },
    };
  });

  afterEach(() => {
    hideGlobalDialog();
    proseMirrorContainer.remove();
  });

  function getDialogButtons() {
    const dialog = proseMirrorContainer.querySelector('.da-regional-edits-overlay');
    if (!dialog) return null;

    const localBtn = dialog.querySelector('.da-diff-btn.is-local');
    const upstreamBtn = dialog.querySelector('.da-diff-btn.is-upstream');

    return { dialog, localBtn, upstreamBtn };
  }

  it('creates dialog with default labels', () => {
    const activeViews = new Set([mockView]);
    const isLocNode = () => false;

    showGlobalDialog(mockView, activeViews, () => [], isLocNode);

    const { dialog, localBtn, upstreamBtn } = getDialogButtons();

    expect(dialog).to.exist;
    expect(dialog.classList.contains('da-regional-edits-overlay')).to.be.true;

    const localLabel = localBtn.querySelector('.switch-btn');
    const upstreamLabel = upstreamBtn.querySelector('.switch-btn');

    expect(localLabel.textContent).to.equal('Keep All Local');
    expect(upstreamLabel.textContent).to.equal('Keep All Upstream');
  });

  it('creates dialog with custom labels from metadata', () => {
    setDaMetadata('diff-label-local', 'Regional');
    setDaMetadata('diff-label-upstream', 'Langstore');

    const activeViews = new Set([mockView]);
    const isLocNode = () => false;

    showGlobalDialog(mockView, activeViews, () => [], isLocNode);

    const { localBtn, upstreamBtn } = getDialogButtons();

    const localLabel = localBtn.querySelector('.switch-btn');
    const upstreamLabel = upstreamBtn.querySelector('.switch-btn');

    expect(localLabel.textContent).to.equal('Keep All Regional');
    expect(upstreamLabel.textContent).to.equal('Keep All Langstore');
  });

  it('uses custom labels in tooltips', () => {
    setDaMetadata('diff-label-local', 'My Local');
    setDaMetadata('diff-label-upstream', 'My Upstream');

    const activeViews = new Set([mockView]);
    const isLocNode = () => false;

    showGlobalDialog(mockView, activeViews, () => [], isLocNode);

    const { localBtn, upstreamBtn } = getDialogButtons();

    const localTooltip = localBtn.querySelector('.diff-tooltip');
    const upstreamTooltip = upstreamBtn.querySelector('.diff-tooltip');

    expect(localTooltip.textContent).to.equal('Accept All My Local');
    expect(upstreamTooltip.textContent).to.equal('Accept All My Upstream');
  });

  it('adds has-regional-edits class to container when shown', () => {
    const activeViews = new Set([mockView]);
    const isLocNode = () => false;

    showGlobalDialog(mockView, activeViews, () => [], isLocNode);

    expect(proseMirrorContainer.classList.contains('has-regional-edits')).to.be.true;
  });

  it('removes has-regional-edits class when hidden', () => {
    const activeViews = new Set([mockView]);
    const isLocNode = () => false;

    showGlobalDialog(mockView, activeViews, () => [], isLocNode);
    expect(proseMirrorContainer.classList.contains('has-regional-edits')).to.be.true;

    hideGlobalDialog();
    expect(proseMirrorContainer.classList.contains('has-regional-edits')).to.be.false;
  });

  it('does not create duplicate dialogs', () => {
    const activeViews = new Set([mockView]);
    const isLocNode = () => false;

    showGlobalDialog(mockView, activeViews, () => [], isLocNode);
    showGlobalDialog(mockView, activeViews, () => [], isLocNode);

    const dialogs = proseMirrorContainer.querySelectorAll('.da-regional-edits-overlay');
    expect(dialogs.length).to.equal(1);
  });
});
