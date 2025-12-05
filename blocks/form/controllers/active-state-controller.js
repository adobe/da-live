import { EVENT_FOCUS_ELEMENT } from '../constants.js';

/**
 * Lit controller that tracks the currently active pointer in the form.
 * Listens to focus events and triggers host re-renders when active state changes.
 * Validates active pointer and falls back to default when invalid.
 */
export default class ActiveStateController {
  constructor(host, {
    getDefaultPointer,
    isPointerValid,
  } = {}) {
    this.host = host;
    this._pointer = null;
    this.getDefaultPointer = getDefaultPointer || (() => null);
    this.isPointerValid = isPointerValid || (() => true);
    this._boundOnFocus = this._handleFocus.bind(this);
    host.addController(this);
  }

  get pointer() {
    return this._pointer;
  }

  set pointer(value) {
    if (this._pointer !== value) {
      this._pointer = value;
      this.host.requestUpdate();
    }
  }

  hostConnected() {
    window.addEventListener(EVENT_FOCUS_ELEMENT, this._boundOnFocus);
  }

  hostDisconnected() {
    window.removeEventListener(EVENT_FOCUS_ELEMENT, this._boundOnFocus);
  }

  hostUpdated() {
    if (this._pointer == null || !this.isPointerValid(this._pointer)) {
      const defaultPointer = this.getDefaultPointer();
      if (this._pointer !== defaultPointer) {
        this._pointer = defaultPointer;
        this.host.requestUpdate();
      }
    }
  }

  _handleFocus(e) {
    const { pointer } = e?.detail || {};
    if (pointer == null) return;
    this.pointer = pointer;
  }
}
