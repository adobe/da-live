import { createElement, createButton, createTooltip } from '../../utils/helpers.js';

const LOC_TEXT = {
  UPSTREAM: 'Upstream',
  LOCAL: 'Local',
  DIFF: 'Difference',
};

export function getCoverDiv(upstream, LOC_COLORS) {
  const className = `loc-color-overlay ${upstream ? 'loc-langstore' : 'loc-regional'}`;
  const coverDiv = createElement('div', className, { 'loc-temp-dom': '' });

  coverDiv.style.backgroundColor = upstream ? LOC_COLORS.UPSTREAM : LOC_COLORS.LOCAL;
  return coverDiv;
}

export function getLangOverlay(upstream) {
  const overlay = createElement('div', 'loc-lang-overlay loc-floating-overlay', { 'loc-temp-dom': '' });

  const type = upstream ? 'upstream' : 'local';
  const text = upstream ? LOC_TEXT.UPSTREAM : LOC_TEXT.LOCAL;

  const compositeBtn = createElement('div', `da-diff-btn-3part da-diff-btn-base loc-sticky-buttons is-${type}`);

  const labelBtn = createElement('span', 'diff-label da-diff-btn-base-element');
  labelBtn.textContent = text;

  const acceptBtn = createButton('diff-accept da-diff-btn-base-element', 'button', { 'aria-label': `Accept ${text}` });
  acceptBtn.appendChild(createTooltip(`Accept ${text}`, 'diff-tooltip'));

  const deleteBtn = createButton('diff-delete da-diff-btn-base-element', 'button', { 'aria-label': `Delete ${text}` });
  deleteBtn.appendChild(createTooltip(`Delete ${text}`, 'diff-tooltip'));

  compositeBtn.appendChild(labelBtn);
  compositeBtn.appendChild(acceptBtn);
  compositeBtn.appendChild(deleteBtn);
  overlay.appendChild(compositeBtn);

  return { overlay, deleteBtn, keepBtn: acceptBtn };
}
