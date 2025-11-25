import { EVENT_FOCUS_GROUP, EVENT_EDITOR_SCROLL_TO, EVENT_SIDEBAR_SCROLL_TO } from '../utils/events.js';

/**
 * Coordinates focus/scroll events across editor and sidebar.
 * Prevents ping-pong and orchestrates cross-component scrolling.
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
    // Capture phase to intercept before children
    window.addEventListener(EVENT_FOCUS_GROUP, this._boundOnFocus, { capture: true });
  }

  hostDisconnected() {
    window.removeEventListener(EVENT_FOCUS_GROUP, this._boundOnFocus, { capture: true });
  }

  _handleFocus(e) {
    const { pointer, source, coordinated } = e?.detail || {};
    if (pointer == null || this._coordinating || source === 'coordinator' || coordinated) return;

    e.stopImmediatePropagation();
    this._coordinating = true;

    const isSame = this._focusedPointer === pointer;
    if (!isSame) {
      // Sync visuals without scrolling
      window.dispatchEvent(new CustomEvent(EVENT_FOCUS_GROUP, {
        detail: { pointer, source: 'coordinator', noScroll: true, coordinated: true },
        bubbles: true,
        composed: true,
      }));
      this._focusedPointer = pointer;
    }

    // Orchestrate scrolling
    this._dispatchScrollEvents(pointer, source);
    Promise.resolve().then(() => { this._coordinating = false; });
  }

  _dispatchScrollEvents(pointer, source) {
    const scrollMap = {
      sidebar: [EVENT_EDITOR_SCROLL_TO],
      editor: [EVENT_SIDEBAR_SCROLL_TO],
      breadcrumb: [EVENT_EDITOR_SCROLL_TO, EVENT_SIDEBAR_SCROLL_TO],
    };

    const events = scrollMap[source] || [];
    events.forEach((eventType) => {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent(eventType, {
          detail: { pointer },
          bubbles: true,
          composed: true,
        }));
      });
    });
  }
}
