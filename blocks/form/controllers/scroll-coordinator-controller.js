import {
  EVENT_FOCUS_ELEMENT,
  EVENT_EDITOR_SCROLL_TO,
  EVENT_NAVIGATION_SCROLL_TO,
} from '../constants.js';

/**
 * Coordinates scroll behavior between editor and navigation panels.
 * Prevents infinite loops by tracking coordination state.
 */
export default class ScrollCoordinatorController {
  constructor(host) {
    this.host = host;
    this._coordinating = false;
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
    const {
      pointer,
      coordinated,
      scrollEditor = true,
      scrollNavigation = true,
      targetFieldPointer,
    } = e?.detail || {};

    if (pointer == null || this._coordinating || coordinated) return;

    e.stopImmediatePropagation();
    this._coordinating = true;

    window.dispatchEvent(new CustomEvent(EVENT_FOCUS_ELEMENT, {
      detail: {
        pointer,
        coordinated: true,
        scrollEditor,
        scrollNavigation,
        targetFieldPointer,
      },
      bubbles: true,
      composed: true,
    }));

    this._dispatchScrollEvents(pointer, targetFieldPointer, scrollEditor, scrollNavigation);
    Promise.resolve().then(() => { this._coordinating = false; });
  }

  _dispatchScrollEvents(pointer, targetFieldPointer, scrollEditor, scrollNavigation) {
    const scrollPointer = targetFieldPointer ?? pointer;

    if (scrollEditor) {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent(EVENT_EDITOR_SCROLL_TO, {
          detail: { pointer: scrollPointer },
          bubbles: true,
          composed: true,
        }));
      });
    }

    if (scrollNavigation) {
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent(EVENT_NAVIGATION_SCROLL_TO, {
          detail: { pointer: scrollPointer },
          bubbles: true,
          composed: true,
        }));
      });
    }
  }
}
