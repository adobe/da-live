/**
 * HighlightOverlay
 *
 * Visual helper that renders a blue overlay aligned with a target form group
 * inside the scrollable body container.
 */
export default class HighlightOverlay {
  /** Initialize overlay state; actual DOM is created on demand. */
  constructor() {
    this.container = null;
    this.overlay = null;
  }

  /** Attach the overlay to a container element (usually the form body). */
  attach(containerEl) {
    this.container = containerEl;
  }

  /** Remove any existing overlay element. */
  clear() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  /** Position and display the overlay to match `targetGroup` bounding box. */
  showFor(targetGroup) {
    if (!this.container || !targetGroup) return;
    this.clear();

    const overlay = document.createElement('div');
    overlay.className = 'form-ui-highlight-overlay';

    const getOffsetTopWithinContainer = (el, container) => {
      let top = 0;
      let node = el;
      // eslint-disable-next-line no-cond-assign
      while (node && node !== container) {
        top += node.offsetTop;
        node = node.offsetParent;
      }
      return top;
    };

    const topValue = getOffsetTopWithinContainer(targetGroup, this.container);
    const heightValue = targetGroup.offsetHeight;

    overlay.style.top = `${topValue}px`;
    overlay.style.height = `${heightValue}px`;
    overlay.style.left = '0px';

    this.container.appendChild(overlay);
    this.overlay = overlay;
  }
}


