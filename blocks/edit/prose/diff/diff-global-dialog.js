// Global dialog management - only needed when multiple LOC nodes exist
import {
  Fragment,
  Slice,
} from 'da-y-wrapper';
import { createElement, createButton, createTooltip } from '../../utils/helpers.js';

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

function shouldKeepNode(action, nodeType) {
  return (action === 'keep-local' && nodeType === 'loc_added')
    || (action === 'keep-upstream' && nodeType === 'loc_deleted')
    || (action === 'keep-both');
}

function shouldDeleteNode(action, nodeType) {
  return (action === 'keep-local' && nodeType === 'loc_deleted')
    || (action === 'keep-upstream' && nodeType === 'loc_added');
}

function handleGlobalAction(action, activeViews, simpleFilterContent, hideGlobalDialog, isLocNode) {
  activeViews.forEach((view) => {
    const locNodes = getAllLocNodes(view, isLocNode);

    if (locNodes.length === 0) return;

    let { tr } = view.state;
    let hasChanges = false;

    for (const { node, pos } of locNodes) {
      try {
        const nodeType = node.type.name;

        if (shouldKeepNode(action, nodeType)) {
          const filteredContent = simpleFilterContent(node.content.content);
          if (filteredContent.length > 0) {
            const newFragment = Fragment.fromArray(filteredContent);
            const newSlice = new Slice(newFragment, 0, 0);
            tr = tr.replace(pos, pos + node.nodeSize, newSlice);
          } else {
            tr = tr.delete(pos, pos + node.nodeSize);
          }
          hasChanges = true;
        } else if (shouldDeleteNode(action, nodeType)) {
          tr = tr.delete(pos, pos + node.nodeSize);
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
  });

  hideGlobalDialog();
}

function createGlobalAction(type, text, action, tooltipText, activeViews, simpleFilterContent, hideGlobalDialog, isLocNode) {
  const button = createElement('div', `da-diff-btn da-diff-btn-base is-${type}`);

  const label = createElement('span', 'switch-btn da-diff-btn-base-element');
  label.textContent = text;

  const confirm = createButton('confirm-btn da-diff-btn-base-element', 'button', { 'aria-label': text });
  confirm.addEventListener('click', () => handleGlobalAction(action, activeViews, simpleFilterContent, hideGlobalDialog, isLocNode));
  confirm.appendChild(createTooltip(tooltipText, 'diff-tooltip'));

  button.appendChild(label);
  button.appendChild(confirm);
  return button;
}

function createGlobalOverlay(activeViews, simpleFilterContent, hideGlobalDialog, isLocNode) {
  const dialog = createElement('div', 'da-regional-edits-overlay');
  const actionsContainer = createElement('div', 'da-regional-edits-actions');

  const localButton = createGlobalAction('local', 'Keep All Local', 'keep-local', 'Accept All Local', activeViews, simpleFilterContent, hideGlobalDialog, isLocNode);
  const upstreamButton = createGlobalAction('upstream', 'Keep All Upstream', 'keep-upstream', 'Accept All Upstream', activeViews, simpleFilterContent, hideGlobalDialog, isLocNode);

  actionsContainer.appendChild(localButton);
  actionsContainer.appendChild(upstreamButton);
  dialog.appendChild(actionsContainer);

  return dialog;
}

// TODO: Directly find using querySelector
function findProseMirrorContainer(view) {
  let element = view.dom;
  while (element && !element.classList.contains('da-prose-mirror')) {
    element = element.parentElement;
  }
  return element;
}

let globalDialog = null;

export function hideGlobalDialog() {
  if (globalDialog?.parentNode) {
    const proseMirrorContainer = globalDialog.parentNode;
    proseMirrorContainer.classList.remove('has-regional-edits');
    globalDialog.classList.remove('show');
    globalDialog.remove();
  }
}

export function showGlobalDialog(view, activeViews, simpleFilterContent, isLocNode) {
  if (globalDialog?.parentNode) {
    return; // Dialog already shown
  }

  const pmContainer = findProseMirrorContainer(view);
  if (!pmContainer) {
    // eslint-disable-next-line no-console
    console.warn('Could not find ProseMirror container for global dialog');
    return;
  }

  if (!globalDialog) {
    globalDialog = createGlobalOverlay(
      activeViews,
      simpleFilterContent,
      hideGlobalDialog,
      isLocNode,
    );
  }

  const pmEl = pmContainer.querySelector('.ProseMirror');
  if (pmEl) {
    pmContainer.insertBefore(globalDialog, pmEl);
    pmContainer.classList.add('has-regional-edits');
    globalDialog.classList.add('show');
  }
}
