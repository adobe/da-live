// Overlay UI creation - only needed when user interacts with LOC elements

export function getCoverDiv(upstream, createElement, LOC_COLORS) {
  const className = `loc-color-overlay ${upstream ? 'loc-langstore' : 'loc-regional'}`;
  const coverDiv = createElement('div', className, { 'loc-temp-dom': '' });

  coverDiv.style.backgroundColor = upstream ? LOC_COLORS.UPSTREAM : LOC_COLORS.LOCAL;
  return coverDiv;
}

export function getLangOverlay(upstream, createElement, createButton, createTooltip, LOC_TEXT) {
  const overlay = createElement('div', 'loc-lang-overlay loc-floating-overlay', { 'loc-temp-dom': '' });

  const type = upstream ? 'upstream' : 'local';
  const text = upstream ? LOC_TEXT.UPSTREAM : LOC_TEXT.LOCAL;

  const compositeBtn = createElement('div', `loc-composite-btn-3part loc-composite-btn-base loc-sticky-buttons is-${type}`);

  const labelBtn = createElement('span', 'loc-composite-label loc-composite-btn-base-element');
  labelBtn.textContent = text;

  const acceptBtn = createButton('loc-composite-accept loc-composite-btn-base-element', 'button', { 'aria-label': `Accept ${text}` });
  acceptBtn.appendChild(createTooltip(`Accept ${text}`));

  const deleteBtn = createButton('loc-composite-delete loc-composite-btn-base-element', 'button', { 'aria-label': `Delete ${text}` });
  deleteBtn.appendChild(createTooltip(`Delete ${text}`));

  compositeBtn.appendChild(labelBtn);
  compositeBtn.appendChild(acceptBtn);
  compositeBtn.appendChild(deleteBtn);
  overlay.appendChild(compositeBtn);

  return { overlay, deleteBtn, keepBtn: acceptBtn };
}
