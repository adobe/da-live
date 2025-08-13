import {
  DOMSerializer,
  Fragment,
  Slice,
} from 'da-y-wrapper';

const LOC = {
  UPSTREAM: {
    BG: 'rgba(70, 130, 180, 0.2)',
    COVER_BG: 'rgba(70, 130, 180, 0.2)',
    TEXT: 'Upstream',
    TEXT_COLOR: 'rgba(70, 130, 180)',
  },
  LOCAL: {
    BG: 'rgba(144, 42, 222, 0.2)',
    COVER_BG: 'rgba(144, 42, 222, 0.2)',
    TEXT: 'Local',
    TEXT_COLOR: 'rgba(144, 42, 222)',
  },
  DIFF: {
    COVER_BG: 'rgba(150, 150, 150, 0.1)',
    TEXT: 'Difference',
  },
};

// Load htmldiff library
let htmldiff = null;

// Global dialog management
let globalDialog = null;
const activeViews = new Set();

// Function to load the htmldiff script dynamically
function loadHtmlDiffScript() {
  if (window.htmldiff) {
    htmldiff = window.htmldiff;
    return Promise.resolve(htmldiff);
  }

  return new Promise((resolve, reject) => {
    // Create a module shim for CommonJS compatibility
    const moduleShim = document.createElement('script');
    moduleShim.textContent = `
      window.module = { exports: {} };
      window.exports = window.module.exports;
    `;
    document.head.appendChild(moduleShim);

    const script = document.createElement('script');
    script.src = '../../../deps/htmldiff/htmldiff.min.js';
    script.onload = () => {
      // The library exports as ES module with static execute method
      const exportedModule = window.module.exports;

      // eslint-disable-next-line dot-notation
      if (exportedModule && exportedModule['__esModule'] && exportedModule.default) {
        const HtmlDiffClass = exportedModule.default;
        htmldiff = HtmlDiffClass.execute.bind(HtmlDiffClass);
      }

      window.htmldiff = htmldiff;

      // Clean up the shim
      window.module = undefined;
      window.exports = undefined;

      resolve(htmldiff);
    };
    script.onerror = () => {
      reject(new Error('Failed to load htmldiff library'));
    };
    document.head.appendChild(script);
  });
}

// Initialize htmldiff on module load
loadHtmlDiffScript().catch((error) => {
  // eslint-disable-next-line no-console
  console.warn('Failed to load htmldiff library:', error);
});

function getAllLocNodes(view) {
  const { doc } = view.state;
  const locNodes = [];

  doc.descendants((node, pos) => {
    if (node.type.name === 'loc_deleted' || node.type.name === 'loc_added') {
      locNodes.push({ node, pos });
    }
  });

  // Sort by position (descending) so we can process from end to beginning
  // This prevents position shifts from affecting later operations
  return locNodes.sort((a, b) => b.pos - a.pos);
}

function hideGlobalDialog() {
  if (globalDialog && globalDialog.parentNode) {
    const proseMirrorContainer = globalDialog.parentNode;
    proseMirrorContainer.classList.remove('has-regional-edits');
    globalDialog.classList.remove('show');
    globalDialog.remove();
  }
}

