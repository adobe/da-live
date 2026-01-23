import { LAYOUT, EVENT_ACTIVE_STATE_CHANGE, EVENT_FOCUS_ELEMENT } from '../constants.js';

/**
 * Unified ActiveStateController - manages active section tracking,
 * visual indicator, and scroll detection.
 *
 * This controller consolidates three previously separate controllers:
 * - Active state management (pointer tracking)
 * - Visual indicator positioning (navigation highlight)
 * - Scroll visibility detection (IntersectionObserver)
 *
 * Key Features:
 * - Listens to 'active-state-change' events
 * - Automatically positions visual indicator in navigation panel
 * - Detects most visible section while scrolling using IntersectionObserver
 *
 * @example
 * // In FormEditor component:
 * this._activeState = new ActiveStateController(this, {
 *   getDefaultPointer: () => this.formModel?.root?.pointer ?? '',
 *   isPointerValid: (pointer) => this.formModel?.getNode(pointer) != null,
 * });
 *
 * // In child components:
 * import { EVENT_ACTIVE_STATE_CHANGE } from '../constants.js';
 *
 * window.dispatchEvent(new CustomEvent(EVENT_ACTIVE_STATE_CHANGE, {
 *   detail: { pointer: '/field' },
 *   bubbles: true,
 *   composed: true,
 * }));
 */
export default class ActiveStateController {
  /**
   * @param {Object} host - The Lit component that owns this controller
   * @param {Object} options - Configuration options
   * @param {Function} [options.getDefaultPointer] - Returns the default pointer
   *   when current is invalid
   * @param {Function} [options.isPointerValid] - Validates if a pointer exists
   *   in the navigation tree
   * @param {Function} [options.getIndicatorElement] - Returns the indicator
   *   HTMLElement (setup after render)
   * @param {Function} [options.getListElement] - Returns the navigation list
   *   container
   * @param {Function} [options.getRegistry] - Returns the element registry
   *   (pointer -> element Map)
   * @param {number} [options.indicatorOffsetPx] - Vertical offset for
   *   indicator positioning
   * @param {Element} [options.observerRoot] - Root element for
   *   IntersectionObserver (null = viewport)
   * @param {number[]} [options.observerThresholds] - Intersection thresholds
   * @param {string} [options.observerRootMargin] - Root margin for
   *   IntersectionObserver
   */
  constructor(host, {
    // Validation functions
    getDefaultPointer = () => null,
    isPointerValid = () => true,

    // Indicator element access (configured after render by child components)
    getIndicatorElement = () => null,
    getListElement = () => null,
    getRegistry = () => null,
    indicatorOffsetPx = LAYOUT.INDICATOR_OFFSET,

    // IntersectionObserver configuration
    observerRoot = null,
    observerThresholds = [0, 0.25, 0.5, 0.75, 1],
    observerRootMargin = '-80px 0px -70% 0px',
  } = {}) {
    this.host = host;

    // State
    this._pointer = null;
    this._lastUserActionTime = 0;
    this._userActionLockDuration = 800; // ms to ignore scroll after user click

    // Validation
    this.getDefaultPointer = getDefaultPointer;
    this.isPointerValid = isPointerValid;

    // Indicator configuration (from ActiveIndicatorController)
    this.getIndicatorElement = getIndicatorElement;
    this.getListElement = getListElement;
    this.getRegistry = getRegistry;
    this._indicatorOffsetPx = indicatorOffsetPx;
    this._pendingIndicatorFrame = null;

    // Scroll tracking configuration (from VisibleGroupController)
    this._observer = null;
    this._observerRoot = observerRoot;
    this._observerThresholds = observerThresholds;
    this._observerRootMargin = observerRootMargin;
    this._visibleElements = new Map(); // element -> intersectionRatio
    this._scrollThrottle = null;

    // Pre-bind event handlers
    this._handleActiveStateChange = this._handleActiveStateChange.bind(this);
    this._handleFocusElement = this._handleFocusElement.bind(this);

    // Register with Lit lifecycle
    host.addController(this);
  }

  /**
   * Get the currently active navigation pointer.
   * @returns {string|null} Current active pointer or null if none
   */
  get pointer() {
    return this._pointer;
  }

  // ============================================
  // PUBLIC API
  // ============================================

