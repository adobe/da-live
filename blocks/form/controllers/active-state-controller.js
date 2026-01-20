import { EVENT_FOCUS_ELEMENT, EVENT_VISIBLE_GROUP, EVENT_SOURCE } from '../constants.js';

/**
 * Lit controller that tracks the currently active navigation item in the form.
 *
 * This controller manages a sophisticated state synchronization system that handles
 * two competing sources of "active" state:
 * 1. **Manual user interaction** (clicks, keyboard navigation) - HIGH PRIORITY
 * 2. **Scroll-based visibility** (automatic highlighting) - LOW PRIORITY
 *
 * Key Features:
 * - Listens to focus events (EVENT_FOCUS_ELEMENT) for manual user selections
 * - Listens to visible group events (EVENT_VISIBLE_GROUP) for scroll-based updates
 * - Implements a "manual selection lock" to prevent scroll events from overriding
 *   explicit user choices (prevents jarring UX when user clicks then scrolls)
 * - Validates active pointer and falls back to default when invalid
 * - Triggers host component re-renders when active state changes
 *
 * @example
 * // In a Lit component:
 * this.activeStateController = new ActiveStateController(this, {
 *   getDefaultPointer: () => '/section/0',
 *   isPointerValid: (ptr) => this.navigationTree.has(ptr),
 *   manualSelectionLockMs: 1000 // Lock scroll updates for 1 second after clicks
 * });
 *
 * // Get current active pointer:
 * const currentActive = this.activeStateController.pointer;
 *
 * @note This controller automatically updates breadcrumbs and active indicators
 *       by triggering host.requestUpdate() when the pointer changes
 */
export default class ActiveStateController {
  /**
   * @param {Object} host - The Lit component that owns this controller
   * @param {Object} options - Configuration options
   * @param {Function} [options.getDefaultPointer] - Returns the default pointer
   *   to use when current pointer is null or invalid. Defaults to () => null
   * @param {Function} [options.isPointerValid] - Validates if a pointer exists
   *   in the current navigation tree. Defaults to () => true
   * @param {number} [options.manualSelectionLockMs=1000] - Duration in
   *   milliseconds to lock out scroll-based updates after a manual selection.
   *   This prevents jarring behavior where user clicks an item then scrolls,
   *   and the active indicator jumps away from their selection
   */
  constructor(host, {
    getDefaultPointer,
    isPointerValid,
    manualSelectionLockMs = 1000,
  } = {}) {
    this.host = host;

    // Current active pointer (navigation item identifier)
    this._pointer = null;

    // Manual selection lock configuration and state
    this._manualSelectionLockMs = manualSelectionLockMs;
    this._manualSelectionUntil = 0; // Timestamp when lock expires

    // Validation and default value functions
    this.getDefaultPointer = getDefaultPointer || (() => null);
    this.isPointerValid = isPointerValid || (() => true);

    // Pre-bind event handlers for proper cleanup
    this._boundOnFocus = this._handleFocus.bind(this);
    this._boundOnVisibleGroup = this._handleVisibleGroup.bind(this);

    // Register this controller with the Lit component lifecycle
    host.addController(this);
  }

  /**
   * Get the currently active navigation pointer.
   * @returns {string|null} Current active pointer or null if none
   */
  get pointer() {
    return this._pointer;
  }

  /**
   * Set the active navigation pointer.
   * Triggers a host component re-render if the value changes.
   *
   * @param {string|null} value - New pointer value
   */
  set pointer(value) {
    if (this._pointer !== value) {
      this._pointer = value;
      // Trigger Lit component re-render to update breadcrumbs/indicators
      this.host.requestUpdate();
    }
  }

  /**
   * Lit lifecycle: Called when the host component is connected to the DOM.
   * Sets up event listeners for focus and visibility changes.
   * @see https://lit.dev/docs/composition/controllers/#host-update-cycle
   */
  hostConnected() {
    // Listen to focus events globally (bubbles from form elements)
    window.addEventListener(EVENT_FOCUS_ELEMENT, this._boundOnFocus);

    // Listen to visible group events on the host component
    this.host.addEventListener(EVENT_VISIBLE_GROUP, this._boundOnVisibleGroup);
  }

  /**
   * Lit lifecycle: Called when the host component is disconnected from the DOM.
   * Cleans up event listeners and resets state.
   * @see https://lit.dev/docs/composition/controllers/#host-update-cycle
   */
  hostDisconnected() {
    // Remove event listeners to prevent memory leaks
    window.removeEventListener(EVENT_FOCUS_ELEMENT, this._boundOnFocus);
    this.host.removeEventListener(EVENT_VISIBLE_GROUP, this._boundOnVisibleGroup);

    // Clear manual selection lock
    this._manualSelectionUntil = 0;
  }

  /**
   * Lit lifecycle: Called after the host component has updated.
   * Validates the current pointer and falls back to default if invalid.
   *
   * This handles cases where:
   * - The navigation tree structure changes (items added/removed)
   * - The pointer becomes invalid due to data updates
   * - Initial render when pointer hasn't been set yet
   *
   * @see https://lit.dev/docs/composition/controllers/#host-update-cycle
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

  /**
   * Handle focus events (manual user interactions).
   *
   * Focus events are triggered when users explicitly interact with form elements:
   * - Clicking on navigation items
   * - Clicking on form fields
   * - Using keyboard navigation
   *
   * This handler implements a "manual selection lock" that prevents scroll-based
   * updates from immediately overriding explicit user choices. Without this lock,
   * the UX would be jarring: user clicks an item, scrolls, and the active
   * indicator jumps away from their selection.
   *
   * @private
   * @param {CustomEvent} e - Focus event with detail: {pointer, source,
   *   originalSource}
   */
  _handleFocus(e) {
    const { pointer, source, originalSource } = e?.detail || {};
    if (pointer == null) return;

    // Determine if this is a manual user interaction or automated
    // - originalSource: preserved by coordinator when re-dispatching events
    // - source: direct source if not coordinated
    // - EVENT_SOURCE.COORDINATOR: automated system events
    // - EVENT_SOURCE.UNKNOWN: indeterminate source
    const actualSource = originalSource || source;
    const isManualSelection = actualSource
      && actualSource !== EVENT_SOURCE.COORDINATOR
      && actualSource !== EVENT_SOURCE.UNKNOWN;

    // Lock scroll-based updates for a period after manual selections
    // This ensures user's explicit choice is respected even if they scroll
    if (isManualSelection) {
      this._manualSelectionUntil = Date.now() + this._manualSelectionLockMs;
    }

    // Update active pointer (will trigger re-render)
    this.pointer = pointer;
  }

  /**
   * Handle visible group events (scroll-based automatic highlighting).
   *
   * Visible group events are triggered when scrolling makes a different section
   * visible in the viewport. This provides automatic breadcrumb updates as users
   * scroll through the form.
   *
   * These updates are LOW PRIORITY and will be blocked if a manual selection
   * lock is active (see _handleFocus for details).
   *
   * @private
   * @param {CustomEvent} e - Visible group event with detail: {pointer}
   */
  _handleVisibleGroup(e) {
    const { pointer } = e?.detail || {};
    if (pointer == null) return;

    // Check if manual selection lock is active
    // If user recently clicked something, don't override with scroll updates
    if (Date.now() < this._manualSelectionUntil) {
      return; // Lock active - ignore this scroll-based update
    }

    // No lock active - safe to update from scroll position
    this.pointer = pointer;
  }
}
