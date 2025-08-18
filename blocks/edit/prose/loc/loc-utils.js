import {
  DOMSerializer,
  Fragment,
  Slice,
} from 'da-y-wrapper';
import getSheet from '../../../shared/sheet.js';
import { htmlDiff } from './htmldiff.js';

// Constants
const LOC_COLORS = {
  UPSTREAM: 'rgba(70, 130, 180, 0.2)',
  LOCAL: 'rgba(144, 42, 222, 0.2)',
  DIFF: 'rgba(150, 150, 150, 0.1)',
};

const LOC_TEXT = {
  UPSTREAM: 'Upstream',
  LOCAL: 'Local',
  DIFF: 'Difference',
};

// DOM Creation Utilities
function createElement(tag, className = '', attributes = {}) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}

function createTooltip(text) {
  const tooltip = createElement('span', 'loc-tooltip');
  tooltip.textContent = text;
  return tooltip;
}

function createButton(className, type = 'button', attributes = {}) {
  const button = createElement('button', className, { type, ...attributes });
  return button;
}

// Transaction Utilities
function createContentTransaction(view, startPos, endPos, filteredContent) {
  const { tr } = view.state;

  if (filteredContent.length > 0) {
    const newFragment = Fragment.fromArray(filteredContent);
    const newSlice = new Slice(newFragment, 1, 1);
    return tr.replace(startPos, endPos, newSlice);
  }

  return tr.delete(startPos, endPos);
}

function isLocNode(node) {
  return node?.type?.name === 'loc_deleted' || node?.type?.name === 'loc_added';
}

function isValidPosition(pos) {
  return pos !== null && pos !== undefined;
}

// Content Filtering Utilities
function filterNodeContent(node) {
  if (!node?.content?.content) {
    return [];
  }

  return node.content.content.filter((child) => {
    // Handle text nodes
    if (child.type.name === 'text') {
      return child.text?.trim().length > 0;
    }

    // Handle nodes with content
    if (child.content) {
      // Check if it has meaningful content
      if (child.content?.content?.length > 0) {
        return true;
      }
      // For nodes without nested content, check if they have any attributes or marks
      return child.attrs || child.marks?.length > 0;
    }

    // For other node types, assume they're meaningful unless explicitly empty
    return true;
  });
}

function simpleFilterContent(content) {
  return content.filter((c) => c.content?.content?.length);
}

let globalDialog = null;
const activeViews = new Set();

