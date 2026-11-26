/* eslint-disable max-len */
// User action handlers - only loaded when user actually clicks action buttons

import {
  createElement,
  createButton,
  createTooltip,
  getDiffLabels,
} from '../../utils/helpers.js';
import { applyResolution, loadDiffEngine } from './diff-engine.js';

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

  const confirmBtn = createButton('nx-action-btn-icon confirm-btn da-diff-btn-base-element', 'button', { 'aria-label': `${tooltip}` });
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

  const labels = getDiffLabels();

  const buttonConfigs = [
    {
      label: labels.local,
      id: 'added',
      handler: onKeepAdded,
      variant: 'is-local',
      tooltip: `Accept ${labels.local}`,
      switchTooltip: `View ${labels.local}`,
      isActive: true, // Local is the default active tab
    },
    {
      label: labels.upstream,
      id: 'deleted',
      handler: onKeepDeleted,
      variant: 'is-upstream',
      tooltip: `Accept ${labels.upstream}`,
      switchTooltip: `View ${labels.upstream}`,
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

function currentLocPos(view, getPos, isValidPosition, isLocNode) {
  const currentPos = getPos();
  if (!isValidPosition(currentPos)) {
    // eslint-disable-next-line no-console
    console.warn('Could not get current position for single node');
    return null;
  }
  if (!isLocNode(view.state.doc.nodeAt(currentPos))) {
    // eslint-disable-next-line no-console
    console.warn('Current node is not a loc node');
    return null;
  }
  return currentPos;
}

async function handleSingleNode(view, getPos, isValidPosition, isLocNode, pick) {
  try {
    const { CHOICE } = await loadDiffEngine();
    const pos = currentLocPos(view, getPos, isValidPosition, isLocNode);
    if (pos === null) return;
    applyResolution(view, 'resolveMarkers', { positions: [pos], choice: pick(CHOICE) });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Error resolving single loc node:', error);
  }
}

export function handleDeleteSingleNode(view, getPos, isValidPosition, isLocNode) {
  return handleSingleNode(view, getPos, isValidPosition, isLocNode, (CHOICE) => CHOICE.neither);
}

export function handleKeepSingleNode(view, getPos, isValidPosition, isLocNode) {
  return handleSingleNode(view, getPos, isValidPosition, isLocNode, (CHOICE) => CHOICE.both);
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

async function handleOperation(context, pick) {
  const {
    view,
    getPos,
    isValidPosition,
    isLocNode,
    canFormLocPair,
  } = context;

  const { CHOICE } = await loadDiffEngine();
  const currentPair = getCurrentLocNodePair(view, getPos, isValidPosition, isLocNode, canFormLocPair);
  if (!currentPair) {
    // eslint-disable-next-line no-console
    console.warn('Could not find current loc node pair');
    return;
  }

  const { deletedPos, addedPos } = currentPair;
  applyResolution(view, 'resolveMarkers', { positions: [deletedPos, addedPos], choice: pick(CHOICE) });
}

export function handleKeepDeleted(context) {
  return handleOperation(context, (CHOICE) => CHOICE.source);
}

export function handleKeepAdded(context) {
  return handleOperation(context, (CHOICE) => CHOICE.mine);
}

export function handleKeepBoth(context) {
  return handleOperation(context, (CHOICE) => CHOICE.both);
}
