import { markActive } from './menuUtils.js';

const TOOLBAR_CLASS = 'floating-text-toolbar';
const ITEM_WRAPPER_CLASS = 'ProseMirror-menu-dropdown-item';
const ACTIVE_CLASS = 'active';
const CLOSE_DELAY = 100;
const POSITION_OFFSET = 10;
const SCREEN_EDGE_PADDING = 10;

const TEXT_FORMATTING_CLASSES = [
  'edit-bold',
  'edit-italic',
  'edit-underline',
  'edit-strikethrough',
  'edit-sup',
  'edit-sub',
  'edit-code',
];

const BLOCK_TYPE_PREFIXES = {
  heading: 'menu-item-h',
  blockquote: 'menu-item-blockquote',
  codeblock: 'menu-item-codeblock',
};

/**
 * Reorders text blocks into rows for the floating toolbar layout
 * @param {Array} textBlocks - Array of menu items
 * @returns {Array} Reordered array with text formatting in row 1, block types in row 2
 */
function reorderToolbarItems(textBlocks) {
  const paragraphItem = textBlocks.find((item) => item.spec.class === 'menu-item-para');
  
  const row1Items = textBlocks.filter((item) => {
    const className = item.spec.class || '';
    return TEXT_FORMATTING_CLASSES.includes(className);
  });
  
  const row2Items = [paragraphItem, ...textBlocks.filter((item) => {
    const className = item.spec.class || '';
    return className.startsWith(BLOCK_TYPE_PREFIXES.heading) || 
           className === BLOCK_TYPE_PREFIXES.blockquote || 
           className === BLOCK_TYPE_PREFIXES.codeblock;
  })];
  
  return [...row1Items, ...row2Items];
}

/**
 * Creates a toolbar button with event handlers
 * @param {Object} menuItem - The menu item configuration
 * @param {EditorView} view - The ProseMirror editor view
 * @param {HTMLElement} toolbar - The toolbar element
 * @returns {HTMLElement} The created button element
 */
function createToolbarButton(menuItem, view, toolbar) {
  const button = document.createElement('div');
  const className = menuItem.spec.class || '';
  
  button.className = className;
  button.title = menuItem.spec.title || '';
  button.menuItem = menuItem;
  
  // Set initial active state
  if (menuItem.spec.active && menuItem.spec.active(view.state)) {
    button.classList.add(ACTIVE_CLASS);
  }
  
  // Handle button click
  button.onmousedown = (e) => {
    e.preventDefault();
    if (menuItem.spec.run) {
      menuItem.spec.run(view.state, view.dispatch);
      view.focus();
      setTimeout(() => {
        toolbar.style.display = 'none';
      }, CLOSE_DELAY);
    }
  };
  
  return button;
}

/**
 * Creates the floating toolbar element with text formatting options
 * @param {EditorView} view - The ProseMirror editor view
 * @param {Array} textBlocks - Array of menu items for text formatting
 * @returns {HTMLElement} The floating toolbar element
 */
function createFloatingToolbar(view, textBlocks) {
  const toolbar = document.createElement('div');
  toolbar.className = TOOLBAR_CLASS;
  
  const reorderedBlocks = reorderToolbarItems(textBlocks);
  
  reorderedBlocks.forEach((menuItem) => {
    const itemWrapper = document.createElement('div');
    itemWrapper.className = ITEM_WRAPPER_CLASS;
    
    const button = createToolbarButton(menuItem, view, toolbar);
    itemWrapper.appendChild(button);
    toolbar.appendChild(itemWrapper);
  });
  
  // Append to the ProseMirror container (within Shadow DOM)
  view.dom.parentNode.appendChild(toolbar);
  
  // Store the reordered blocks on the toolbar for later reference
  toolbar.textBlocks = reorderedBlocks;
  
  return toolbar;
}

/**
 * Updates the active state of a button based on current editor state
 * @param {HTMLElement} button - The button element
 * @param {EditorState} state - The ProseMirror editor state
 */
function updateButtonActiveState(button, state) {
  const { menuItem } = button;
  if (!menuItem || !menuItem.spec.active) return;
  
  const isActive = menuItem.spec.active(state);
  button.classList.toggle(ACTIVE_CLASS, isActive);
}

/**
 * Adjusts toolbar horizontal position to keep it within container bounds
 * @param {HTMLElement} toolbar - The toolbar element
 * @param {DOMRect} toolbarRect - The toolbar's bounding rectangle
 * @param {DOMRect} containerRect - The container's bounding rectangle
 */