  /**
   * Setup scroll tracking with IntersectionObserver.
   * Call this after DOM is ready with a function that returns group elements.
   *
   * @param {Function} getGroupElements - Returns array of group elements
   * @param {number} [headerOffset] - Optional header offset in pixels
   *   (overrides default rootMargin)
   *
   * @example
   * // Using element registry (preferred - filter to only group elements)
   * activeState.setupScrollTracking(
   *   () => this._registry.getElements()
   *     .filter(el => el.tagName?.toLowerCase() === 'form-item-group'),
   *   120 // header offset in pixels
   * );
   */
  setupScrollTracking(getGroupElements, headerOffset) {
    // Disconnect and clean up existing observer if present
    if (this._observer) {
      this._observer.disconnect();
      this._visibleElements.clear();
    }

    // Use dynamic header offset if provided, otherwise use default rootMargin
    const rootMargin = headerOffset != null
      ? `-${headerOffset}px 0px -70% 0px`
      : this._observerRootMargin;

    this._observer = new IntersectionObserver(
      (entries) => {
        // Update visibility map based on intersection changes
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this._visibleElements.set(entry.target, entry.intersectionRatio);
          } else {
            this._visibleElements.delete(entry.target);
          }
        }

        // Throttle scroll updates using requestAnimationFrame
        this._scheduleScrollUpdate();
      },
      {
        root: this._observerRoot,
        threshold: this._observerThresholds,
        rootMargin,
      },
    );

    // Observe all group elements with safety check
    const elements = getGroupElements();
    if (Array.isArray(elements)) {
      elements.forEach((el) => {
        if (el) this._observer.observe(el);
      });
    }
  }

  /**
   * Manually trigger indicator position update.
   * Useful for handling window resize or layout changes.
   */
  updateIndicator() {
    this._scheduleIndicatorUpdate();
  }

  /**
   * Setup indicator element references (called from navigation component).
   * Cleaner than directly mutating controller properties.
   *
   * @param {Object} config - Configuration object
   * @param {Function} config.getIndicatorElement - Returns indicator element
   * @param {Function} config.getListElement - Returns list element
   * @param {Function} config.getRegistry - Returns element registry
   */
  setupIndicator({ getIndicatorElement, getListElement, getRegistry }) {
    this.getIndicatorElement = getIndicatorElement;
    this.getListElement = getListElement;
    this.getRegistry = getRegistry;
  }

  // ============================================
  // EVENT HANDLING
  // ============================================

  /**
   * Handle EVENT_FOCUS_ELEMENT (user-initiated navigation).
   * Sets a lock to prevent scroll events from overriding user clicks.
   *
   * @private
   * @param {CustomEvent} e - Event with {pointer, source, ...}
   */
  _handleFocusElement(e) {
    const { pointer, source } = e?.detail || {};
    if (pointer == null) return;

    // Set lock timestamp for user-initiated actions
    // This prevents scroll events from overriding for a short period
    if (source) {
      this._lastUserActionTime = Date.now();
    }
  }

  /**
   * Handle 'active-state-change' events.
   *
   * Event structure:
   * - detail.pointer: The pointer to make active
   *
   * Coordination:
   * - Tracks event source using internal flag (_isScrollEvent)
   * - User clicks set a lock via EVENT_FOCUS_ELEMENT handler
   * - Scroll events are ignored during lock period (800ms)
   *
   * @private
   * @param {CustomEvent} e - Event with {pointer}
   */
  _handleActiveStateChange(e) {
    const { pointer } = e?.detail || {};
    // Allow empty string pointer (root element), but not null/undefined
    if (pointer == null) return;

    // Detect if this is a user-initiated action vs scroll-based
    // Scroll actions come from _handleScrollVisibility
    const isFromScroll = this._isScrollEvent;

    if (isFromScroll) {
      // Check if we're in user action lock period
      const timeSinceUserAction = Date.now() - this._lastUserActionTime;
      if (timeSinceUserAction < this._userActionLockDuration) {
        // Ignore scroll updates during lock period
        return;
      }
    }

    this._updatePointer(pointer);
  }

  // ============================================
  // STATE UPDATES
  // ============================================

  /**
   * Update active pointer and trigger dependent updates.
   * @private
   * @param {string} newPointer - New pointer value
   */
  _updatePointer(newPointer) {
    if (this._pointer === newPointer) return;

    this._pointer = newPointer;
    this.host.requestUpdate();
    this._scheduleIndicatorUpdate();
  }

  // ============================================
  // SCROLL VISIBILITY TRACKING
  // ============================================

  /**
   * Throttle scroll updates using requestAnimationFrame.
   * @private
   */
  _scheduleScrollUpdate() {
    if (this._scrollThrottle) return;

    this._scrollThrottle = requestAnimationFrame(() => {
      this._scrollThrottle = null;
      this._handleScrollVisibility();
    });
  }

  /**
   * Find most visible element and dispatch state change event.
   * @private
   */
  _handleScrollVisibility() {
    let mostVisible = null;
    let highestRatio = 0;

    // Find element with highest intersection ratio
    for (const [element, ratio] of this._visibleElements) {
      if (ratio > highestRatio) {
        highestRatio = ratio;
        mostVisible = element;
      }
    }

    if (mostVisible) {
      const pointer = mostVisible.getAttribute('pointer');
      // Allow empty string pointer (root element), but not null/undefined
      if (pointer != null) {
        // Mark this as a scroll event for coordination
        this._isScrollEvent = true;

        // Dispatch active state change for scroll-based update
        window.dispatchEvent(new CustomEvent(EVENT_ACTIVE_STATE_CHANGE, {
          detail: { pointer },
          bubbles: true,
          composed: true,
        }));

        // Reset flag
        this._isScrollEvent = false;
      }
    }
  }

  // ============================================
  // INDICATOR POSITIONING
  // ============================================

  /**
   * Schedule indicator position update using requestAnimationFrame.
   * Debounces rapid successive updates to prevent visual "shaking".
   * @private
   */
  _scheduleIndicatorUpdate() {
    if (this._pendingIndicatorFrame) {
      cancelAnimationFrame(this._pendingIndicatorFrame);
    }

    this._pendingIndicatorFrame = requestAnimationFrame(() => {
      this._pendingIndicatorFrame = null;
      this._updateIndicatorPosition();
    });
  }

  /**
   * Calculate and apply indicator position based on active pointer.
   * @private
   */
  _updateIndicatorPosition() {
    const indicator = this.getIndicatorElement();
    const list = this.getListElement();
    const registry = this.getRegistry();

    // Hide indicator if any required element is missing
    // Allow empty string pointer (root element)
    if (!indicator || !list || !registry || this._pointer == null) {
      if (indicator) indicator.style.height = '0px';
      return;
    }

    const target = registry.get(this._pointer);
    if (!target) {
      indicator.style.height = '0px';
      return;
    }

    // Calculate position relative to container
    const containerRect = list.getBoundingClientRect();

    // Use the label element (first child) if available, otherwise use target itself
    const labelEl = target.firstElementChild || target;
    const labelRect = labelEl.getBoundingClientRect();

    // Calculate vertical position with offset, clamped to 0
    const top = Math.max(0, labelRect.top - containerRect.top - this._indicatorOffsetPx);

    // Get container's line height for fallback sizing
    const containerLineHeight = parseFloat(getComputedStyle(list).lineHeight);
    const fallbackHeight = Number.isFinite(containerLineHeight)
      ? containerLineHeight
      : LAYOUT.FALLBACK_LINE_HEIGHT;

    // Use the larger of label height or line height
    const height = Math.max(0, Math.max(labelRect.height, fallbackHeight));

    // Apply calculated styles
    indicator.style.top = `${Math.round(top)}px`;
    indicator.style.height = `${Math.round(height)}px`;
  }

  // ============================================
  // LIT CONTROLLER LIFECYCLE
  // ============================================

  /**
   * Lit lifecycle: Called when the host component is connected to the DOM.
   * Sets up event listeners.
   */
  hostConnected() {
    window.addEventListener(EVENT_ACTIVE_STATE_CHANGE, this._handleActiveStateChange);
    window.addEventListener(EVENT_FOCUS_ELEMENT, this._handleFocusElement);
  }

  /**
   * Lit lifecycle: Called when the host component is disconnected from the DOM.
   * Cleans up event listeners, observers, and pending animations.
   */
  hostDisconnected() {
    // Cleanup event listeners
    window.removeEventListener(EVENT_ACTIVE_STATE_CHANGE, this._handleActiveStateChange);
    window.removeEventListener(EVENT_FOCUS_ELEMENT, this._handleFocusElement);

    // Cancel pending animation frames
    if (this._pendingIndicatorFrame) {
      cancelAnimationFrame(this._pendingIndicatorFrame);
      this._pendingIndicatorFrame = null;
    }

    if (this._scrollThrottle) {
      cancelAnimationFrame(this._scrollThrottle);
      this._scrollThrottle = null;
    }

    // Disconnect and cleanup observer
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }

    // Clear state
    this._visibleElements.clear();
    this._lastUserActionTime = 0;
  }

  /**
   * Lit lifecycle: Called after the host component has updated.
   * Validates the current pointer and falls back to default if invalid.
   */
  hostUpdated() {
    // Check if current pointer is null or invalid
    if (this._pointer == null || !this.isPointerValid(this._pointer)) {
      const defaultPointer = this.getDefaultPointer();

      // Only update if default is different (avoids unnecessary re-renders)
      if (this._pointer !== defaultPointer) {
        this._pointer = defaultPointer;
        this.host.requestUpdate();
      }
    }
  }
}
