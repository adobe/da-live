import { EVENT_FOCUS_ELEMENT, EVENT_VISIBLE_GROUP } from '../constants.js';

/**
 * Lit controller that tracks the currently active pointer in the form.
 * Listens to focus events (manual clicks) and visible group events (scrolling).
 * Updates from both sources to keep breadcrumb in sync.
 * Validates active pointer and falls back to default when invalid.
 * Prioritizes explicit user clicks over automatic scroll-based highlighting.
 */
export default class ActiveStateController {
  constructor(host, {
    getDefaultPointer,
    isPointerValid,
    manualSelectionLockMs = 1000,
  } = {}) {
    this.host = host;
    this._pointer = null;
    this._manualSelectionLockMs = manualSelectionLockMs;
    this._manualSelectionUntil = 0;
    this.getDefaultPointer = getDefaultPointer || (() => null);
    this.isPointerValid = isPointerValid || (() => true);
    this._boundOnFocus = this._handleFocus.bind(this);
    this._boundOnVisibleGroup = this._handleVisibleGroup.bind(this);
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
    this.host.addEventListener(EVENT_VISIBLE_GROUP, this._boundOnVisibleGroup);
  }

  hostDisconnected() {
    window.removeEventListener(EVENT_FOCUS_ELEMENT, this._boundOnFocus);
    this.host.removeEventListener(EVENT_VISIBLE_GROUP, this._boundOnVisibleGroup);
    this._manualSelectionUntil = 0;
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
    const { pointer, source, originalSource } = e?.detail || {};
    if (pointer == null) return;

    // Lock manual selections to prevent scroll-based overrides
    // Check originalSource (preserved by coordinator) or source (if not coordinated)
    const actualSource = originalSource || source;
    const isManualSelection = actualSource && actualSource !== 'coordinator' && actualSource !== 'unknown';
    if (isManualSelection) {
      this._manualSelectionUntil = Date.now() + this._manualSelectionLockMs;
    }

    this.pointer = pointer;
  }

  _handleVisibleGroup(e) {
    const { pointer } = e?.detail || {};
    if (pointer == null) return;

    // Respect manual selection lock - don't override explicit user clicks
    if (Date.now() < this._manualSelectionUntil) {
      return;
    }

    this.pointer = pointer;
  }
}
