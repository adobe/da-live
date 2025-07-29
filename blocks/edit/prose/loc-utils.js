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

function createTabNavigation(activeTab = 'added') {
  const nav = document.createElement('div');
  nav.className = 'loc-tab-nav';

  const tabs = [
    { id: 'added', label: 'Local (Added)', color: LOC.LOCAL.TEXT_COLOR },
    { id: 'deleted', label: 'Upstream (Deleted)', color: LOC.UPSTREAM.TEXT_COLOR },
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

function createButton(label, className, onClick) {
  const button = document.createElement('button');
  button.className = className;
  button.title = label;
  button.innerHTML = `<span>${label}</span>`;
  button.addEventListener('click', onClick);
  return button;
}

function createTabbedActions(onKeepDeleted, onKeepAdded, onKeepBoth) {
  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'loc-tabbed-actions';

  const actionButtons = document.createElement('div');
  actionButtons.className = 'loc-action-buttons';

  const keepLocalBtn = createButton(
    'Keep Local',
    'loc-action-btn loc-keep-added',
    onKeepAdded,
  );

  const keepUpstreamBtn = createButton(
    'Keep Upstream',
    'loc-action-btn loc-keep-deleted',
    onKeepDeleted,
  );

  const keepBothBtn = createButton(
    'Keep Both',
    'loc-action-btn loc-keep-both',
    onKeepBoth,
  );

  actionButtons.appendChild(keepLocalBtn);
  actionButtons.appendChild(keepUpstreamBtn);
  actionButtons.appendChild(keepBothBtn);

  actionsContainer.appendChild(actionButtons);

  return actionsContainer;
}

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

      const tabNav = createTabNavigation('added');

      const tabContent = createTabContent(deletedContent, addedContent);

      const actions = createTabbedActions(
        () => this.handleKeepDeleted(deletedNode, view, deletedPos, addedNode, addedPos),
        () => this.handleKeepAdded(addedNode, view, addedPos, deletedNode, deletedPos),
        () => this.handleKeepBoth(deletedNode, view, deletedPos, addedNode, addedPos),
      );

      this.dom.appendChild(tabNav);
      this.dom.appendChild(tabContent);
      this.dom.appendChild(actions);

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
