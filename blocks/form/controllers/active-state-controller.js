import { EVENT_FOCUS_GROUP } from '../utils/events.js';

/**
 * Tracks active/focused pointer state reactively.
 * Automatically updates host when state changes.
 */
export default class ActiveStateController {
  constructor(host, {
    initialPointer = null,
    propertyName = '_activePointer',
  } = {}) {
    this.host = host;
    this.propertyName = propertyName;
    this._pointer = initialPointer;
    this._boundOnFocus = this._handleFocus.bind(this);
    host.addController(this);
  }

  get pointer() {
    return this._pointer;
  }

  set pointer(value) {
    if (this._pointer !== value) {
      this._pointer = value;
      this.host[this.propertyName] = value;
      this.host.requestUpdate();
    }
  }

  hostConnected() {
    window.addEventListener(EVENT_FOCUS_GROUP, this._boundOnFocus);
  }

  hostDisconnected() {
    window.removeEventListener(EVENT_FOCUS_GROUP, this._boundOnFocus);
  }

  _handleFocus(e) {
    const { pointer } = e?.detail || {};
    if (pointer == null) return;
    this.pointer = pointer;
  }
}

