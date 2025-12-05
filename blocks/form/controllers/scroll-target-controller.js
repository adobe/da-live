/**
 * Lit controller that handles scroll-to-element functionality.
 * Supports both window scrolling and internal container scrolling.
 * Listens to custom scroll events and scrolls target elements into view.
 */
export default class ScrollTargetController {
  constructor(host, {
    scrollEvent,
    getTarget,
    getScrollContainer = () => window,
    getHeaderOffset = () => 0,
    scrollBehavior = 'smooth',
    useInternalScroll = false,
    onlyIfNeeded = false,
  } = {}) {
    this.host = host;
    this.scrollEvent = scrollEvent;
    this.getTarget = getTarget || (() => null);
    this.getScrollContainer = getScrollContainer;
    this.getHeaderOffset = getHeaderOffset;
    this.scrollBehavior = scrollBehavior;
    this.useInternalScroll = useInternalScroll;
    this.onlyIfNeeded = onlyIfNeeded;
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

    const target = this.getTarget(pointer);

    if (!target) return;

    const offset = this.getHeaderOffset();
    if (offset) {
      this.host.style.setProperty('--scroll-offset', `${offset}px`);
    }

    if (this.useInternalScroll) {
      const container = this.getScrollContainer();
      if (this.onlyIfNeeded && this._isVisibleWithin(container, target, offset)) {
        return;
      }

      const containerRect = container.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const scrollTop = container.scrollTop + (targetRect.top - containerRect.top) - offset;

      container.scrollTo({
        top: scrollTop,
        behavior: this.scrollBehavior,
      });
    } else {
      target.scrollIntoView({
        behavior: this.scrollBehavior,
        block: 'start',
      });
    }
  }

  scrollTo(pointer, options = {}) {
    const target = this.getTarget(pointer);
    if (!target) return;
    target.scrollIntoView({
      behavior: options.behavior || this.scrollBehavior,
      block: options.block || 'start',
    });
  }
}
