/**
 * Manages scroll targets and handles scroll-to commands.
 * Reusable across editor, sidebar, or any scrollable component.
 */
export default class ScrollTargetController {
  constructor(host, {
    scrollEvent,
    getScrollContainer = () => window,
    getHeaderOffset = () => 0,
    scrollBehavior = 'smooth',
    useInternalScroll = false, // If true, scroll within host container
    onlyIfNeeded = false, // If true, only scroll if target not visible
  } = {}) {
    this.host = host;
    this.scrollEvent = scrollEvent;
    this.getScrollContainer = getScrollContainer;
    this.getHeaderOffset = getHeaderOffset;
    this.scrollBehavior = scrollBehavior;
    this.useInternalScroll = useInternalScroll;
    this.onlyIfNeeded = onlyIfNeeded;
    this._targets = new Map();
    this._boundOnScroll = this._handleScrollTo.bind(this);
    host.addController(this);
  }

  hostConnected() {
    if (this.scrollEvent) {
      window.addEventListener(this.scrollEvent, this._boundOnScroll);
    }
  }

  hostDisconnected() {
    if (this.scrollEvent) {
      window.removeEventListener(this.scrollEvent, this._boundOnScroll);
    }
    this._targets.clear();
  }

  registerTarget(pointer, element) {
    if (element) this._targets.set(pointer, element);
  }

  unregisterTarget(pointer) {
    this._targets.delete(pointer);
  }

  _isVisibleWithin(container, element, margin = 0) {
    if (!container || !element) return false;
    const c = container.getBoundingClientRect();
    const r = element.getBoundingClientRect();
    return (r.top >= c.top + margin) && (r.bottom <= c.bottom - margin);
  }

  _handleScrollTo(e) {
    const pointer = e?.detail?.pointer;
    if (pointer == null) return;

    const target = this._targets.get(pointer);
    if (!target) return;

    // Update offset if dynamic
    const offset = this.getHeaderOffset();
    if (offset) {
      this.host.style.setProperty('--scroll-offset', `${offset}px`);
    }

    // For internal scroll containers, check visibility first
    if (this.useInternalScroll) {
      const container = this.getScrollContainer();
      if (this.onlyIfNeeded && this._isVisibleWithin(container, target, offset)) {
        return; // Already visible, skip scroll
      }

      // For internal containers, manually scroll the container instead of using scrollIntoView
      // This prevents conflicts with page-level scrolls
      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const scrollTop = container.scrollTop + (targetRect.top - containerRect.top) - offset;

      container.scrollTo({
        top: scrollTop,
        behavior: this.scrollBehavior,
      });
    } else {
      // Page-level scroll (editor)
      target.scrollIntoView({
        behavior: this.scrollBehavior,
        block: 'start',
      });
    }
  }

  scrollTo(pointer, options = {}) {
    const target = this._targets.get(pointer);
    if (!target) return;
    target.scrollIntoView({
      behavior: options.behavior || this.scrollBehavior,
      block: options.block || 'start',
    });
  }
}
