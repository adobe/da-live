import { LAYOUT, EVENT_ACTIVE_STATE_CHANGE } from '../constants.js';

/**
 * Manages active state tracking and visual indicator positioning.
 * Active state changes only on explicit user actions (no auto-detection).
 */
export default class ActiveStateController {
  constructor(host, {
    getDefaultPointer = () => null,
    isPointerValid = () => true,
    getIndicatorElement = () => null,
    getListElement = () => null,
    getRegistry = () => null,
    indicatorOffsetPx = LAYOUT.INDICATOR_OFFSET,
  } = {}) {
    this.host = host;
    this._pointer = null;
    this.getDefaultPointer = getDefaultPointer;
    this.isPointerValid = isPointerValid;
    this.getIndicatorElement = getIndicatorElement;
    this.getListElement = getListElement;
    this.getRegistry = getRegistry;
    this._indicatorOffsetPx = indicatorOffsetPx;
    this._pendingIndicatorFrame = null;
    this._handleActiveStateChange = this._handleActiveStateChange.bind(this);
    host.addController(this);
  }

  get pointer() {
    return this._pointer;
  }

  updateIndicator() {
    this._scheduleIndicatorUpdate();
  }

  setupIndicator({ getIndicatorElement, getListElement, getRegistry }) {
    this.getIndicatorElement = getIndicatorElement;
    this.getListElement = getListElement;
    this.getRegistry = getRegistry;
  }

  _handleActiveStateChange(e) {
    const { pointer } = e?.detail || {};
    if (pointer == null) return;
    this._updatePointer(pointer);
  }

  _updatePointer(newPointer) {
    if (this._pointer === newPointer) return;
    this._pointer = newPointer;
    this.host.requestUpdate();
    this._scheduleIndicatorUpdate();
  }

  _scheduleIndicatorUpdate() {
    if (this._pendingIndicatorFrame) {
      cancelAnimationFrame(this._pendingIndicatorFrame);
    }
    this._pendingIndicatorFrame = requestAnimationFrame(() => {
      this._pendingIndicatorFrame = null;
      this._updateIndicatorPosition();
    });
  }

  _updateIndicatorPosition() {
    const indicator = this.getIndicatorElement();
    const list = this.getListElement();
    const registry = this.getRegistry();

    if (!indicator || !list || !registry || this._pointer == null) {
      if (indicator) indicator.style.height = '0px';
      return;
    }

    const target = registry.get(this._pointer);
    if (!target) {
      indicator.style.height = '0px';
      return;
    }

    const containerRect = list.getBoundingClientRect();
    const labelEl = target.firstElementChild || target;
    const labelRect = labelEl.getBoundingClientRect();
    const top = Math.max(0, labelRect.top - containerRect.top - this._indicatorOffsetPx);

    const containerLineHeight = parseFloat(getComputedStyle(list).lineHeight);
    const fallbackHeight = Number.isFinite(containerLineHeight)
      ? containerLineHeight
      : LAYOUT.FALLBACK_LINE_HEIGHT;

    const height = Math.max(0, Math.max(labelRect.height, fallbackHeight));

    indicator.style.top = `${Math.round(top)}px`;
    indicator.style.height = `${Math.round(height)}px`;
  }

  hostConnected() {
    window.addEventListener(EVENT_ACTIVE_STATE_CHANGE, this._handleActiveStateChange);
  }

  hostDisconnected() {
    window.removeEventListener(EVENT_ACTIVE_STATE_CHANGE, this._handleActiveStateChange);
    if (this._pendingIndicatorFrame) {
      cancelAnimationFrame(this._pendingIndicatorFrame);
      this._pendingIndicatorFrame = null;
    }
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
}
