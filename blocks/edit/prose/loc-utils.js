import {
  DOMSerializer,
  Fragment,
  Slice,
} from 'da-y-wrapper';

const LOC = {
  UPSTREAM: {
    BG: 'rgba(70, 130, 180, 0.8)',
    COVER_BG: 'rgba(70, 130, 180, 0.4)',
    TEXT: 'Upstream Content',
    TEXT_COLOR: 'rgba(70, 130, 180)',
  },
  LOCAL: {
    BG: 'rgba(144, 42, 222, 0.8)',
    COVER_BG: 'rgba(144, 42, 222, 0.4)',
    TEXT: 'Local Content',
    TEXT_COLOR: 'rgba(144, 42, 222)',
  },
};

// Load htmldiff library
let htmldiff = null;

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

/**
 * Create tab navigation for the tabbed interface
 */
function createTabNavigation(activeTab = 'deleted') {
  const nav = document.createElement('div');
  nav.className = 'loc-tab-nav';

  const tabs = [
    { id: 'deleted', label: 'Deleted', color: LOC.UPSTREAM.TEXT_COLOR },
    { id: 'added', label: 'Added', color: LOC.LOCAL.TEXT_COLOR },
    { id: 'diff', label: 'Diff', color: '#666' },
  ];

  tabs.forEach((tab) => {
    const tabButton = document.createElement('button');
    tabButton.className = `loc-tab-button ${activeTab === tab.id ? 'active' : ''}`;
    tabButton.textContent = tab.label;
    tabButton.dataset.tab = tab.id;
    tabButton.style.borderBottomColor = tab.color;
    nav.appendChild(tabButton);
  });

  return nav;
}

/**
 * Convert DocumentFragment to HTML string
 */
function fragmentToHTML(fragment) {
  if (!fragment) return '';

  // If it's already a string, return it
  if (typeof fragment === 'string') return fragment;

  // Create a temporary container to get the HTML
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment.cloneNode(true));
  return tempDiv.innerHTML;
}

/**
 * Generate HTML diff between deleted and added content
 */
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

/**
 * Create tab content container
 */
function createTabContent(deletedContent, addedContent) {
  const container = document.createElement('div');
  container.className = 'loc-tab-content';

  // Deleted content tab
  const deletedTab = document.createElement('div');
  deletedTab.className = 'loc-tab-pane active';
  deletedTab.dataset.tab = 'deleted';
  // Clone the content since DocumentFragments can only be in one place
  if (deletedContent) {
    deletedTab.appendChild(deletedContent.cloneNode(true));
  }

  // Added content tab
  const addedTab = document.createElement('div');
  addedTab.className = 'loc-tab-pane';
  addedTab.dataset.tab = 'added';
  // Clone the content since DocumentFragments can only be in one place
  if (addedContent) {
    addedTab.appendChild(addedContent.cloneNode(true));
  }

  // Diff content tab
  const diffTab = document.createElement('div');
  diffTab.className = 'loc-tab-pane';
  diffTab.dataset.tab = 'diff';

  // Initially show loading message
  diffTab.innerHTML = '<p style="text-align: center; color: #666; margin: 20px 0;">Loading diff...</p>';

  // Generate the diff asynchronously using the original fragments
  generateDiff(deletedContent, addedContent).then((diffHTML) => {
    diffTab.innerHTML = diffHTML;
  }).catch((error) => {
    // eslint-disable-next-line no-console
    console.error('Error loading diff:', error);
    diffTab.innerHTML = '<p style="text-align: center; color: #d32f2f; margin: 20px 0;">Error loading diff</p>';
  });

  container.appendChild(deletedTab);
  container.appendChild(addedTab);
  container.appendChild(diffTab);

  return container;
}

/**
 * Create action buttons for the tabbed interface
 */
