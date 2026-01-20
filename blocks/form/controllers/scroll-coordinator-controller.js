import {
  EVENT_FOCUS_ELEMENT,
  EVENT_EDITOR_SCROLL_TO,
  EVENT_NAVIGATION_SCROLL_TO,
  EVENT_SOURCE,
} from '../constants.js';

/**
 * Lit controller that coordinates scroll behavior between editor and navigation.
 * Intercepts focus events and dispatches coordinated scroll events to prevent loops.
 * Ensures both panels stay in sync when navigating between sections.
 */
export default class ScrollCoordinatorController {
  constructor(host) {
    this.host = host;
    this._coordinating = false;
    this._focusedPointer = null;
    this._boundOnFocus = this._handleFocus.bind(this);
    host.addController(this);
  }

  hostConnected() {
    window.addEventListener(EVENT_FOCUS_ELEMENT, this._boundOnFocus, { capture: true });
  }

  hostDisconnected() {
    window.removeEventListener(EVENT_FOCUS_ELEMENT, this._boundOnFocus, { capture: true });
  }

  _handleFocus(e) {
    const { pointer, source, coordinated, targetFieldPointer } = e?.detail || {};
    if (pointer == null || this._coordinating || source === EVENT_SOURCE.COORDINATOR || coordinated) return;

    e.stopImmediatePropagation();
    this._coordinating = true;

    const isSame = this._focusedPointer === pointer;
    // Always dispatch coordinated event to update active states in both views
    // Preserve original source so ActiveStateController can detect manual selections
    window.dispatchEvent(new CustomEvent(EVENT_FOCUS_ELEMENT, {
      detail: {
        pointer,
        source: source || EVENT_SOURCE.UNKNOWN,
        originalSource: source,
        noScroll: true,
        coordinated: true,
        targetFieldPointer,
      },
      bubbles: true,
      composed: true,
    }));

    if (!isSame) {
      this._focusedPointer = pointer;
    }

    this._dispatchScrollEvents(pointer, source, e);
    Promise.resolve().then(() => { this._coordinating = false; });
  }

  _dispatchScrollEvents(pointer, source, originalEvent) {
    const scrollMap = {
      [EVENT_SOURCE.NAVIGATION]: [EVENT_EDITOR_SCROLL_TO],
      [EVENT_SOURCE.EDITOR]: [EVENT_NAVIGATION_SCROLL_TO],
      [EVENT_SOURCE.BREADCRUMB]: [EVENT_EDITOR_SCROLL_TO, EVENT_NAVIGATION_SCROLL_TO],
    };

    const targetFieldPointer = originalEvent?.detail?.targetFieldPointer;
    const scrollPointer = targetFieldPointer ?? pointer;

    const events = scrollMap[source] || [];
    events.forEach((eventType) => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent(eventType, {
          detail: { pointer: scrollPointer },
          bubbles: true,
          composed: true,
        }));
      });
    });
  }
}