function adjustHorizontalPosition(toolbar, toolbarRect, containerRect) {
  const containerWidth = containerRect.width;
  
  if (toolbarRect.left < containerRect.left + SCREEN_EDGE_PADDING) {
    toolbar.style.left = `${SCREEN_EDGE_PADDING}px`;
    toolbar.style.transform = 'none';
  } else if (toolbarRect.right > containerRect.right - SCREEN_EDGE_PADDING) {
    toolbar.style.left = `${containerWidth - toolbarRect.width - SCREEN_EDGE_PADDING}px`;
    toolbar.style.transform = 'none';
  } else {
    toolbar.style.transform = 'translateX(-50%)';
  }
}

/**
 * Positions the floating toolbar above the current selection
 * @param {EditorView} view - The ProseMirror editor view
 * @param {HTMLElement} toolbar - The floating toolbar element
 */
function positionToolbar(view, toolbar) {
  const { from, to } = view.state.selection;
  const start = view.coordsAtPos(from);
  const end = view.coordsAtPos(to);
  
  const container = view.dom.parentNode;
  const containerRect = container.getBoundingClientRect();
  
  // Calculate center position relative to the container
  const left = (start.left + end.left) / 2 - containerRect.left;
  const top = start.top - containerRect.top;
  
  // Position toolbar above selection
  toolbar.style.display = 'grid';
  toolbar.style.left = `${left}px`;
  toolbar.style.top = `${top - toolbar.offsetHeight - POSITION_OFFSET}px`;
  
  // Adjust horizontal position if toolbar goes off-screen
  const toolbarRect = toolbar.getBoundingClientRect();
  adjustHorizontalPosition(toolbar, toolbarRect, containerRect);
  
  // Update active states for all buttons
  const buttons = toolbar.querySelectorAll(`.${ITEM_WRAPPER_CLASS} > div`);
  buttons.forEach((button) => updateButtonActiveState(button, view.state));
}

/**
 * Checks if the selection is an image node
 * @param {Selection} selection - The ProseMirror selection
 * @returns {boolean} True if an image is selected
 */
function isImageSelected(selection) {
  return selection?.node?.type.name === 'image';
}

/**
 * Checks if the selection is in the first row of a table (block name row)
 * @param {ResolvedPos} $from - The resolved position at the start of selection
 * @returns {boolean} True if selection is in the first table row
 */
function isInFirstTableRow($from) {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name === 'table') {
      return $from.index(depth) === 0;
    }
  }
  return false;
}

/**
 * Checks if the floating toolbar should be shown for the current selection
 * @param {EditorView} view - The ProseMirror editor view
 * @returns {boolean} True if the toolbar should be shown
 */
function shouldShowToolbar(view) {
  const { from, to, $from } = view.state.selection;
  
  // Must have a text selection (not just a cursor)
  if (from === to) return false;
  
  // Don't show for image selections
  if (isImageSelected(view.state.selection)) return false;
  
  // Don't show if entire selection is a link
  const linkMarkType = view.state.schema.marks.link;
  if (markActive(view.state, linkMarkType)) return false;
  
  // Don't show in the first row of a table (block name row)
  if (isInFirstTableRow($from)) return false;
  
  return true;
}

/**
 * Closes the toolbar and clears the selection
 * @param {EditorView} view - The ProseMirror editor view
 * @param {HTMLElement} toolbar - The floating toolbar element
 */
function closeToolbar(view, toolbar) {
  toolbar.style.display = 'none';
  view.dispatch(view.state.tr.setSelection(
    view.state.selection.constructor.near(view.state.doc.resolve(view.state.selection.from))
  ));
  view.focus();
}

/**
 * Creates a click outside handler for the floating toolbar
 * @param {EditorView} view - The ProseMirror editor view
 * @param {HTMLElement} toolbar - The floating toolbar element
 * @returns {Function} The click handler function that can be used with addEventListener/removeEventListener
 */
function createClickOutsideHandler(view, toolbar) {
  return (e) => {
    // Only handle clicks when toolbar is visible
    if (toolbar.style.display !== 'grid') return;
    
    // Check if click is outside toolbar and editor
    const clickedInToolbar = toolbar.contains(e.target);
    const clickedInEditor = view.dom.contains(e.target);
    
    if (!clickedInToolbar && !clickedInEditor) {
      closeToolbar(view, toolbar);
    }
  };
}

export {
  createFloatingToolbar,
  positionToolbar,
  shouldShowToolbar,
  createClickOutsideHandler,
};