let locCssLoading = false;
async function loadLocCss() {
  if (locCssLoading) return;
  locCssLoading = true;

  try {
    const locSheet = await getSheet('/blocks/edit/prose/loc/loc-utils.css');

    const daEditor = document.querySelector('da-content')?.shadowRoot
      ?.querySelector('da-editor');

    if (daEditor?.shadowRoot) {
      const existingSheets = daEditor.shadowRoot.adoptedStyleSheets || [];
      daEditor.shadowRoot.adoptedStyleSheets = [...existingSheets, locSheet];
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load LOC CSS:', error);
  }
}

function getAllLocNodes(view) {
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

function hideGlobalDialog() {
  if (globalDialog?.parentNode) {
    const proseMirrorContainer = globalDialog.parentNode;
    proseMirrorContainer.classList.remove('has-regional-edits');
    globalDialog.classList.remove('show');
    globalDialog.remove();
  }
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

function handleGlobalAction(action) {
  activeViews.forEach((view) => {
    const locNodes = getAllLocNodes(view);

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

function createGlobalAction(type, text, action, tooltipText) {
  const button = createElement('div', `loc-composite-btn loc-composite-btn-base is-${type}`);

  const label = createElement('span', 'loc-composite-switch loc-composite-btn-base-element');
  label.textContent = text;

  const confirm = createButton('loc-composite-confirm loc-composite-btn-base-element', 'button', { 'aria-label': text });
  confirm.addEventListener('click', () => handleGlobalAction(action));
  confirm.appendChild(createTooltip(tooltipText));

  button.appendChild(label);
  button.appendChild(confirm);
  return button;
}

function createGlobalOverlay() {
  const dialog = createElement('div', 'da-regional-edits-overlay');
  const actionsContainer = createElement('div', 'da-regional-edits-actions');

  const localButton = createGlobalAction('local', 'Keep All Local', 'keep-local', 'Accept All Local');
  const upstreamButton = createGlobalAction('upstream', 'Keep All Upstream', 'keep-upstream', 'Accept All Upstream');

  actionsContainer.appendChild(localButton);
  actionsContainer.appendChild(upstreamButton);
  dialog.appendChild(actionsContainer);

  return dialog;
}

function findProseMirrorContainer(view) {
  // Find the .da-prose-mirror container that wraps the ProseMirror editor
  let element = view.dom;
  while (element && !element.classList.contains('da-prose-mirror')) {
    element = element.parentElement;
  }
  return element;
}

function showGlobalDialog(view) {
  if (globalDialog?.parentNode) {
    return; // Dialog already shown
  }

  const proseMirrorContainer = findProseMirrorContainer(view);
  if (!proseMirrorContainer) {
    // eslint-disable-next-line no-console
    console.warn('Could not find ProseMirror container for global dialog');
    return;
  }

  if (!globalDialog) {
    globalDialog = createGlobalOverlay();
  }

  const proseMirrorElement = proseMirrorContainer.querySelector('.ProseMirror');
  if (proseMirrorElement) {
    proseMirrorContainer.insertBefore(globalDialog, proseMirrorElement);
    proseMirrorContainer.classList.add('has-regional-edits');
    globalDialog.classList.add('show');
  }
}

/**
 * Recursively searches for the first text node and returns its text value.
 * @param {Object} content - The ProseMirror node to search.
 * @returns {string|undefined} The first text found, or undefined if none exists.
 */
function getFirstText(content) {
  if (!content) return undefined;

  if (content.type?.name === 'text' && typeof content.text === 'string') {
    return content.text;
  }

  if (content.content?.content) {
    for (let i = 0; i < content.content.content.length; i += 1) {
      const child = content.content.content[i];
      const found = getFirstText(child);
      if (found !== undefined) return found;
    }
  }

  return undefined;
}

/**
 * Check if two nodes have matching content structure
 */
function hasMatchingContent(nodeA, nodeB) {
  const contentA = nodeA.content.content;
  const contentB = nodeB.content.content;

  if (contentA.length !== contentB.length) {
    return false;
  }

  for (let i = 0; i < contentA.length; i += 1) {
    if (contentA[i].type.name !== contentB[i].type.name) {
      return false;
    }
  }

  // Special handling for tables - only if both nodes actually have tables at index 1
  if (contentA.length > 1 && contentB.length > 1
      && contentA[1].type.name === 'table' && contentB[1].type.name === 'table') {
    const blockA = getFirstText(contentA[1])?.split(' ')[0];
    const blockB = getFirstText(contentB[1])?.split(' ')[0];
    return blockA === blockB;
  }

  return true;
}

function checkForLocNodes(view) {
  const { doc } = view.state;
  let hasLocNodes = false;

  // Since loc_deleted and loc_added nodes are only one level deep,
  // we only need to check the immediate children of the document
  for (let i = 0; i < doc.childCount; i += 1) {
    const node = doc.child(i);
    if (isLocNode(node)) {
      hasLocNodes = true;
      break;
    }
  }

  if (hasLocNodes) {
    loadLocCss();
    showGlobalDialog(view);
  } else {
    hideGlobalDialog();
  }

  return hasLocNodes;
}

function fragmentToHTML(fragment) {
  if (!fragment) return '';

  if (typeof fragment === 'string') return fragment;

  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment.cloneNode(true));
  return tempDiv.innerHTML;
}

function trimEmptyParagraphs(html) {
  if (!html || typeof html !== 'string') return html;

  let trimmed = html;

  while (trimmed.startsWith('<p></p>')) {
    trimmed = trimmed.substring(7);
  }

  while (trimmed.endsWith('<p></p>')) {
    trimmed = trimmed.substring(0, trimmed.length - 7);
  }

  return trimmed;
}

function generateDiff(deletedContent, addedContent) {
  try {
    const deletedHTMLString = fragmentToHTML(deletedContent);
    const addedHTMLString = fragmentToHTML(addedContent);

    const tempDelDiv = document.createElement('div');
    tempDelDiv.innerHTML = deletedHTMLString;
    const deletedText = tempDelDiv.textContent || tempDelDiv.innerText || '';

    const tempAddDiv = document.createElement('div');
    tempAddDiv.innerHTML = addedHTMLString;
    const addedText = tempAddDiv.textContent || tempAddDiv.innerText || '';

    if (!deletedText.trim() && !addedText.trim()) {
      return '<p style="text-align: center; color: #666; margin: 20px 0;">No content to compare</p>';
    }

    const rawDiffResult = htmlDiff(deletedHTMLString, addedHTMLString);

    const diffResult = trimEmptyParagraphs(rawDiffResult);

    if (diffResult && diffResult.trim()) {
      return `<div class="html-diff">${diffResult}</div>`;
    }

    return '<p style="text-align: center; color: #666; margin: 20px 0;">No differences found</p>';
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error generating diff:', error);
    return '<p style="text-align: center; color: #d32f2f; margin: 20px 0;">Error generating diff</p>';
  }
}

function createTabContent(deletedContent, addedContent) {
  const container = createElement('div', 'loc-tab-content');

  const addedTab = createElement('div', 'loc-tab-pane active', { 'data-tab': 'added' });
  if (addedContent) {
    addedTab.appendChild(addedContent.cloneNode(true));
  }

  const deletedTab = createElement('div', 'loc-tab-pane', { 'data-tab': 'deleted' });
  if (deletedContent) {
    deletedTab.appendChild(deletedContent.cloneNode(true));
  }

  const diffTab = createElement('div', 'loc-tab-pane', { 'data-tab': 'diff' });
  const diffHTML = generateDiff(deletedContent, addedContent);
  diffTab.innerHTML = diffHTML;

  container.appendChild(addedTab);
  container.appendChild(deletedTab);
  container.appendChild(diffTab);

  return container;
}

function createCompositeButton(
  {
    label,
    id,
    keepHandler,
    variantClass,
    tooltip,
    switchTooltip,
  },
  onSwitchTab,
) {
  const wrapper = createElement('div', `loc-composite-btn loc-composite-btn-base ${variantClass}`);

  const switchBtn = createButton('loc-composite-switch loc-composite-btn-base-element');
  switchBtn.textContent = label;
  switchBtn.addEventListener('click', () => onSwitchTab(id));
  if (switchTooltip) {
    switchBtn.appendChild(createTooltip(switchTooltip));
  }

  const confirmBtn = createButton('loc-composite-confirm loc-composite-btn-base-element', 'button', { 'aria-label': `Keep ${label}` });
  confirmBtn.addEventListener('click', keepHandler);
  if (tooltip) {
    confirmBtn.appendChild(createTooltip(tooltip));
  }

  wrapper.appendChild(switchBtn);
  wrapper.appendChild(confirmBtn);
  return wrapper;
}

function createTabbedActions(onKeepDeleted, onKeepAdded, onKeepBoth, onSwitchTab) {
  const actionsContainer = createElement('div', 'loc-tabbed-actions loc-floating-overlay');
  const actionButtons = createElement('div', 'loc-action-buttons loc-sticky-buttons');

  const buttonConfigs = [
    {
      label: 'Local',
      id: 'added',
      keepHandler: onKeepAdded,
      variantClass: 'is-local',
      tooltip: 'Accept Local',
      switchTooltip: 'View Local',
    },
    {
      label: 'Upstream',
      id: 'deleted',
      keepHandler: onKeepDeleted,
      variantClass: 'is-upstream',
      tooltip: 'Accept Upstream',
      switchTooltip: 'View Upstream',
    },
    {
      label: 'Difference',
      id: 'diff',
      keepHandler: onKeepBoth,
      variantClass: 'is-diff',
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

function getCoverDiv(upstream) {
  const className = `loc-color-overlay ${upstream ? 'loc-langstore' : 'loc-regional'}`;
  const coverDiv = createElement('div', className, { 'loc-temp-dom': '' });

  coverDiv.style.backgroundColor = upstream ? LOC_COLORS.UPSTREAM : LOC_COLORS.LOCAL;
  return coverDiv;
}

function getLangOverlay(upstream) {
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

export function addActiveView(view) {
  activeViews.add(view);
}

export { checkForLocNodes };

// eslint-disable-next-line import/prefer-default-export
export function getLocClass(elName, getSchema, dispatchTransaction, { isUpstream } = {}) {
  return class {
    constructor(node, view, getPos) {
      this.node = node;
      this.view = view;
      this.getPos = getPos;
      this.schema = getSchema();

      const pos = getPos();
      const { doc } = view.state;
      const resolvedPos = doc.resolve(pos);
      const { parent } = resolvedPos;
      const indexInParent = resolvedPos.index();
      const thisNode = parent.child(indexInParent);

      // Only process the first node of a potential pair
      // If this is the second node, render as invisible to avoid duplication
      if (indexInParent > 0) {
        const prevSibling = parent.child(indexInParent - 1);

        if (this.canFormLocPair(prevSibling, thisNode)) {
          // This is the second node of a pair - render invisible
          this.dom = document.createElement('span');
          this.dom.style.display = 'none';
          return;
        }
      }

      let canFormPair = false;
      let nextSibling = null;

      if (indexInParent < parent.childCount - 1) {
        nextSibling = parent.child(indexInParent + 1);

        if (this.canFormLocPair(thisNode, nextSibling)) {
          canFormPair = true;
        }
      }

      if (canFormPair) {
        this.renderTabbedInterface(thisNode, view, pos, nextSibling);
      } else {
        this.renderSingleNode(node, view, pos, isUpstream);
      }
    }

    renderTabbedInterface(nodeA, view, posA, nodeB) {
      loadLocCss();

      this.dom = createElement('div', 'loc-tabbed-container', { contentEditable: 'false' });
      this.contentDOM = null; // Don't let ProseMirror manage content

      let deletedNode;
      let addedNode;
      let deletedPos;
      let addedPos;
      if (nodeA.type.name === 'loc_deleted') {
        deletedNode = nodeA;
        addedNode = nodeB;
        deletedPos = this.getPos();
        addedPos = deletedPos + nodeA.nodeSize;
      } else {
        deletedNode = nodeB;
        addedNode = nodeA;
        addedPos = this.getPos();
        deletedPos = addedPos + nodeA.nodeSize;
      }

      const serializer = DOMSerializer.fromSchema(this.schema);
      const deletedContent = serializer.serializeFragment(deletedNode.content);
      const addedContent = serializer.serializeFragment(addedNode.content);

      const tabContent = createTabContent(deletedContent, addedContent);

      const colorOverlay = createElement('div', 'loc-tabbed-color-overlay');
      colorOverlay.style.backgroundColor = LOC_COLORS.LOCAL;

      let actions;

      const setActiveTab = (targetTab) => {
        const panes = tabContent.querySelectorAll('.loc-tab-pane');
        panes.forEach((pane) => {
          pane.classList.toggle('active', pane.dataset.tab === targetTab);
        });

        if (targetTab === 'added') {
          colorOverlay.style.display = 'block';
          colorOverlay.style.backgroundColor = LOC_COLORS.LOCAL;
        } else if (targetTab === 'deleted') {
          colorOverlay.style.display = 'block';
          colorOverlay.style.backgroundColor = LOC_COLORS.UPSTREAM;
        } else {
          colorOverlay.style.backgroundColor = LOC_COLORS.DIFF;
        }

        if (actions) {
          const allButtons = actions.querySelectorAll('.loc-composite-btn');
          allButtons.forEach((btn) => btn.classList.remove('is-active'));

          let activeClass = 'is-diff';
          if (targetTab === 'added') activeClass = 'is-local';
          else if (targetTab === 'deleted') activeClass = 'is-upstream';

          const activeButton = actions.querySelector(`.loc-composite-btn.${activeClass}`);
          if (activeButton) activeButton.classList.add('is-active');
        }
      };

      actions = createTabbedActions(
        () => this.handleKeepDeleted(),
        () => this.handleKeepAdded(),
        () => this.handleKeepBoth(),
        setActiveTab,
      );

      this.dom.appendChild(tabContent);
      tabContent.appendChild(colorOverlay);
      this.dom.appendChild(actions);

      setActiveTab('added');
    }

    renderSingleNode(node, view, pos, upstream) {
      loadLocCss();

      const isDeleted = node.type.name === 'loc_deleted';
      const viewClass = isDeleted ? 'loc-deleted-view' : 'loc-added-view';
      const styleClass = isDeleted ? 'da-loc-deleted-style' : 'da-loc-added-style';

      // Use div instead of da-loc-* to avoid parseDOM feedback loop
      this.dom = createElement('div', `loc-single-container ${viewClass}`, { contentEditable: 'false' });
      this.dom.classList.add(styleClass);
      this.contentDOM = null; // Don't let ProseMirror manage content

      const serializer = DOMSerializer.fromSchema(this.schema);
      const nodeDOM = serializer.serializeFragment(node.content);

      this.dom.appendChild(nodeDOM);
      const coverDiv = getCoverDiv(upstream);
      this.dom.appendChild(coverDiv);
      const { overlay, deleteBtn, keepBtn } = getLangOverlay(upstream);
      this.langOverlay = overlay;

      deleteBtn.addEventListener('click', () => {
        this.handleDeleteSingleNode();
      });

      keepBtn.addEventListener('click', () => {
        this.handleKeepSingleNode();
      });

      coverDiv.appendChild(this.langOverlay);
    }

    /**
     * Checks if two nodes can form a valid LOC pair
     * @param {Object} nodeA - First node
     * @param {Object} nodeB - Second node
     * @returns {boolean} True if nodes can form a pair
     */
    canFormLocPair(nodeA, nodeB) {
      return isLocNode(nodeA)
        && isLocNode(nodeB)
        && nodeA.type.name !== nodeB.type.name
        && hasMatchingContent(nodeA, nodeB);
    }

    /**
     * Creates and dispatches a transaction with filtered content
     * @param {number} startPos - Start position
     * @param {number} endPos - End position
     * @param {Array} filteredContent - Filtered content array
     */
    dispatchContentTransaction(startPos, endPos, filteredContent) {
      const transaction = createContentTransaction(this.view, startPos, endPos, filteredContent);
      this.view.dispatch(transaction);
    }

    /**
     * Gets the start and end positions for a LOC pair
     * @param {Object} pair - LOC pair object with positions and nodes
     * @returns {Object} Object with startPos and endPos
     */
    getPairRange(pair) {
      const { deletedPos, addedPos, deletedNode, addedNode } = pair;
      return {
        startPos: Math.min(deletedPos, addedPos),
        endPos: Math.max(
          deletedPos + deletedNode.nodeSize,
          addedPos + addedNode.nodeSize,
        ),
      };
    }

    handleDeleteSingleNode() {
      try {
        const currentPos = this.getPos();
        if (!isValidPosition(currentPos)) {
          // eslint-disable-next-line no-console
          console.warn('Could not get current position for single node delete');
          return;
        }

        const { doc } = this.view.state;
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
          const transaction = this.view.state.tr.delete(
            parentPos,
            parentPos + resolvedPos.parent.nodeSize,
          );
          this.view.dispatch(transaction);
        } else {
          const transaction = this.view.state.tr.delete(
            currentPos,
            currentPos + currentNode.nodeSize,
          );
          this.view.dispatch(transaction);
        }
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Error deleting single loc node:', error);
      }
    }

    handleKeepSingleNode() {
      try {
        const currentPos = this.getPos();
        if (!isValidPosition(currentPos)) {
          // eslint-disable-next-line no-console
          console.warn('Could not get current position for single node keep');
          return;
        }

        const { doc } = this.view.state;
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
        this.dispatchContentTransaction(
          currentPos,
          currentPos + currentNode.nodeSize,
          filteredContent,
        );
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Error keeping single loc node:', error);
      }
    }

    /**
     * Get current loc node pair at the stored position
     * @param {Object} view - ProseMirror view
     * @returns {Object|null} Object with current positions and nodes or null if not found
     */
    getCurrentLocNodePair(view) {
      try {
        const currentPos = this.getPos();
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

          if (this.canFormLocPair(currentNode, nextSibling)) {
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

    handleKeepDeleted() {
      // Get current positions and nodes using the stored getPos function
      const currentPair = this.getCurrentLocNodePair(this.view);
      if (!currentPair) {
        // eslint-disable-next-line no-console
        console.warn('Could not find current loc node pair');
        return;
      }

      const { deletedNode: currentDeletedNode } = currentPair;

      // Keep deleted content and delete added content
      const filteredContent = filterNodeContent(currentDeletedNode);
      const { startPos, endPos } = this.getPairRange(currentPair);

      this.dispatchContentTransaction(startPos, endPos, filteredContent);
    }

    handleKeepAdded() {
      // Get current positions and nodes using the stored getPos function
      const currentPair = this.getCurrentLocNodePair(this.view);
      if (!currentPair) {
        // eslint-disable-next-line no-console
        console.warn('Could not find current loc node pair');
        return;
      }

      const { addedNode: currentAddedNode } = currentPair;

      // Keep added content and delete deleted content
      const filteredContent = filterNodeContent(currentAddedNode);
      const { startPos, endPos } = this.getPairRange(currentPair);

      this.dispatchContentTransaction(startPos, endPos, filteredContent);
    }

    handleKeepBoth() {
      // Get current positions and nodes using the stored getPos function
      const currentPair = this.getCurrentLocNodePair(this.view);
      if (!currentPair) {
        // eslint-disable-next-line no-console
        console.warn('Could not find current loc node pair');
        return;
      }

      const {
        deletedNode: currentDeletedNode,
        addedNode: currentAddedNode,
      } = currentPair;

      // Keep both nodes by combining their content
      const deletedContent = filterNodeContent(currentDeletedNode);
      const addedContent = filterNodeContent(currentAddedNode);
      const combinedContent = [...deletedContent, ...addedContent];
      const { startPos, endPos } = this.getPairRange(currentPair);

      this.dispatchContentTransaction(startPos, endPos, combinedContent);
    }

    applyKeepOperation(tr, node, pos) {
      // Extract and filter content without mutating the original node
      const filteredContent = simpleFilterContent(node.content.content);
      if (filteredContent.length > 0) {
        const newFragment = Fragment.fromArray(filteredContent);
        const newSlice = new Slice(newFragment, 0, 0);
        tr.replace(pos, pos + node.nodeSize, newSlice);
      } else {
        tr.delete(pos, pos + node.nodeSize);
      }
    }

    destroy() {
      this.coverDiv?.remove();
      this.langOverlay?.remove();
    }

    stopEvent() {
      // Prevent ProseMirror from handling events within LOC nodes
      // This makes LOC content truly non-editable and atomic
      return true;
    }

    selectNode() {
      // Highlight the entire LOC node when selected
      this.dom.classList.add('ProseMirror-selectednode');
    }

    deselectNode() {
      // Remove highlight when deselected
      this.dom.classList.remove('ProseMirror-selectednode');
    }

    ignoreMutation() {
      // Ignore all mutations within LOC nodes since we manage them entirely
      return true;
    }
  };
}
