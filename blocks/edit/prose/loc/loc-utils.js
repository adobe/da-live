import {
  DOMSerializer,
  Fragment,
  Slice,
} from 'da-y-wrapper';
import getSheet from '../../../shared/sheet.js';
// htmlDiff is now loaded lazily

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

function filterNodeContent(node) {
  if (!node?.content?.content) {
    return [];
  }

  return node.content.content.filter((child) => {
    if (child.type.name === 'text') {
      return child.text?.trim().length > 0;
    }

    if (child.content) {
      if (child.content?.content?.length > 0) {
        return true;
      }
      return child.attrs || child.marks?.length > 0;
    }

    return true;
  });
}

function simpleFilterContent(content) {
  return content.filter((c) => c.content?.content?.length);
}

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

let globalDialogModule = null;

async function loadGlobalDialog() {
  if (!globalDialogModule) {
    globalDialogModule = await import('./loc-global-dialog.js');
  }
  return globalDialogModule;
}

async function showGlobalDialog(view) {
  try {
    const globalDialog = await loadGlobalDialog();
    globalDialog.showGlobalDialog(
      view,
      activeViews,
      simpleFilterContent,
      isLocNode,
      createElement,
      createButton,
      createTooltip,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load global dialog:', error);
  }
}

async function hideGlobalDialog() {
  try {
    const globalDialog = await loadGlobalDialog();
    globalDialog.hideGlobalDialog();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load global dialog for hiding:', error);
  }
}

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

// Lazy load diff generation
async function generateDiff(deletedContent, addedContent) {
  try {
    const diffUtils = await import('./loc-diff-utils.js');
    return diffUtils.generateDiff(deletedContent, addedContent);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load diff utilities:', error);
    return '<p style="text-align: center; color: #d32f2f; margin: 20px 0;">Error loading diff</p>';
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
  diffTab.innerHTML = '<p style="text-align: center; color: #666; margin: 20px 0;">Loading diff...</p>';

  // Store content for lazy loading
  diffTab.deletedContent = deletedContent;
  diffTab.addedContent = addedContent;
  diffTab.loaded = false;

  container.appendChild(addedTab);
  container.appendChild(deletedTab);
  container.appendChild(diffTab);

  return container;
}

// Lazy load tabbed actions (only needed for complex paired LOC nodes)
async function createTabbedActions(onKeepDeleted, onKeepAdded, onKeepBoth, onSwitchTab) {
  try {
    const tabbedActions = await import('./loc-tabbed-actions.js');
    return tabbedActions.createTabbedActions(
      onKeepDeleted,
      onKeepAdded,
      onKeepBoth,
      onSwitchTab,
      createElement,
      createButton,
      createTooltip,
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load tabbed actions:', error);
    // Simple fallback
    const container = createElement('div', 'loc-tabbed-actions loc-floating-overlay');
    container.innerHTML = '<div style="text-align: center; padding: 10px;">Loading actions...</div>';
    return container;
  }
}

// Overlay UI creation - lazy loaded when overlays are actually needed
let overlayUIModule = null;

async function loadOverlayUI() {
  if (!overlayUIModule) {
    overlayUIModule = await import('./loc-overlay-ui.js');
  }
  return overlayUIModule;
}

// User actions - lazy loaded when user clicks action buttons
let userActionsModule = null;

async function loadUserActions() {
  if (!userActionsModule) {
    userActionsModule = await import('./loc-user-actions.js');
  }
  return userActionsModule;
}

// getCoverDiv is now handled within overlay loading

async function getLangOverlay(upstream) {
  try {
    const overlayUI = await loadOverlayUI();
    return overlayUI.getLangOverlay(upstream, createElement, createButton, createTooltip, LOC_TEXT);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('Failed to load lang overlay:', error);
    // Simple fallback
    const overlay = createElement('div', 'loc-lang-overlay loc-floating-overlay');
    overlay.innerHTML = '<div style="padding: 5px;">Loading overlay...</div>';
    return { overlay, deleteBtn: null, keepBtn: null };
  }
}

export function addActiveView(view) {
  activeViews.add(view);
}

export { checkForLocNodes };

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
        } else if (targetTab === 'diff') {
          colorOverlay.style.backgroundColor = LOC_COLORS.DIFF;

          const diffTab = tabContent.querySelector('[data-tab="diff"]');
          if (diffTab && !diffTab.loaded) {
            diffTab.loaded = true;
            generateDiff(diffTab.deletedContent, diffTab.addedContent).then((diffHTML) => {
              diffTab.innerHTML = diffHTML;
            }).catch(() => {
              diffTab.innerHTML = '<p style="text-align: center; color: #d32f2f; margin: 20px 0;">Error loading diff</p>';
            });
          }
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

      const actionsPlaceholder = createElement('div', 'loc-tabbed-actions loc-floating-overlay');
      actionsPlaceholder.innerHTML = '<div style="text-align: center; padding: 10px;">Loading actions...</div>';

      this.dom.appendChild(tabContent);
      tabContent.appendChild(colorOverlay);
      this.dom.appendChild(actionsPlaceholder);

      createTabbedActions(
        () => this.handleKeepDeleted(),
        () => this.handleKeepAdded(),
        () => this.handleKeepBoth(),
        setActiveTab,
      ).then((loadedActions) => {
        actions = loadedActions;
        this.dom.replaceChild(loadedActions, actionsPlaceholder);
      }).catch(() => {
        actionsPlaceholder.innerHTML = '<div style="text-align: center; padding: 10px; color: #d32f2f;">Error loading actions</div>';
      });

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

      // Create placeholder cover div immediately
      const coverDiv = createElement('div', 'loc-color-overlay', { 'loc-temp-dom': '' });
      coverDiv.style.backgroundColor = upstream ? '#4682b433' : '#902ade33';
      this.dom.appendChild(coverDiv);

      // Create placeholder overlay
      const placeholderOverlay = createElement('div', 'loc-lang-overlay loc-floating-overlay');
      placeholderOverlay.innerHTML = '<div style="padding: 5px;">Loading...</div>';
      this.langOverlay = placeholderOverlay;
      coverDiv.appendChild(this.langOverlay);

      // Load real overlays asynchronously
      this.loadRealOverlays(upstream, coverDiv).catch(() => {
        // Keep placeholder on error
      });
    }

    async loadRealOverlays(upstream, coverDiv) {
      try {
        // Load enhanced overlay
        const { overlay, deleteBtn, keepBtn } = await getLangOverlay(upstream);

        // Set up event listeners
        deleteBtn.addEventListener('click', () => {
          this.handleDeleteSingleNode();
        });

        keepBtn.addEventListener('click', () => {
          this.handleKeepSingleNode();
        });

        // Replace placeholder with enhanced overlay
        coverDiv.removeChild(this.langOverlay);
        this.langOverlay = overlay;
        coverDiv.appendChild(this.langOverlay);

        // Update cover div styling
        const className = `loc-color-overlay ${upstream ? 'loc-langstore' : 'loc-regional'}`;
        coverDiv.className = className;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load enhanced overlays:', error);
      }
    }

    canFormLocPair(nodeA, nodeB) {
      return isLocNode(nodeA)
        && isLocNode(nodeB)
        && nodeA.type.name !== nodeB.type.name
        && hasMatchingContent(nodeA, nodeB);
    }

    dispatchContentTransaction(startPos, endPos, filteredContent) {
      const transaction = createContentTransaction(this.view, startPos, endPos, filteredContent);
      this.view.dispatch(transaction);
    }

    // Generic handler to eliminate duplication in user action calls
    async callUserAction(actionName, actionParams, errorContext) {
      try {
        const userActions = await loadUserActions();
        userActions[actionName](...actionParams);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn(`Failed to load user actions for ${errorContext}:`, error);
      }
    }

    // Common parameter sets for different action types
    get baseParams() {
      return [
        this.view,
        this.getPos.bind(this),
        isValidPosition,
        isLocNode,
      ];
    }

    get singleNodeParams() {
      return [
        ...this.baseParams,
        filterNodeContent,
        this.dispatchContentTransaction.bind(this),
      ];
    }

    get pairNodeParams() {
      return [
        ...this.baseParams,
        this.canFormLocPair.bind(this),
        filterNodeContent,
        this.dispatchContentTransaction.bind(this),
      ];
    }

    async handleDeleteSingleNode() {
      await this.callUserAction('handleDeleteSingleNode', this.baseParams, 'delete');
    }

    async handleKeepSingleNode() {
      await this.callUserAction('handleKeepSingleNode', this.singleNodeParams, 'keep');
    }

    async handleKeepDeleted() {
      await this.callUserAction('handleKeepDeleted', this.pairNodeParams, 'keep deleted');
    }

    async handleKeepAdded() {
      await this.callUserAction('handleKeepAdded', this.pairNodeParams, 'keep added');
    }

    async handleKeepBoth() {
      await this.callUserAction('handleKeepBoth', this.pairNodeParams, 'keep both');
    }

    destroy() {
      this.coverDiv?.remove();
      this.langOverlay?.remove();
    }

    stopEvent() {
      // Prevent ProseMirror from handling events within diff nodes
      return true;
    }

    selectNode() {
      this.dom.classList.add('ProseMirror-selectednode');
    }

    deselectNode() {
      this.dom.classList.remove('ProseMirror-selectednode');
    }

    ignoreMutation() {
      return true;
    }
  };
}
