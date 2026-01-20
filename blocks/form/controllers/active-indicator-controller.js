import { LAYOUT } from '../constants.js';

/**
 * Calculate indicator position relative to target element and container.
 *
 * This function determines where the active indicator should be positioned
 * in the navigation panel by calculating the offset from the container's top edge.
 *
 * @param {HTMLElement} target - The navigation item element to highlight
 * @param {HTMLElement} container - The navigation list container
 * @param {number} offsetPx - Vertical offset adjustment in pixels
 * @returns {{top: number, height: number}} Position object with top offset and height
 */
function calculatePosition(target, container, offsetPx) {
  const containerRect = container.getBoundingClientRect();

  // Use the label element (first child) if available, otherwise use target itself
  const labelEl = target.firstElementChild || target;
  const labelRect = labelEl.getBoundingClientRect();

  // Calculate vertical position relative to container, adjusted by offset
  // Ensure we never get negative values (clamped to 0)
  const top = Math.max(0, labelRect.top - containerRect.top - offsetPx);

  // Get container's line height for fallback sizing
  const containerLineHeight = parseFloat(getComputedStyle(container).lineHeight);
  const fallbackLine = Number.isFinite(containerLineHeight)
    ? containerLineHeight
    : LAYOUT.FALLBACK_LINE_HEIGHT;

  // Use the larger of label height or line height to ensure indicator is visible
  const height = Math.max(0, Math.max(labelRect.height, fallbackLine));

  return { top, height };
}

/**
 * Lit controller that manages the visual "active indicator" in the navigation panel.
 *
 * The active indicator is a visual highlight that shows which navigation item is
 * currently selected. This controller handles:
 * - Calculating the correct position based on the active item
 * - Smoothly animating position changes using requestAnimationFrame
 * - Preventing visual "shaking" by debouncing rapid updates
 * - Hiding the indicator when no item is active
 *
 * @example
 * // In a Lit component:
 * this.activeIndicatorController = new ActiveIndicatorController(this, {
 *   getIndicator: () => this.shadowRoot.querySelector('.indicator'),
 *   getList: () => this.shadowRoot.querySelector('.nav-list'),
 *   getRegistry: () => this.elementRegistry,
 *   offsetPx: 4
 * });
 *
 * // Update indicator position when active item changes:
 * this.activeIndicatorController.updatePosition(newPointer);
 *
 * @note Pointer: A unique identifier (string) for each navigation item, typically
 *       a JSON pointer path like "/section/0/field/1"
 */
export default class ActiveIndicatorController {
  /**
   * @param {Object} host - The Lit component that owns this controller
   * @param {Object} options - Configuration options
   * @param {Function} options.getIndicator - Returns the indicator HTMLElement
   *   This is a function (not direct element) to handle lazy initialization
   * @param {Function} options.getList - Returns the navigation list
   *   container HTMLElement
   * @param {Function} options.getRegistry - Returns the element registry
   *   (Map of pointer -> element). The registry maps navigation item
   *   identifiers to their DOM elements
   * @param {number} [options.offsetPx=LAYOUT.INDICATOR_OFFSET] - Vertical
   *   offset adjustment in pixels
   */
  constructor(host, {
    getIndicator,
    getList,
    getRegistry,
    offsetPx = LAYOUT.INDICATOR_OFFSET,
  } = {}) {
    this.host = host;

    // Store getter functions (not elements) to support dynamic/lazy initialization
    this.getIndicator = getIndicator;
    this.getList = getList;
    this.getRegistry = getRegistry;
    this.offsetPx = offsetPx;

    // Track current active item identifier
    this._currentPointer = null;

    // Track pending animation frame ID for debouncing
    // This prevents rapid successive updates from causing visual "shaking"
    this._pendingFrame = null;

    // Register this controller with the Lit component lifecycle
    host.addController(this);
  }

  /**
   * Update indicator position to highlight a specific navigation item.
   *
   * This method uses requestAnimationFrame to schedule the update, which:
   * - Ensures smooth animations by syncing with browser repaints
   * - Prevents visual "shaking" by debouncing rapid successive calls
   * - Improves performance by batching DOM updates
   *
   * @param {string|null} pointer - Navigation item identifier
   *   (e.g., "/section/0/field/1"). Pass null to hide the indicator
   */
  updatePosition(pointer) {
    // Cancel any pending update to avoid multiple updates in the same frame
    if (this._pendingFrame) {
      cancelAnimationFrame(this._pendingFrame);
      this._pendingFrame = null;
    }

    // Schedule update for the next animation frame (~16ms for 60fps)
    this._pendingFrame = requestAnimationFrame(() => {
      this._pendingFrame = null;
      this._applyPosition(pointer);
    });
  }

  /**
   * Internal method to immediately apply the indicator position.
   *
   * This does the actual work of:
   * 1. Looking up the target element from the registry
   * 2. Calculating its position relative to the container
   * 3. Updating the indicator's CSS position and size
   *
   * @private
   * @param {string|null} pointer - Navigation item identifier
   */
  _applyPosition(pointer) {
    // Hide indicator if no pointer provided
    if (pointer == null) {
      this._hideIndicator();
      return;
    }

    this._currentPointer = pointer;

    // Get required elements via getter functions
    // Using optional chaining (?.) to safely handle undefined getters
    const indicator = this.getIndicator?.();
    const list = this.getList?.();
    const registry = this.getRegistry?.();

    // Validate all required elements exist
    if (!indicator || !list || !registry) {
      this._hideIndicator();
      return;
    }

    // Look up the target navigation item element
    const target = registry.get(pointer);
    if (!target) {
      this._hideIndicator();
      return;
    }

    // Calculate position and apply to indicator
    const position = calculatePosition(target, list, this.offsetPx);
    indicator.style.top = `${Math.round(position.top)}px`;
    indicator.style.height = `${Math.round(position.height)}px`;
  }

  /**
   * Hide the indicator by setting its height to 0.
   * @private
   */
  _hideIndicator() {
    const indicator = this.getIndicator?.();
    if (indicator) {
      indicator.style.height = '0px';
    }
  }

  /**
   * Lit lifecycle: Called when the host component is connected to the DOM.
   * @see https://lit.dev/docs/composition/controllers/#host-update-cycle
   */
  hostConnected() {
    // No initialization needed - controller is ready to use
  }

  /**
   * Lit lifecycle: Called when the host component is disconnected from the DOM.
   * Performs cleanup to prevent memory leaks.
   * @see https://lit.dev/docs/composition/controllers/#host-update-cycle
   */
  hostDisconnected() {
    // Cancel any pending animation frame to prevent updates after disconnect
    if (this._pendingFrame) {
      cancelAnimationFrame(this._pendingFrame);
      this._pendingFrame = null;
    }

    // Clear state
    this._currentPointer = null;
  }
}
