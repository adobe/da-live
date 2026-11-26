// Global dialog management - only needed when multiple LOC nodes exist
import { createElement, createButton, createTooltip, getDiffLabels } from '../../utils/helpers.js';
import { applyResolution, loadDiffEngine } from './diff-engine.js';

const KEEP_LOCAL = 'mine';
const KEEP_UPSTREAM = 'source';

let globalDialog = null;
export function hideGlobalDialog() {
  if (globalDialog?.parentNode) {
    const proseMirrorContainer = globalDialog.parentNode;
    proseMirrorContainer.classList.remove('has-regional-edits');
    globalDialog.classList.remove('show');
    globalDialog.remove();
  }
  globalDialog = null;
}

async function handleGlobalAction(choice, activeViews) {
  try {
    await loadDiffEngine();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Error loading the diff engine:', error);
    return;
  }
  activeViews.forEach((view) => {
    if (!view.isDestroyed) applyResolution(view, 'resolveAll', { choice });
  });
  hideGlobalDialog();
}

function createGlobalAction(
  type,
  text,
  action,
  tooltipText,
  activeViews,
) {
  const button = createElement('div', `da-diff-btn da-diff-btn-base is-${type}`);

  const label = createElement('span', 'switch-btn da-diff-btn-base-element');
  label.textContent = text;

  const confirm = createButton('nx-action-btn-icon confirm-btn da-diff-btn-base-element', 'button', { 'aria-label': text });
  confirm.addEventListener('click', () => handleGlobalAction(action, activeViews));
  confirm.appendChild(createTooltip(tooltipText, 'diff-tooltip'));

  button.appendChild(label);
  button.appendChild(confirm);
  return button;
}

function createGlobalOverlay(activeViews) {
  const dialog = createElement('div', 'da-regional-edits-overlay');
  const actionsContainer = createElement('div', 'da-regional-edits-actions');

  const labels = getDiffLabels();

  const localButton = createGlobalAction('local', `Keep All ${labels.local}`, KEEP_LOCAL, `Accept All ${labels.local}`, activeViews);
  const upstreamButton = createGlobalAction('upstream', `Keep All ${labels.upstream}`, KEEP_UPSTREAM, `Accept All ${labels.upstream}`, activeViews);

  actionsContainer.appendChild(localButton);
  actionsContainer.appendChild(upstreamButton);
  dialog.appendChild(actionsContainer);

  return dialog;
}

function findProseMirrorContainer(view) {
  return view.dom.closest('.da-prose-mirror');
}

// eslint-disable-next-line import/prefer-default-export
export function showGlobalDialog(view, activeViews) {
  if (globalDialog?.parentNode) return; // Dialog already shown

  const pmContainer = findProseMirrorContainer(view);
  if (!pmContainer) {
    // eslint-disable-next-line no-console
    console.warn('Could not find ProseMirror container for global dialog');
    return;
  }

  const pmEl = pmContainer.querySelector('.ProseMirror');
  if (!pmEl) return;

  if (!globalDialog) {
    globalDialog = createGlobalOverlay(activeViews);
  }

  pmContainer.insertBefore(globalDialog, pmEl);
  pmContainer.classList.add('has-regional-edits');
  globalDialog.classList.add('show');
}
