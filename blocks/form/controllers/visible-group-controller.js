import { EVENT_VISIBLE_GROUP } from '../constants.js';

/** Throttle function calls using requestAnimationFrame. */
function rafThrottle(fn) {
  let scheduled = false;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      // eslint-disable-next-line prefer-spread
      fn.apply(null, lastArgs);
      lastArgs = null;
    });
  };
}

/**
 * Lit controller that tracks which group is currently visible in the viewport.
 * Uses IntersectionObserver to detect visibility and calculates the "best" visible group
 * based on distance from top and viewport position. Emits EVENT_VISIBLE_GROUP when changes.
 */
export default class VisibleGroupController {
  constructor(host, {
    getGroupId,
    getMeasureTarget,
    topOffsetPx = 0,
    root = null,
    thresholds = [0, 0.25, 0.5, 0.75, 1],
  } = {}) {
    if (typeof getGroupId !== 'function') {
      throw new Error('VisibleGroupController requires getGroupId function');
    }
    this.host = host;
    this.getGroupId = getGroupId;
    this.getMeasureTarget = getMeasureTarget || ((el) => el);
    this._topOffsetPx = Number.isFinite(topOffsetPx) ? topOffsetPx : 0;
    this._root = root; // null = viewport
    this._thresholds = thresholds;

    this._groups = new Set(); // group host elements
    this._groupToTarget = new Map(); // group -> measure target
    this._targetToGroup = new Map(); // measure target -> group
    this._visibleTargets = new Set(); // currently intersecting measure targets
    this._activeId = null;

    this._evaluate = rafThrottle(this._evaluateNow.bind(this));
    this._onIO = this._onIO.bind(this);

    this._createObserver();
    host.addController(this);
  }

  set root(el) {
    if (this._root === el) return;
    this._root = el || null;
    this._recreateObserver();
  }

  setTopOffsetPx(px) {
    const val = Number.isFinite(px) ? px : 0;
    if (this._topOffsetPx === val) return;
    this._topOffsetPx = val;
    this._recreateObserver();
  }

  get visiblePointer() {
    return this._activeId;
  }

  hostConnected() {
    const scroller = this._root || window;
    scroller.addEventListener('scroll', this._evaluate, { passive: true });
  }

  hostDisconnected() {
    const scroller = this._root || window;
    scroller.removeEventListener('scroll', this._evaluate);
    this._io?.disconnect();
    this._visibleTargets.clear();
    this._groups.clear();
    this._groupToTarget.clear();
    this._targetToGroup.clear();
  }

  registerGroup = (el) => {
    if (!el || this._groups.has(el)) return;
    this._groups.add(el);
    const target = this.getMeasureTarget(el) || el;
    if (target) {
      this._groupToTarget.set(el, target);
      this._targetToGroup.set(target, el);
      this._io?.observe(target);
    }
    this._evaluate();
  };

  unregisterGroup = (el) => {
    if (!el || !this._groups.has(el)) return;
    this._groups.delete(el);
    const target = this._groupToTarget.get(el);
    if (target) {
      this._visibleTargets.delete(target);
      this._io?.unobserve(target);
      this._targetToGroup.delete(target);
    }
    this._groupToTarget.delete(el);
    this._evaluate();
  };

  _createObserver() {
    this._io = new IntersectionObserver(this._onIO, {
      root: this._root,
      threshold: this._thresholds,
      rootMargin: `-${this._topOffsetPx}px 0px -70% 0px`,
    });
    this._groups?.forEach((el) => {
      const target = this._groupToTarget.get(el) || this.getMeasureTarget(el) || el;
      if (target) {
        this._groupToTarget.set(el, target);
        this._targetToGroup.set(target, el);
        this._io.observe(target);
      }
    });
  }

  _recreateObserver() {
    if (this._io) {
      try { this._io.disconnect(); } catch (e) { /* no-op */ }
    }
    this._createObserver();
    this._evaluate();
  }

  _onIO(entries) {
    for (const entry of entries) {
      if (entry.isIntersecting) this._visibleTargets.add(entry.target);
      else this._visibleTargets.delete(entry.target);
    }
    this._evaluate();
  }

  _evaluateNow() {
    if (this._groups.size === 0) return;

    const rootRect = this._root?.getBoundingClientRect
      ? this._root.getBoundingClientRect()
      : { top: 0, height: window.innerHeight };
    const anchorTop = rootRect.top + this._topOffsetPx;
    const viewportBottom = rootRect.top + (rootRect.height || window.innerHeight);

    const candidateGroups = this._visibleTargets.size > 0
      ? Array.from(this._visibleTargets).map((t) => this._targetToGroup.get(t)).filter(Boolean)
      : Array.from(this._groups);

    let best = null;
    let bestScore = Infinity;

    for (const groupEl of candidateGroups) {
      const target = this._groupToTarget.get(groupEl) || groupEl;
      const rect = target.getBoundingClientRect();
      const distance = rect.top - anchorTop;
      const inViewport = rect.bottom > anchorTop && rect.top < viewportBottom;
      const negPenalty = distance < 0 ? 1 : 0;
      const absDistance = Math.abs(distance);
      const viewportPenalty = inViewport ? 0 : 1;
      const score = negPenalty * 1e6 + absDistance * 1e3 + viewportPenalty;
      if (score < bestScore) {
        bestScore = score;
        best = groupEl;
      }
    }

    const nextId = best ? this.getGroupId(best) : null;
    if (nextId !== this._activeId) {
      this._activeId = nextId;
      this.host.requestUpdate?.();
      if (nextId != null) {
        this.host.dispatchEvent(new CustomEvent(EVENT_VISIBLE_GROUP, {
          detail: { pointer: nextId },
          bubbles: true,
          composed: true,
        }));
      }
    }
  }
}
