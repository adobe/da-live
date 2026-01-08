import { LAYOUT } from '../constants.js';

/** Calculate indicator position relative to target and container. */
function calculatePosition(target, container, offsetPx) {
  const containerRect = container.getBoundingClientRect();
  const labelEl = target.firstElementChild || target;
  const labelRect = labelEl.getBoundingClientRect();

  const top = Math.max(0, labelRect.top - containerRect.top - offsetPx);
  const containerLineHeight = parseFloat(getComputedStyle(container).lineHeight);
  const fallbackLine = Number.isFinite(containerLineHeight)
    ? containerLineHeight
    : LAYOUT.FALLBACK_LINE_HEIGHT;
  const height = Math.max(0, Math.max(labelRect.height, fallbackLine));

  return { top, height };
}

/**
 * Lit controller that manages active indicator positioning in navigation panel.
 * Calculates and updates the visual indicator position based on the active item.
 * Handles dynamic sizing and positioning with offset calculations.
 */
export default class ActiveIndicatorController {
  constructor(host, {
    getIndicator,
    getList,
    getRegistry,
    offsetPx = LAYOUT.INDICATOR_OFFSET,
  } = {}) {
    this.host = host;
    this.getIndicator = getIndicator;
    this.getList = getList;
    this.getRegistry = getRegistry;
    this.offsetPx = offsetPx;
    this._currentPointer = null;
    this._pendingFrame = null; // Track pending animation frame

    host.addController(this);
  }

  /**
   * Update indicator position for the given pointer.
   * Cancels any pending update to prevent "shaking" from rapid successive calls.
   * @param {string} pointer - Pointer to update to
   */
  updatePosition(pointer) {
    // Cancel any pending update
    if (this._pendingFrame) {
      cancelAnimationFrame(this._pendingFrame);
      this._pendingFrame = null;
    }

    // Schedule update in next animation frame
    this._pendingFrame = requestAnimationFrame(() => {
      this._pendingFrame = null;
      this._applyPosition(pointer);
    });
  }

  /** Internal method to apply the indicator position immediately. */
  _applyPosition(pointer) {
    if (pointer == null) {
      this._hideIndicator();
      return;
    }

    this._currentPointer = pointer;

    const indicator = this.getIndicator?.();
    const list = this.getList?.();
    const registry = this.getRegistry?.();

    if (!indicator || !list || !registry) {
      this._hideIndicator();
      return;
    }

    const target = registry.get(pointer);
    if (!target) {
      this._hideIndicator();
      return;
    }

    const position = calculatePosition(target, list, this.offsetPx);
    indicator.style.top = `${Math.round(position.top)}px`;
    indicator.style.height = `${Math.round(position.height)}px`;
  }

  _hideIndicator() {
    const indicator = this.getIndicator?.();
    if (indicator) {
      indicator.style.height = '0px';
    }
  }

  hostConnected() {
    // Controller is ready
  }

  hostDisconnected() {
    // Cancel any pending update on disconnect
    if (this._pendingFrame) {
      cancelAnimationFrame(this._pendingFrame);
      this._pendingFrame = null;
    }
    this._currentPointer = null;
  }
}
