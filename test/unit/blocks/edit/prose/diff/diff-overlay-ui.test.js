import { expect } from '@esm-bundle/chai';
import { getCoverDiv, getLangOverlay } from '../../../../../../blocks/edit/prose/diff/diff-overlay-ui.js';
import { initDaMetadata, setDaMetadata, getDiffLabels } from '../../../../../../blocks/edit/utils/helpers.js';

describe('diff-overlay-ui - getDiffLabels', () => {
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
  });

  it('returns default labels when no metadata is set', () => {
    const labels = getDiffLabels();
    expect(labels.local).to.equal('Local');
    expect(labels.upstream).to.equal('Upstream');
  });

  it('returns custom local label from metadata', () => {
    setDaMetadata('diff-label-local', 'Regional');
    const labels = getDiffLabels();
    expect(labels.local).to.equal('Regional');
    expect(labels.upstream).to.equal('Upstream');
  });

  it('returns custom upstream label from metadata', () => {
    setDaMetadata('diff-label-upstream', 'Langstore');
    const labels = getDiffLabels();
    expect(labels.local).to.equal('Local');
    expect(labels.upstream).to.equal('Langstore');
  });

  it('returns both custom labels from metadata', () => {
    setDaMetadata('diff-label-local', 'My Local');
    setDaMetadata('diff-label-upstream', 'My Upstream');
    const labels = getDiffLabels();
    expect(labels.local).to.equal('My Local');
    expect(labels.upstream).to.equal('My Upstream');
  });

  it('falls back to default when metadata is empty string', () => {
    setDaMetadata('diff-label-local', '');
    setDaMetadata('diff-label-upstream', '');
    const labels = getDiffLabels();
    expect(labels.local).to.equal('Local');
    expect(labels.upstream).to.equal('Upstream');
  });
});

describe('diff-overlay-ui - getCoverDiv', () => {
  const LOC_COLORS = { UPSTREAM: 'rgb(1, 2, 3)', LOCAL: 'rgb(4, 5, 6)' };

  it('creates upstream overlay with correct class, attribute, and color', () => {
    const cover = getCoverDiv(true, LOC_COLORS);
    expect(cover).to.exist;
    expect(cover.tagName).to.equal('DIV');
    expect(cover.className).to.equal('loc-color-overlay loc-langstore');
    expect(cover.getAttribute('loc-temp-dom')).to.equal('');
    expect(cover.style.backgroundColor).to.equal('rgb(1, 2, 3)');
  });

  it('creates local overlay with correct class, attribute, and color', () => {
    const cover = getCoverDiv(false, LOC_COLORS);
    expect(cover).to.exist;
    expect(cover.tagName).to.equal('DIV');
    expect(cover.className).to.equal('loc-color-overlay loc-regional');
    expect(cover.getAttribute('loc-temp-dom')).to.equal('');
    expect(cover.style.backgroundColor).to.equal('rgb(4, 5, 6)');
  });
});

describe('diff-overlay-ui - getLangOverlay', () => {
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
  });

  function assertCommonStructure({ overlay }, type, labelText) {
    expect(overlay).to.exist;
    expect(overlay.classList.contains('loc-lang-overlay')).to.be.true;
    expect(overlay.classList.contains('loc-floating-overlay')).to.be.true;

    const composite = overlay.querySelector('.da-diff-btn-3part.da-diff-btn-base.loc-sticky-buttons');
    expect(composite).to.exist;
    expect(composite.classList.contains(`is-${type}`)).to.be.true;

    const label = composite.querySelector('.diff-label.da-diff-btn-base-element');
    expect(label).to.exist;
    expect(label.textContent).to.equal(labelText);

    const acceptBtn = composite.querySelector('.diff-accept.da-diff-btn-base-element');
    const deleteBtn = composite.querySelector('.diff-delete.da-diff-btn-base-element');
    expect(acceptBtn).to.exist;
    expect(deleteBtn).to.exist;

    expect(acceptBtn.getAttribute('type')).to.equal('button');
    expect(deleteBtn.getAttribute('type')).to.equal('button');

    expect(acceptBtn.getAttribute('aria-label')).to.equal(`Accept ${labelText}`);
    expect(deleteBtn.getAttribute('aria-label')).to.equal(`Delete ${labelText}`);

    const acceptTip = acceptBtn.querySelector('.diff-tooltip');
    const deleteTip = deleteBtn.querySelector('.diff-tooltip');
    expect(acceptTip?.textContent).to.equal(`Accept ${labelText}`);
    expect(deleteTip?.textContent).to.equal(`Delete ${labelText}`);
  }

  it('returns upstream overlay with correct structure and references', () => {
    const result = getLangOverlay(true);
    document.body.appendChild(result.overlay);

    assertCommonStructure(result, 'upstream', 'Upstream');

    const composite = result.overlay.querySelector('.da-diff-btn-3part');
    const acceptBtn = composite.querySelector('.diff-accept');
    const deleteBtn = composite.querySelector('.diff-delete');
    expect(result.keepBtn).to.equal(acceptBtn);
    expect(result.deleteBtn).to.equal(deleteBtn);
  });

  it('returns local overlay with correct structure and references', () => {
    const result = getLangOverlay(false);
    document.body.appendChild(result.overlay);

    assertCommonStructure(result, 'local', 'Local');

    const composite = result.overlay.querySelector('.da-diff-btn-3part');
    const acceptBtn = composite.querySelector('.diff-accept');
    const deleteBtn = composite.querySelector('.diff-delete');
    expect(result.keepBtn).to.equal(acceptBtn);
    expect(result.deleteBtn).to.equal(deleteBtn);
  });

  it('returns upstream overlay with custom label from metadata', () => {
    setDaMetadata('diff-label-upstream', 'Langstore');
    const result = getLangOverlay(true);
    document.body.appendChild(result.overlay);

    assertCommonStructure(result, 'upstream', 'Langstore');
  });

  it('returns local overlay with custom label from metadata', () => {
    setDaMetadata('diff-label-local', 'Regional');
    const result = getLangOverlay(false);
    document.body.appendChild(result.overlay);

    assertCommonStructure(result, 'local', 'Regional');
  });
});
