/* eslint-disable max-len */
/* global view */
// User action handlers - only loaded when user actually clicks action buttons

import { DOMSerializer, Fragment, Slice } from 'da-y-wrapper';
import { createElement, createButton, createTooltip, getDaMetadata, setDaMetadata } from '../../utils/helpers.js';
import prose2aem from '../../../shared/prose2aem.js';

const HASH_LENGTH = 12;
export const REJECTED_KEY = 'rejectedHashes';
export const ACCEPTED_KEY = 'acceptedHashes';

let objectHashLoaded = false;
const objHash = async (obj) => {
  if (!objectHashLoaded) {
    await import('./object_hash.js');
    objectHashLoaded = true;
  }
  return window.objectHash(obj).substring(0, HASH_LENGTH);
};

const isTableNode = (node) => (node.content?.content?.length === 3 && node.content.content[1].type.name === 'table');

function escapeHTML(str) {
  return str.replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function getOuterHTMLWithSortedAttributes(element) {
  if (!(element instanceof Element)) {
    // eslint-disable-next-line no-param-reassign
    element = new DOMParser().parseFromString(element, 'text/html').body.firstChild;
  }
  const tagName = element.tagName.toLowerCase();
  const attrs = Array.from(element.attributes)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((attr) => `${attr.name}="${escapeHTML(attr.value)}"`)
    .join(' ');
  const voidElements = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'param', 'source', 'track', 'wbr',
  ]);
  if (voidElements.has(tagName)) {
    return `<${tagName}${attrs ? ` ${attrs}` : ''}>`;
  }
  let inner = '';
  for (const child of element.childNodes) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      inner += getOuterHTMLWithSortedAttributes(child);
    } else if (child.nodeType === Node.TEXT_NODE) {
      inner += escapeHTML(child.textContent);
    } else if (child.nodeType === Node.COMMENT_NODE) {
      // Sanitize comment content to avoid '-->'
      inner += `<!--${child.textContent.replace(/-->/g, '--&gt;')}-->`;
    }
  }
  return `<${tagName}${attrs ? ` ${attrs}` : ''}>${inner}</${tagName}>`;
}

function nodeToHtml(node) {
  const serializer = DOMSerializer.fromSchema(view.state.schema);
  const fragment = serializer.serializeFragment(node.content);

  const div = document.createElement('div');
  if (isTableNode(node)) {
    div.classList.add('tableWrapper');
  }
  div.appendChild(fragment);
  const aem = prose2aem(div, true, true);
  return getOuterHTMLWithSortedAttributes(aem);
}

export const addToHashMetadata = async (node, mdKey) => {
  const hash = await objHash(nodeToHtml(node));
  const hashStr = getDaMetadata(mdKey);
  const hashes = hashStr ? new Set(hashStr.split(',')) : new Set();
  hashes.add(hash);
  setDaMetadata(mdKey, Array.from(hashes).join(','));
};

function createCompositeButton({
  label, id, handler, variant, tooltip, switchTooltip, isActive = false,
}, onSwitchTab) {
  const activeClass = isActive ? ' is-active' : '';
  const wrapper = createElement('div', `da-diff-btn da-diff-btn-base ${variant}${activeClass}`);

  const switchBtn = createButton('switch-btn da-diff-btn-base-element');
  switchBtn.textContent = label;
  switchBtn.addEventListener('click', () => onSwitchTab(id));
  if (switchTooltip) {
    switchBtn.appendChild(createTooltip(switchTooltip, 'diff-tooltip'));
  }

  const confirmBtn = createButton('confirm-btn da-diff-btn-base-element', 'button', { 'aria-label': `${tooltip}` });
  confirmBtn.addEventListener('click', handler);
  if (tooltip) {
    confirmBtn.appendChild(createTooltip(tooltip, 'diff-tooltip'));
  }

  wrapper.appendChild(switchBtn);
  wrapper.appendChild(confirmBtn);
  return wrapper;
}

export function createTabbedActions(onKeepDeleted, onKeepAdded, onKeepBoth, onSwitchTab) {
  const actionsContainer = createElement('div', 'diff-tabbed-actions loc-floating-overlay');
  const actionButtons = createElement('div', 'diff-action-buttons loc-sticky-buttons');

  const buttonConfigs = [
    {
      label: 'Local',
      id: 'added',
      handler: onKeepAdded,
      variant: 'is-local',
      tooltip: 'Accept Local',
      switchTooltip: 'View Local',
      isActive: true, // Local is the default active tab
    },
    {
      label: 'Upstream',
      id: 'deleted',
      handler: onKeepDeleted,
      variant: 'is-upstream',
      tooltip: 'Accept Upstream',
      switchTooltip: 'View Upstream',
    },
    {
      label: 'Difference',
      id: 'diff',
      handler: onKeepBoth,
      variant: 'is-diff',
      tooltip: 'Accept Both',
      switchTooltip: 'View Diff',
    },
  ];

  buttonConfigs.forEach((config) => {
    actionButtons.appendChild(createCompositeButton(config, onSwitchTab));
  });

  actionsContainer.appendChild(actionButtons);
  return actionsContainer;
}

