/* eslint-disable max-len */
// User action handlers - only loaded when user actually clicks action buttons

import { Fragment, Slice } from 'da-y-wrapper';
import { createElement, createButton, createTooltip } from '../../utils/helpers.js';

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
        if (currentNode.type.name === 'loc_deleted') {
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

export function handleKeepDeleted(view, getPos, isValidPosition, isLocNode, canFormLocPair, filterNodeContent, dispatchContentTransaction) {
  const currentPair = getCurrentLocNodePair(view, getPos, isValidPosition, isLocNode, canFormLocPair);
  if (!currentPair) {
    // eslint-disable-next-line no-console
    console.warn('Could not find current loc node pair');
    return;
  }

  const { deletedNode: currentDeletedNode } = currentPair;

  const filteredContent = filterNodeContent(currentDeletedNode);
  const { startPos, endPos } = getPairRange(currentPair);

  dispatchContentTransaction(startPos, endPos, filteredContent);
}

export function handleKeepAdded(view, getPos, isValidPosition, isLocNode, canFormLocPair, filterNodeContent, dispatchContentTransaction) {
  const currentPair = getCurrentLocNodePair(view, getPos, isValidPosition, isLocNode, canFormLocPair);
  if (!currentPair) {
    // eslint-disable-next-line no-console
    console.warn('Could not find current loc node pair');
    return;
  }

  const { addedNode: currentAddedNode } = currentPair;

  const filteredContent = filterNodeContent(currentAddedNode);
  const { startPos, endPos } = getPairRange(currentPair);

  dispatchContentTransaction(startPos, endPos, filteredContent);
}

export function handleKeepBoth(view, getPos, isValidPosition, isLocNode, canFormLocPair, filterNodeContent, dispatchContentTransaction) {
  const currentPair = getCurrentLocNodePair(view, getPos, isValidPosition, isLocNode, canFormLocPair);
  if (!currentPair) {
    // eslint-disable-next-line no-console
    console.warn('Could not find current loc node pair');
    return;
  }

  const {
    deletedNode: currentDeletedNode,
    addedNode: currentAddedNode,
  } = currentPair;

  const deletedContent = filterNodeContent(currentDeletedNode);
  const addedContent = filterNodeContent(currentAddedNode);
  const combinedContent = [...deletedContent, ...addedContent];
  const { startPos, endPos } = getPairRange(currentPair);

  dispatchContentTransaction(startPos, endPos, combinedContent);
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