function handleGlobalAction(action) {
  // Process all active views
  activeViews.forEach((view) => {
    const locNodes = getAllLocNodes(view);

    if (locNodes.length === 0) return;

    let { tr } = view.state;
    let hasChanges = false;

    for (const { node, pos } of locNodes) {
      try {
        if (action === 'keep-local' && node.type.name === 'loc_added') {
          // Keep local (added) content
          const filteredContent = node.content.content.filter((c) => c.content.content.length);
          if (filteredContent.length > 0) {
            const newFragment = Fragment.fromArray(filteredContent);
            const newSlice = new Slice(newFragment, 0, 0);
            tr = tr.replace(pos, pos + node.nodeSize, newSlice);
            hasChanges = true;
          } else {
            tr = tr.delete(pos, pos + node.nodeSize);
            hasChanges = true;
          }
        } else if (action === 'keep-upstream' && node.type.name === 'loc_deleted') {
          // Keep upstream (deleted) content
          const filteredContent = node.content.content.filter((c) => c.content.content.length);
          if (filteredContent.length > 0) {
            const newFragment = Fragment.fromArray(filteredContent);
            const newSlice = new Slice(newFragment, 0, 0);
            tr = tr.replace(pos, pos + node.nodeSize, newSlice);
            hasChanges = true;
          } else {
            tr = tr.delete(pos, pos + node.nodeSize);
            hasChanges = true;
          }
        } else if (action === 'keep-both') {
          // Keep both - extract content from loc node
          const filteredContent = node.content.content.filter((c) => c.content.content.length);
          if (filteredContent.length > 0) {
            const newFragment = Fragment.fromArray(filteredContent);
            const newSlice = new Slice(newFragment, 0, 0);
            tr = tr.replace(pos, pos + node.nodeSize, newSlice);
            hasChanges = true;
          } else {
            tr = tr.delete(pos, pos + node.nodeSize);
            hasChanges = true;
          }
        } else if (action === 'keep-local' && node.type.name === 'loc_deleted') {
          // Remove upstream (deleted) content when keeping local
          tr = tr.delete(pos, pos + node.nodeSize);
          hasChanges = true;
        } else if (action === 'keep-upstream' && node.type.name === 'loc_added') {
          // Remove local (added) content when keeping upstream
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

  // Hide dialog after processing
  hideGlobalDialog();
}

function createGlobalOverlay() {
  const dialog = document.createElement('div');
  dialog.className = 'da-regional-edits-overlay';

  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'da-regional-edits-actions';

  // Create Keep All Local composite button
  const localButton = document.createElement('div');
  localButton.className = 'loc-composite-btn loc-composite-btn-base is-local';

  const localLabel = document.createElement('span');
  localLabel.className = 'loc-composite-switch loc-composite-btn-base-element';
  localLabel.textContent = 'Keep All Local';

  const localConfirm = document.createElement('button');
  localConfirm.className = 'loc-composite-confirm loc-composite-btn-base-element';
  localConfirm.type = 'button';
  localConfirm.setAttribute('aria-label', 'Keep All Local');
  localConfirm.addEventListener('click', () => handleGlobalAction('keep-local'));

  // Add tooltip for local button
  const localTooltip = document.createElement('span');
  localTooltip.className = 'loc-tooltip';
  localTooltip.textContent = 'Accept All Local';
  localConfirm.appendChild(localTooltip);

  localButton.appendChild(localLabel);
  localButton.appendChild(localConfirm);

  // Create Keep All Upstream composite button
  const upstreamButton = document.createElement('div');
  upstreamButton.className = 'loc-composite-btn loc-composite-btn-base is-upstream';

  const upstreamLabel = document.createElement('span');
  upstreamLabel.className = 'loc-composite-switch loc-composite-btn-base-element';
  upstreamLabel.textContent = 'Keep All Upstream';

  const upstreamConfirm = document.createElement('button');
  upstreamConfirm.className = 'loc-composite-confirm loc-composite-btn-base-element';
  upstreamConfirm.type = 'button';
  upstreamConfirm.setAttribute('aria-label', 'Keep All Upstream');
  upstreamConfirm.addEventListener('click', () => handleGlobalAction('keep-upstream'));

  // Add tooltip for upstream button
  const upstreamTooltip = document.createElement('span');
  upstreamTooltip.className = 'loc-tooltip';
  upstreamTooltip.textContent = 'Accept All Upstream';
  upstreamConfirm.appendChild(upstreamTooltip);

  upstreamButton.appendChild(upstreamLabel);
  upstreamButton.appendChild(upstreamConfirm);

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
  if (globalDialog && globalDialog.parentNode) {
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

  // Insert dialog before the ProseMirror element
  const proseMirrorElement = proseMirrorContainer.querySelector('.ProseMirror');
  if (proseMirrorElement) {
    proseMirrorContainer.insertBefore(globalDialog, proseMirrorElement);
    proseMirrorContainer.classList.add('has-regional-edits');
    globalDialog.classList.add('show');
  }
}

function checkForLocNodes(view) {
  // Check if there are any loc_deleted or loc_added nodes in the document
  const { doc } = view.state;
  let hasLocNodes = false;

  doc.descendants((node) => {
    if (node.type.name === 'loc_deleted' || node.type.name === 'loc_added') {
      hasLocNodes = true;
      return false; // Stop traversing
    }
    return true;
  });

  if (hasLocNodes) {
    // Insert spacing between loc nodes/interfaces if needed
    insertLocSpacing(view);
    showGlobalDialog(view);
  } else {
    hideGlobalDialog();
  }

  return hasLocNodes;
}

// Top tab UI removed in favor of split buttons

function fragmentToHTML(fragment) {
  if (!fragment) return '';

  // If it's already a string, return it
  if (typeof fragment === 'string') return fragment;

  // Create a temporary container to get the HTML
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment.cloneNode(true));
  return tempDiv.innerHTML;
}

async function generateDiff(deletedContent, addedContent) {
  try {
    // Ensure htmldiff is loaded
    if (!htmldiff) {
      await loadHtmlDiffScript();
    }

    if (!htmldiff || typeof htmldiff !== 'function') {
      // eslint-disable-next-line no-console
      console.warn('htmldiff is not a function:', typeof htmldiff, htmldiff);
      return '<p style="text-align: center; color: #666; margin: 20px 0;">HTML diff library not available or not functional</p>';
    }

    // Convert content to HTML strings
    const deletedHTMLString = fragmentToHTML(deletedContent);
    const addedHTMLString = fragmentToHTML(addedContent);

    // Extract text for comparison
    const tempDelDiv = document.createElement('div');
    tempDelDiv.innerHTML = deletedHTMLString;
    const deletedText = tempDelDiv.textContent || tempDelDiv.innerText || '';

    const tempAddDiv = document.createElement('div');
    tempAddDiv.innerHTML = addedHTMLString;
    const addedText = tempAddDiv.textContent || tempAddDiv.innerText || '';

    if (!deletedText.trim() && !addedText.trim()) {
      return '<p style="text-align: center; color: #666; margin: 20px 0;">No content to compare</p>';
    }

    // Generate diff using htmldiff library
    const diffResult = htmldiff(deletedHTMLString, addedHTMLString);

    if (diffResult && typeof diffResult === 'string' && diffResult.trim()) {
      return diffResult;
    }

    return '<p style="text-align: center; color: #666; margin: 20px 0;">Unable to generate diff</p>';
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error generating diff:', error);
    return '<p style="text-align: center; color: #d32f2f; margin: 20px 0;">Error generating diff</p>';
  }
}

function createTabContent(deletedContent, addedContent) {
  const container = document.createElement('div');
  container.className = 'loc-tab-content';

  const addedTab = document.createElement('div');
  addedTab.className = 'loc-tab-pane active';
  addedTab.dataset.tab = 'added';
  // Clone the content since DocumentFragments can only be in one place
  if (addedContent) {
    addedTab.appendChild(addedContent.cloneNode(true));
  }

  const deletedTab = document.createElement('div');
  deletedTab.className = 'loc-tab-pane';
  deletedTab.dataset.tab = 'deleted';
  // Clone the content since DocumentFragments can only be in one place
  if (deletedContent) {
    deletedTab.appendChild(deletedContent.cloneNode(true));
  }

  const diffTab = document.createElement('div');
  diffTab.className = 'loc-tab-pane';
  diffTab.dataset.tab = 'diff';

  diffTab.innerHTML = '<p style="text-align: center; color: #666; margin: 20px 0;">Loading diff...</p>';

  generateDiff(deletedContent, addedContent).then((diffHTML) => {
    diffTab.innerHTML = diffHTML;
  }).catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Error loading diff:', error);
    diffTab.innerHTML = '<p style="text-align: center; color: #d32f2f; margin: 20px 0;">Error loading diff</p>';
  });

  container.appendChild(addedTab);
  container.appendChild(deletedTab);
  container.appendChild(diffTab);

  return container;
}

// Old generic button utility no longer needed

function createTabbedActions(onKeepDeleted, onKeepAdded, onKeepBoth, onSwitchTab) {
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'loc-tabbed-actions loc-floating-overlay';

  const actionButtons = document.createElement('div');
  actionButtons.className = 'loc-action-buttons loc-sticky-buttons';

  const createComposite = ({ label, id, keepHandler, variantClass, tooltip }) => {
    const wrapper = document.createElement('div');
    wrapper.className = `loc-composite-btn loc-composite-btn-base ${variantClass}`;

    const switchBtn = document.createElement('button');
    switchBtn.className = 'loc-composite-switch loc-composite-btn-base-element';
    switchBtn.type = 'button';
    switchBtn.textContent = label;
    switchBtn.addEventListener('click', () => onSwitchTab(id));

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'loc-composite-confirm loc-composite-btn-base-element';
    confirmBtn.type = 'button';
    confirmBtn.setAttribute('aria-label', `Keep ${label}`);
    confirmBtn.addEventListener('click', keepHandler);

    // Tooltip element
    if (tooltip) {
      const tip = document.createElement('span');
      tip.className = 'loc-tooltip';
      tip.textContent = tooltip;
      confirmBtn.appendChild(tip);
    }

    wrapper.appendChild(switchBtn);
    wrapper.appendChild(confirmBtn);
    return wrapper;
  };

  actionButtons.appendChild(createComposite({
    label: 'Local',
    id: 'added',
    keepHandler: onKeepAdded,
    variantClass: 'is-local',
    tooltip: 'Accept Local',
  }));

  actionButtons.appendChild(createComposite({
    label: 'Upstream',
    id: 'deleted',
    keepHandler: onKeepDeleted,
    variantClass: 'is-upstream',
    tooltip: 'Accept Upstream',
  }));

  actionButtons.appendChild(createComposite({
    label: 'Difference',
    id: 'diff',
    keepHandler: onKeepBoth,
    variantClass: 'is-diff',
    tooltip: 'Accept Both',
  }));

  actionsContainer.appendChild(actionButtons);
  return actionsContainer;
}

function getCoverDiv(upstream) {
  const coverDiv = document.createElement('div');
  coverDiv.className = `loc-color-overlay ${upstream ? 'loc-langstore' : 'loc-regional'}`;
  coverDiv.setAttribute('loc-temp-dom', '');

  coverDiv.style.backgroundColor = upstream
    ? LOC.UPSTREAM.COVER_BG
    : LOC.LOCAL.COVER_BG;
  return coverDiv;
}

function getLangOverlay(upstream) {
  const overlay = document.createElement('div');
  overlay.className = 'loc-lang-overlay loc-floating-overlay';
  overlay.setAttribute('loc-temp-dom', '');

  // Create 3-part composite button
  const compositeBtn = document.createElement('div');
  compositeBtn.className = `loc-composite-btn-3part loc-composite-btn-base loc-sticky-buttons ${upstream ? 'is-upstream' : 'is-local'}`;

  // Label part (no click handling)
  const labelBtn = document.createElement('span');
  labelBtn.className = 'loc-composite-label loc-composite-btn-base-element';
  labelBtn.textContent = upstream ? LOC.UPSTREAM.TEXT : LOC.LOCAL.TEXT;

  // Accept part (checkmark)
  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'loc-composite-accept loc-composite-btn-base-element';
  acceptBtn.type = 'button';
  acceptBtn.setAttribute('aria-label', `Accept ${upstream ? 'Upstream' : 'Local'}`);

  // Add tooltip for accept button
  const acceptTooltip = document.createElement('span');
  acceptTooltip.className = 'loc-tooltip';
  acceptTooltip.textContent = `Accept ${upstream ? 'Upstream' : 'Local'}`;
  acceptBtn.appendChild(acceptTooltip);

  // Delete part (X)
  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'loc-composite-delete loc-composite-btn-base-element';
  deleteBtn.type = 'button';
  deleteBtn.setAttribute('aria-label', `Delete ${upstream ? 'Upstream' : 'Local'}`);

  // Add tooltip for delete button
  const deleteTooltip = document.createElement('span');
  deleteTooltip.className = 'loc-tooltip';
  deleteTooltip.textContent = `Delete ${upstream ? 'Upstream' : 'Local'}`;
  deleteBtn.appendChild(deleteTooltip);

  compositeBtn.appendChild(labelBtn);
  compositeBtn.appendChild(acceptBtn);
  compositeBtn.appendChild(deleteBtn);
  overlay.appendChild(compositeBtn);

  return { overlay, deleteBtn, keepBtn: acceptBtn };
}

function keepLocContentInPlace(view, pos, node) {
  const filteredContent = node.content.content.filter((c) => c.content.content.length);
  const newFragment = Fragment.fromArray(filteredContent);
  const newSlice = new Slice(newFragment, 0, 0);
  const transaction = view.state.tr.replace(pos, pos + node.nodeSize, newSlice);
  return transaction;
}

function deleteLocContent(view, pos, node) {
  const resolvedPos = view.state.doc.resolve(pos);

  if (resolvedPos.parent.type.name === 'list_item') {
    const parentPos = resolvedPos.before(resolvedPos.depth);
    const transaction = view.state.tr.delete(parentPos, parentPos + resolvedPos.parent.nodeSize);
    return transaction;
  }

  const transaction = view.state.tr.delete(pos, pos + node.nodeSize);
  return transaction;
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

// Track nodes that have been used in tabbed interfaces
const usedNodes = new WeakSet();

/**
 * Insert paragraph spacing between loc nodes/interfaces where needed
 */
function insertLocSpacing(view) {
  const { doc } = view.state;
  let { tr } = view.state;
  let hasChanges = false;

  // Find loc node pairs that need spacing - process in reverse to maintain positions
  const insertions = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'loc_deleted' && node.type.name !== 'loc_added') return;

    const resolvedPos = doc.resolve(pos);
    const { parent } = resolvedPos;
    const indexInParent = resolvedPos.index();

    // Determine if this is part of a tabbed interface or single
    const nextSibling = indexInParent < parent.childCount - 1 ? parent.child(indexInParent + 1) : null;
    const isTabbed = nextSibling &&
                     (nextSibling.type.name === 'loc_deleted' || nextSibling.type.name === 'loc_added') &&
                     node.type.name !== nextSibling.type.name &&
                     hasMatchingContent(node, nextSibling);

    // Find the end position of this interface (single node or tabbed pair)
    const endPos = isTabbed ? pos + node.nodeSize + nextSibling.nodeSize : pos + node.nodeSize;
    const endIndex = isTabbed ? indexInParent + 1 : indexInParent;

    // Check if there's another loc interface immediately after
    if (endIndex + 1 < parent.childCount) {
      const nextNode = parent.child(endIndex + 1);
      if (nextNode.type.name === 'loc_deleted' || nextNode.type.name === 'loc_added') {
        insertions.push(endPos);
      }
    }
  });

  // Insert paragraphs at collected positions (reverse order to maintain positions)
  insertions.reverse().forEach((pos) => {
    const emptyParagraph = view.state.schema.nodes.paragraph.create();
    tr = tr.insert(pos, emptyParagraph);
    hasChanges = true;
  });

  if (hasChanges) {
    view.dispatch(tr);
  }
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

  // Check that each child node has the same type
  for (let i = 0; i < contentA.length; i += 1) {
    if (contentA[i].type.name !== contentB[i].type.name) {
      return false;
    }
  }

  // If they are blocks, they must be the same block type
  if (contentA[1].type.name === 'table' && contentB[1].type.name === 'table') {
    const blockA = getFirstText(contentA[1])?.split(' ')[0];
    const blockB = getFirstText(contentB[1])?.split(' ')[0];
    return blockA === blockB;
  }

  return true;
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

      // Skip if this node has already been used
      if (usedNodes.has(thisNode)) {
        this.dom = document.createElement('span');
        this.dom.style.display = 'none';
        this.dom.style.position = 'absolute';
        this.dom.style.width = '0';
        this.dom.style.height = '0';
        this.dom.style.overflow = 'hidden';
        return;
      }

      // Check if this node can form a pair with the next sibling
      let canFormPair = false;
      let nextSibling = null;

      if (indexInParent < parent.childCount - 1) {
        nextSibling = parent.child(indexInParent + 1);

        // Check if nodes are complementary loc types
        if (
          (thisNode.type.name === 'loc_deleted' || thisNode.type.name === 'loc_added')
          && (nextSibling.type.name === 'loc_added' || nextSibling.type.name === 'loc_deleted')
          && thisNode.type.name !== nextSibling.type.name
          && !usedNodes.has(nextSibling)
        ) {
          // Check if content structure matches
          if (hasMatchingContent(thisNode, nextSibling)) {
            canFormPair = true;
          }
        }
      }

      if (canFormPair) {
        // Mark both nodes as used
        usedNodes.add(thisNode);
        usedNodes.add(nextSibling);
        this.renderTabbedInterface(thisNode, view, pos, nextSibling);
      } else {
        this.renderSingleNode(node, view, pos, isUpstream);
      }
    }

    renderTabbedInterface(nodeA, view, posA, nodeB) {
      this.dom = document.createElement('div');
      this.dom.className = 'loc-tabbed-container';

      // Determine which is deleted and which is added
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

      // Overlay tint that reflects the currently visible variant
      const colorOverlay = document.createElement('div');
      colorOverlay.className = 'loc-tabbed-color-overlay';
      colorOverlay.style.backgroundColor = LOC.LOCAL.COVER_BG; // default to Local

      const setActiveTab = (targetTab) => {
        const panes = tabContent.querySelectorAll('.loc-tab-pane');
        panes.forEach((pane) => {
          pane.classList.toggle('active', pane.dataset.tab === targetTab);
        });

        if (targetTab === 'added') {
          colorOverlay.style.display = 'block';
          colorOverlay.style.backgroundColor = LOC.LOCAL.COVER_BG;
        } else if (targetTab === 'deleted') {
          colorOverlay.style.display = 'block';
          colorOverlay.style.backgroundColor = LOC.UPSTREAM.COVER_BG;
        } else { // diff
          colorOverlay.style.backgroundColor = LOC.DIFF.COVER_BG;
        }

        // Toggle active state on composite buttons to reflect selected view
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

      const actions = createTabbedActions(
        () => this.handleKeepDeleted(deletedNode, view, deletedPos, addedNode, addedPos),
        () => this.handleKeepAdded(addedNode, view, addedPos, deletedNode, deletedPos),
        () => this.handleKeepBoth(deletedNode, view, deletedPos, addedNode, addedPos),
        setActiveTab,
      );

      this.dom.appendChild(tabContent);
      tabContent.appendChild(colorOverlay);
      // Place actions outside content for proper absolute positioning
      this.dom.appendChild(actions);

      // Start in Local view
      setActiveTab('added');
    }

    renderSingleNode(node, view, pos, upstream) {
      this.dom = document.createElement(node.type.name === 'loc_deleted' ? 'da-loc-deleted' : 'da-loc-added');
      const serializer = DOMSerializer.fromSchema(this.schema);
      const nodeDOM = serializer.serializeFragment(node.content);

      this.dom.appendChild(nodeDOM);
      const coverDiv = getCoverDiv(upstream);
      this.dom.appendChild(coverDiv);
      const { overlay, deleteBtn, keepBtn } = getLangOverlay(upstream);
      this.langOverlay = overlay;

      deleteBtn.addEventListener('click', () => {
        dispatchTransaction(deleteLocContent(view, pos, node));
      });

      keepBtn.addEventListener('click', () => {
        dispatchTransaction(keepLocContentInPlace(view, pos, node));
      });

      coverDiv.appendChild(this.langOverlay);
    }

    handleKeepDeleted(deletedNode, view, deletedPos, addedNode, addedPos) {
      // Keep deleted content and delete added content
      // Extract content from deleted node without mutating the original
      const filteredContent = deletedNode.content.content.filter((c) => c.content.content.length);
      const newFragment = Fragment.fromArray(filteredContent);
      const newSlice = new Slice(newFragment, 0, 0);

      // Calculate the range to replace (both nodes)
      const startPos = Math.min(deletedPos, addedPos);
      const endPos = Math.max(deletedPos + deletedNode.nodeSize, addedPos + addedNode.nodeSize);

      // Replace the entire range with just the deleted content
      const tr = view.state.tr.replace(startPos, endPos, newSlice);
      view.dispatch(tr);
    }

    handleKeepAdded(addedNode, view, addedPos, deletedNode, deletedPos) {
      // Keep added content and delete deleted content
      // Extract content from added node without mutating the original
      const filteredContent = addedNode.content.content.filter((c) => c.content.content.length);
      const newFragment = Fragment.fromArray(filteredContent);
      const newSlice = new Slice(newFragment, 0, 0);

      // Calculate the range to replace (both nodes)
      const startPos = Math.min(deletedPos, addedPos);
      const endPos = Math.max(deletedPos + deletedNode.nodeSize, addedPos + addedNode.nodeSize);

      // Replace the entire range with just the added content
      const tr = view.state.tr.replace(startPos, endPos, newSlice);
      view.dispatch(tr);
    }

    handleKeepBoth(deletedNode, view, deletedPos, addedNode, addedPos) {
      // Keep both nodes by combining their content
      // Extract content from both nodes
      const deletedContent = deletedNode.content.content.filter((c) => c.content.content.length);
      const addedContent = addedNode.content.content.filter((c) => c.content.content.length);

      // Combine both contents
      const combinedContent = [...deletedContent, ...addedContent];
      const newFragment = Fragment.fromArray(combinedContent);
      const newSlice = new Slice(newFragment, 0, 0);

      // Calculate the range to replace (both nodes)
      const startPos = Math.min(deletedPos, addedPos);
      const endPos = Math.max(deletedPos + deletedNode.nodeSize, addedPos + addedNode.nodeSize);

      // Replace the entire range with the combined content
      const tr = view.state.tr.replace(startPos, endPos, newSlice);
      view.dispatch(tr);
    }

    applyKeepOperation(tr, node, pos) {
      // Extract and filter content without mutating the original node
      const filteredContent = node.content.content.filter((c) => c.content.content.length);
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

    stopEvent() { return true; }
  };
}