export function handleDeleteSingleNode(view, getPos, isValidPosition, isLocNode) {
  try {
    const currentPos = getPos();
    if (!isValidPosition(currentPos)) {
      // eslint-disable-next-line no-console
      console.warn('Could not get current position for single node delete');
      return;
    }

    const { doc } = view.state;
    const resolvedPos = doc.resolve(currentPos);
    const { parent } = resolvedPos;
    const indexInParent = resolvedPos.index();
    const currentNode = parent.child(indexInParent);

    if (!isLocNode(currentNode)) {
      // eslint-disable-next-line no-console
      console.warn('Current node is not a loc node');
      return;
    }

    addToHashMetadata(currentNode, REJECTED_KEY);

    // Check if parent is a list item for special handling
    if (resolvedPos.parent.type.name === 'list_item') {
      const parentPos = resolvedPos.before(resolvedPos.depth);
      const transaction = view.state.tr.delete(
        parentPos,
        parentPos + resolvedPos.parent.nodeSize,
      );
      view.dispatch(transaction);
    } else {
      const transaction = view.state.tr.delete(
        currentPos,
        currentPos + currentNode.nodeSize,
      );
      view.dispatch(transaction);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Error deleting single loc node:', error);
  }
}

export function handleKeepSingleNode(view, getPos, isValidPosition, isLocNode, filterNodeContent, dispatchContentTransaction) {
  try {
    const currentPos = getPos();
    if (!isValidPosition(currentPos)) {
      // eslint-disable-next-line no-console
      console.warn('Could not get current position for single node keep');
      return;
    }

    const { doc } = view.state;
    const resolvedPos = doc.resolve(currentPos);
    const { parent } = resolvedPos;
    const indexInParent = resolvedPos.index();
    const currentNode = parent.child(indexInParent);

    if (!isLocNode(currentNode)) {
      // eslint-disable-next-line no-console
      console.warn('Current node is not a loc node');
      return;
    }

    addToHashMetadata(currentNode, ACCEPTED_KEY);

    // Use the improved content filtering like the tabbed interface
    const filteredContent = filterNodeContent(currentNode);
    dispatchContentTransaction(
      currentPos,
      currentPos + currentNode.nodeSize,
      filteredContent,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Error keeping single loc node:', error);
  }
}

export function getCurrentLocNodePair(view, getPos, isValidPosition, isLocNode, canFormLocPair) {
  try {
    const currentPos = getPos();
    if (!isValidPosition(currentPos)) {
      return null;
    }

    const { doc } = view.state;
    const resolvedPos = doc.resolve(currentPos);
    const { parent } = resolvedPos;
    const indexInParent = resolvedPos.index();

    // Get the node at current position
    const currentNode = parent.child(indexInParent);
    if (!isLocNode(currentNode)) {
      return null;
    }

    // Check if there's a next sibling that forms a pair
    if (indexInParent < parent.childCount - 1) {
      const nextSibling = parent.child(indexInParent + 1);

      if (canFormLocPair(currentNode, nextSibling)) {
        // We have a valid pair
        if (currentNode.type.name === 'diff_deleted') {
          return {
            deletedPos: currentPos,
            addedPos: currentPos + currentNode.nodeSize,
            deletedNode: currentNode,
            addedNode: nextSibling,
          };
        }
        return {
          addedPos: currentPos,
          deletedPos: currentPos + currentNode.nodeSize,
          addedNode: currentNode,
          deletedNode: nextSibling,
        };
      }
    }

    return null;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Error getting current loc node pair:', error);
    return null;
  }
}

export function getPairRange(pair) {
  const { deletedPos, addedPos, deletedNode, addedNode } = pair;
  return {
    startPos: Math.min(deletedPos, addedPos),
    endPos: Math.max(
      deletedPos + deletedNode.nodeSize,
      addedPos + addedNode.nodeSize,
    ),
  };
}

function handleOperation(context, { acceptAdded, acceptDeleted, getContent }) {
  const {
    view,
    getPos,
    isValidPosition,
    isLocNode,
    canFormLocPair,
    filterNodeContent,
    dispatchContentTransaction,
  } = context;

  const currentPair = getCurrentLocNodePair(view, getPos, isValidPosition, isLocNode, canFormLocPair);
  if (!currentPair) {
    // eslint-disable-next-line no-console
    console.warn('Could not find current loc node pair');
    return;
  }

  const { addedNode, deletedNode } = currentPair;

  // Update metadata based on which nodes are accepted/rejected
  addToHashMetadata(addedNode, acceptAdded ? ACCEPTED_KEY : REJECTED_KEY);
  addToHashMetadata(deletedNode, acceptDeleted ? ACCEPTED_KEY : REJECTED_KEY);

  const content = getContent({ addedNode, deletedNode, filterNodeContent });
  const { startPos, endPos } = getPairRange(currentPair);

  dispatchContentTransaction(startPos, endPos, content);
}

export async function handleKeepDeleted(context) {
  const { filterNodeContent } = context;
  handleOperation(context, {
    acceptAdded: false,
    acceptDeleted: true,
    getContent: ({ deletedNode }) => filterNodeContent(deletedNode),
  });
}

export function handleKeepAdded(context) {
  const { filterNodeContent } = context;
  handleOperation(context, {
    acceptAdded: true,
    acceptDeleted: false,
    getContent: ({ addedNode }) => filterNodeContent(addedNode),
  });
}

export function handleKeepBoth(context) {
  const { filterNodeContent } = context;
  handleOperation(context, {
    acceptAdded: true,
    acceptDeleted: true,
    getContent: ({ deletedNode, addedNode }) => {
      const deletedContent = filterNodeContent(deletedNode);
      const addedContent = filterNodeContent(addedNode);
      return [...deletedContent, ...addedContent];
    },
  });
}

export function applyKeepOperation(tr, node, pos, simpleFilterContent) {
  const filteredContent = simpleFilterContent(node.content.content);
  if (filteredContent.length > 0) {
    const newFragment = Fragment.fromArray(filteredContent);
    const newSlice = new Slice(newFragment, 0, 0);
    tr.replace(pos, pos + node.nodeSize, newSlice);
  } else {
    tr.delete(pos, pos + node.nodeSize);
  }
}
