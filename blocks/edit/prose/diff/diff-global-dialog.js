// Global dialog management - only needed when multiple LOC nodes exist
import { Slice } from 'da-y-wrapper';
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

function findListItemDepth($pos) {
  for (let { depth } = $pos; depth > 0; depth -= 1) {
    if ($pos.node(depth).type.name === 'list_item') return depth;
  }
  return null;
}

function processLocNode(tr, node, pos, action) {
  const nodeAction = getNodeAction(action, node.type.name);
  if (nodeAction === IGNORE) return null;

  const $pos = tr.doc.resolve(pos);

  if (nodeAction === KEEP) {
    if (node.content.size === 0) return tr.delete(pos, pos + node.nodeSize);

    const isInListItem = $pos.parent.type.name === 'list_item';
    const openDepth = isInListItem ? 1 : 0;
    const slice = new Slice(node.content, openDepth, openDepth);
    return tr.replace(pos, pos + node.nodeSize, slice);
  }

  const listItemDepth = findListItemDepth($pos);
  if (listItemDepth !== null) {
    return tr.delete($pos.before(listItemDepth), $pos.after(listItemDepth));
  }
  return tr.delete(pos, pos + node.nodeSize);
}

function processViewNodes(view, action, isLocNode) {
  const locNodes = getAllLocNodes(view, isLocNode);
  if (locNodes.length === 0) return false;

  let { tr } = view.state;

  locNodes.forEach(({ pos }) => {
    try {
      const mappedPos = tr.mapping.map(pos);
      const node = tr.doc.nodeAt(mappedPos);

      if (isLocNode(node)) {
        const result = processLocNode(tr, node, mappedPos, action);
        if (result) tr = result;
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Error processing loc node:', error);
    }
  });

  view.dispatch(tr);
  return true;
}

function handleGlobalAction(action, activeViews, isLocNode) {
  activeViews.forEach((view) => processViewNodes(view, action, isLocNode));
  hideGlobalDialog();
}

function createGlobalAction(
  type,
  text,
  action,
  tooltipText,
  activeViews,
  isLocNode,
) {
  const button = createElement('div', `da-diff-btn da-diff-btn-base is-${type}`);

  const label = createElement('span', 'switch-btn da-diff-btn-base-element');
  label.textContent = text;

  const confirm = createButton('confirm-btn da-diff-btn-base-element', 'button', { 'aria-label': text });
  confirm.addEventListener('click', () => handleGlobalAction(action, activeViews, isLocNode));
  confirm.appendChild(createTooltip(tooltipText, 'diff-tooltip'));

  button.appendChild(label);
  button.appendChild(confirm);
  return button;
}

function createGlobalOverlay(activeViews, isLocNode) {
  const dialog = createElement('div', 'da-regional-edits-overlay');
  const actionsContainer = createElement('div', 'da-regional-edits-actions');

  const localButton = createGlobalAction('local', 'Keep All Local', KEEP_LOCAL, 'Accept All Local', activeViews, isLocNode);
  const upstreamButton = createGlobalAction('upstream', 'Keep All Upstream', KEEP_UPSTREAM, 'Accept All Upstream', activeViews, isLocNode);

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
    globalDialog = createGlobalOverlay(activeViews, isLocNode);
  }

  pmContainer.insertBefore(globalDialog, pmEl);
  pmContainer.classList.add('has-regional-edits');
  globalDialog.classList.add('show');
}