function createTabbedActions(onKeepDeleted, onKeepAdded, onDeleteBoth) {
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'loc-tabbed-actions';

  const actionButtons = document.createElement('div');
  actionButtons.className = 'loc-action-buttons';

  // Keep Deleted button
  const keepDeletedBtn = document.createElement('button');
  keepDeletedBtn.className = 'loc-action-btn loc-keep-deleted';
  keepDeletedBtn.title = 'Keep Deleted Content';
  keepDeletedBtn.innerHTML = '<span>Keep Deleted</span>';
  keepDeletedBtn.addEventListener('click', onKeepDeleted);

  // Keep Added button
  const keepAddedBtn = document.createElement('button');
  keepAddedBtn.className = 'loc-action-btn loc-keep-added';
  keepAddedBtn.title = 'Keep Added Content';
  keepAddedBtn.innerHTML = '<span>Keep Added</span>';
  keepAddedBtn.addEventListener('click', onKeepAdded);

  // Delete Both button
  const deleteBothBtn = document.createElement('button');
  deleteBothBtn.className = 'loc-action-btn loc-delete-both';
  deleteBothBtn.title = 'Delete Both';
  deleteBothBtn.innerHTML = '<span>Delete Both</span>';
  deleteBothBtn.addEventListener('click', onDeleteBoth);

  actionButtons.appendChild(keepDeletedBtn);
  actionButtons.appendChild(keepAddedBtn);
  actionButtons.appendChild(deleteBothBtn);

  actionsContainer.appendChild(actionButtons);

  return actionsContainer;
}

/**
 * Add tab switching functionality
 */
function addTabSwitching(container) {
  const tabButtons = container.querySelectorAll('.loc-tab-button');
  const tabPanes = container.querySelectorAll('.loc-tab-pane');

  tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const targetTab = button.dataset.tab;

      // Update active tab button
      tabButtons.forEach((btn) => btn.classList.remove('active'));
      button.classList.add('active');

      // Update active tab pane
      tabPanes.forEach((pane) => {
        pane.classList.remove('active');
        if (pane.dataset.tab === targetTab) {
          pane.classList.add('active');
        }
      });
    });
  });
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
  overlay.className = 'loc-lang-overlay';
  overlay.setAttribute('loc-temp-dom', '');
  overlay.style.backgroundColor = upstream
    ? LOC.UPSTREAM.BG
    : LOC.LOCAL.BG;

  const dialog = document.createElement('div');
  dialog.className = 'loc-dialog';
  dialog.innerHTML = `
    <span>${upstream ? LOC.UPSTREAM.TEXT : LOC.LOCAL.TEXT}</span>
    <div>
    <span class="loc-keep"><div title="Keep">Keep</div></span>
    <span class="loc-delete"><div title="Delete">Delete</div></span>
    </div>`;
  dialog.style.color = upstream
    ? LOC.UPSTREAM.TEXT_COLOR
    : LOC.LOCAL.TEXT_COLOR;

  const deleteBtn = dialog.querySelector('.loc-delete');
  const keepBtn = dialog.querySelector('.loc-keep');
  overlay.appendChild(dialog);

  return { overlay, deleteBtn, keepBtn };
}

