// Global dialog management - only needed when multiple LOC nodes exist
import {
  Fragment,
  Slice,
} from 'da-y-wrapper';
import { createElement, createButton, createTooltip } from '../../utils/helpers.js';

const KEEP = 'keep';
const DELETE = 'delete';
const IGNORE = 'ignore';
const KEEP_BOTH = 'keep-both';
const KEEP_LOCAL = 'keep-local';
const KEEP_UPSTREAM = 'keep-upstream';

const NODE = {
  DELETED: 'diff_deleted',
  ADDED: 'diff_added',
};

let globalDialog = null;
export function hideGlobalDialog() {
  if (globalDialog?.parentNode) {
    const proseMirrorContainer = globalDialog.parentNode;
    proseMirrorContainer.classList.remove('has-regional-edits');
    globalDialog.classList.remove('show');
    globalDialog.remove();
  }
}

function getAllLocNodes(view, isLocNode) {
  const { doc } = view.state;
  const locNodes = [];

  doc.descendants((node, pos) => {
    if (isLocNode(node)) {
      locNodes.push({ node, pos });
    }
  });

  // Sort by position (descending) so we can process from end to beginning
  // This prevents position shifts from affecting later operations
  return locNodes.sort((a, b) => b.pos - a.pos);
}

function getNodeAction(action, nodeType) {
  if (action === KEEP_BOTH) return KEEP;
  if (action === KEEP_LOCAL && nodeType === NODE.ADDED) return KEEP;
  if (action === KEEP_UPSTREAM && nodeType === NODE.DELETED) return KEEP;
  if (action === KEEP_LOCAL && nodeType === NODE.DELETED) return DELETE;
  if (action === KEEP_UPSTREAM && nodeType === NODE.ADDED) return DELETE;
  return IGNORE;
}

function processLocNode(tr, node, pos, action, simpleFilterContent) {
  const nodeType = node.type.name;
  const nodeAction = getNodeAction(action, nodeType);

  if (nodeAction === KEEP) {
    const filteredContent = simpleFilterContent(node.content.content);
    if (filteredContent.length > 0) {
      const newFragment = Fragment.fromArray(filteredContent);
      const newSlice = new Slice(newFragment, 0, 0);
      return tr.replace(pos, pos + node.nodeSize, newSlice);
    }
    return tr.delete(pos, pos + node.nodeSize);
  }

  if (nodeAction === DELETE) {
    return tr.delete(pos, pos + node.nodeSize);
  }

  return null;
}

function processViewNodes(view, action, simpleFilterContent, isLocNode) {
  const locNodes = getAllLocNodes(view, isLocNode);
  if (locNodes.length === 0) return false;

  let { tr } = view.state;
  let hasChanges = false;

  for (const { node, pos } of locNodes) {
    try {
      const newTr = processLocNode(tr, node, pos, action, simpleFilterContent);
      if (newTr !== null) {
        tr = newTr;
        hasChanges = true;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Error processing loc node:', error);
    }
  }

  if (hasChanges) {
    view.dispatch(tr);
  }

  return hasChanges;
}

function handleGlobalAction(action, activeViews, simpleFilterContent, isLocNode) {
  activeViews.forEach((view) => processViewNodes(view, action, simpleFilterContent, isLocNode));
  hideGlobalDialog();
}

function createGlobalAction(
  type,
  text,
  action,
  tooltipText,
  activeViews,
  simpleFilterContent,
  isLocNode,
) {
  const button = createElement('div', `da-diff-btn da-diff-btn-base is-${type}`);

  const label = createElement('span', 'switch-btn da-diff-btn-base-element');
  label.textContent = text;

  const confirm = createButton('confirm-btn da-diff-btn-base-element', 'button', { 'aria-label': text });
  confirm.addEventListener('click', () => handleGlobalAction(action, activeViews, simpleFilterContent, isLocNode));
  confirm.appendChild(createTooltip(tooltipText, 'diff-tooltip'));

  button.appendChild(label);
  button.appendChild(confirm);
  return button;
}

function createGlobalOverlay(activeViews, simpleFilterContent, isLocNode) {
  const dialog = createElement('div', 'da-regional-edits-overlay');
  const actionsContainer = createElement('div', 'da-regional-edits-actions');

  const localButton = createGlobalAction('local', 'Keep All Local', KEEP_LOCAL, 'Accept All Local', activeViews, simpleFilterContent, isLocNode);
  const upstreamButton = createGlobalAction('upstream', 'Keep All Upstream', KEEP_UPSTREAM, 'Accept All Upstream', activeViews, simpleFilterContent, isLocNode);

  actionsContainer.appendChild(localButton);
  actionsContainer.appendChild(upstreamButton);
  dialog.appendChild(actionsContainer);

  return dialog;
}

function findProseMirrorContainer(view) {
  return view.dom.closest('.da-prose-mirror');
}

// eslint-disable-next-line import/prefer-default-export
export function showGlobalDialog(view, activeViews, simpleFilterContent, isLocNode) {
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
    globalDialog = createGlobalOverlay(activeViews, simpleFilterContent, isLocNode);
  }

  pmContainer.insertBefore(globalDialog, pmEl);
  pmContainer.classList.add('has-regional-edits');
  globalDialog.classList.add('show');
}