function keepLocContentInPlace(view, pos, node) {
  node.content.content = node.content.content.filter((c) => c.content.content.length);
  const newFragment = Fragment.fromArray(node.content.content);
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
 * Delete both loc_deleted and loc_added nodes
 */
function deleteBothLocContent(view, deletedPos, deletedNode, addedPos, addedNode) {
  // Delete in reverse order to maintain position integrity
  const transaction = view.state.tr
    .delete(addedPos, addedPos + addedNode.nodeSize)
    .delete(deletedPos, deletedPos + deletedNode.nodeSize);
  return transaction;
}

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

      // Check if this node is the first in a valid pair (with next sibling)
      let isFirstInPair = false;
      let nextSibling = null;
      if (indexInParent < parent.childCount - 1) {
        nextSibling = parent.child(indexInParent + 1);
        if (
          (thisNode.type.name === 'loc_deleted' || thisNode.type.name === 'loc_added')
          && (nextSibling.type.name === 'loc_added' || nextSibling.type.name === 'loc_deleted')
          && thisNode.type.name !== nextSibling.type.name
        ) {
          // Also ensure previous sibling is not a valid pair with this node
          if (
            indexInParent === 0
            || !(
              (parent.child(indexInParent - 1).type.name === 'loc_added'
                || parent.child(indexInParent - 1).type.name === 'loc_deleted')
              && parent.child(indexInParent - 1).type.name !== thisNode.type.name
            )
          ) {
            isFirstInPair = true;
          }
        }
      }

      // Check if this node is the second in a valid pair (with previous sibling)
      let isSecondInPair = false;
      if (indexInParent > 0) {
        const prevSibling = parent.child(indexInParent - 1);
        if (
          (thisNode.type.name === 'loc_deleted' || thisNode.type.name === 'loc_added')
          && (prevSibling.type.name === 'loc_added' || prevSibling.type.name === 'loc_deleted')
          && thisNode.type.name !== prevSibling.type.name
        ) {
          // Only if previous sibling is the first in a pair
          if (
            indexInParent === 1
            || !(
              (parent.child(indexInParent - 2).type.name === 'loc_added'
                || parent.child(indexInParent - 2).type.name === 'loc_deleted')
              && parent.child(indexInParent - 2).type.name !== prevSibling.type.name
            )
          ) {
            isSecondInPair = true;
          }
        }
      }

      if (isFirstInPair) {
        this.renderTabbedInterface(thisNode, view, pos, nextSibling);
      } else if (isSecondInPair) {
        // Render as hidden node
        this.dom = document.createElement('span');
        this.dom.style.display = 'none';
        this.dom.style.position = 'absolute';
        this.dom.style.width = '0';
        this.dom.style.height = '0';
        this.dom.style.overflow = 'hidden';
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

      // Create deleted content
      const serializer = DOMSerializer.fromSchema(this.schema);
      const deletedContent = serializer.serializeFragment(deletedNode.content);
      const addedContent = serializer.serializeFragment(addedNode.content);

      // Create tab navigation
      const tabNav = createTabNavigation('deleted');

      // Create tab content
      const tabContent = createTabContent(deletedContent, addedContent);

      // Create actions
      const actions = createTabbedActions(
        () => this.handleKeepDeleted(deletedNode, view, deletedPos),
        () => this.handleKeepAdded(addedNode, view, addedPos),
        () => this.handleDeleteBoth(deletedNode, view, deletedPos, addedNode, addedPos),
      );

      // Assemble the interface
      this.dom.appendChild(tabNav);
      this.dom.appendChild(tabContent);
      this.dom.appendChild(actions);

      // Add tab switching functionality
      addTabSwitching(this.dom);
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

      coverDiv.addEventListener('mouseover', () => {
        this.langOverlay.style.display = 'flex';
      });

      coverDiv.addEventListener('mouseout', () => {
        this.langOverlay.style.display = 'none';
      });
    }

    handleKeepDeleted(deletedNode, view, deletedPos) {
      const transaction = keepLocContentInPlace(view, deletedPos, deletedNode);
      dispatchTransaction(transaction);
    }

    handleKeepAdded(addedNode, view, addedPos) {
      const transaction = keepLocContentInPlace(view, addedPos, addedNode);
      dispatchTransaction(transaction);
    }

    handleDeleteBoth(deletedNode, view, deletedPos, addedNode, addedPos) {
      const transaction = deleteBothLocContent(
        view,
        deletedPos,
        deletedNode,
        addedPos,
        addedNode,
      );
      dispatchTransaction(transaction);
    }

    destroy() {
      this.coverDiv?.remove();
      this.langOverlay?.remove();
    }

    stopEvent() { return true; }
  };
}
