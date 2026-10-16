import { Plugin } from 'da-y-wrapper';
import { getNx2 } from '../../../scripts/utils.js';
import { MESSAGE_TYPES } from '../utils/quick-edit-messages.js';
import { encodeAnchor, decodeAnchor } from '../comments/helpers/anchor.js';
import { controllerPathnameFromEditorCtx } from '../ew-editor-doc/utils/ctx.js';
import { resolveFindings, resolveGroup } from './resolve.js';
import { requestSuggestions } from './instruction.js';

// How long to wait for the iframe to report the marker's rect before falling back to a
// centered card (e.g. the preview runs a quick-edit build without finding support).
const LAYOUT_TIMEOUT_MS = 1500;
// A click inside the preview iframe never reaches this document; it only blurs the window.
// The grace period lets a marker click (FINDING_MARKER_CLICK) cancel that "outside click".
const IFRAME_CLICK_GRACE_MS = 300;

async function createCardElement() {
  await import('./ew-finding-card.js');
  return document.createElement('ew-finding-card');
}

function deepActiveElement() {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
}

function isEditable(el) {
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

// The editor URL of the open document, and the preview URL the agent evaluates by default.
function pagesOf(ctx) {
  if (!ctx?.org || !ctx?.repo) return {};
  const path = controllerPathnameFromEditorCtx(ctx);
  return {
    page: `https://da.live/canvas#/${ctx.org}/${ctx.repo}${path === '/' ? '' : path}`,
    evaluatedUrl: `https://main--${ctx.repo}--${ctx.org}.preview.da.live${path}`,
  };
}

function hasResolvableEvidence(finding) {
  return (finding?.evidence ?? []).some((e) => (
    (e?.anchorType === 'text' && e.anchorText)
    || (e?.anchorType === 'image' && e.src)
  ));
}

/**
 * Shows evaluation findings on the page: claims EVAL_EVENT.FOCUS_FINDING, outlines the element
 * in the preview iframe (via SET_FINDING_MARKERS) and hosts the floating ew-finding-card, which
 * only explains the failure. It also claims EVAL_EVENT.SUGGEST_ELEMENT ("Generate suggestion")
 * and sends the chat a request that carries the element's full text, links and formatting.
 */
export function createFindingsController({
  getView,
  getPort,
  getIframe,
  getCtx,
  createCard = createCardElement,
  layoutTimeoutMs = LAYOUT_TIMEOUT_MS,
}) {
  let evalEvents;
  let wanted = false;
  let listening = false;
  let session = null;

  const iframeBounds = () => {
    const iframe = getIframe?.();
    if (!iframe?.isConnected) return null;
    const r = iframe.getBoundingClientRect();
    return r.width > 0 && r.height > 0 ? r : null;
  };

  function postMarkers(markers, selectedId, scrollIntoView) {
    getPort?.()?.postMessage({
      type: MESSAGE_TYPES.SET_FINDING_MARKERS,
      payload: { markers, selectedId, scrollIntoView },
    });
  }

  function clearMarkers() {
    if (!session?.markerPosted) return;
    session.markerPosted = false;
    postMarkers([], null, false);
  }

  function sendMarker(scroll) {
    const view = getView();
    const { range, markerId } = session;
    const marker = { id: markerId, anchorType: range.anchorType, from: range.from, to: range.to };
    if (range.anchorType === 'image') {
      marker.imageSrc = view?.state.doc.nodeAt(range.from)?.attrs?.src ?? '';
    } else if (range.anchorText) {
      // Lets the preview verify (and correct) which element it outlines.
      marker.anchorText = range.anchorText;
    }
    session.markerPosted = true;
    postMarkers([marker], markerId, scroll);
  }

  function hostRect() {
    const bounds = iframeBounds();
    const { rect } = session;
    if (!bounds || !rect) return null;
    return {
      top: bounds.top + rect.top,
      left: bounds.left + rect.left,
      width: rect.width,
      height: rect.height,
    };
  }

  function updateCard() {
    const { card, current, groupIds } = session;
    if (!card) return;
    const { finding, label } = current;
    const anchorRect = session.marked ? hostRect() : null;
    const waiting = session.marked && !session.layoutDone && !session.timedOut;
    const bounds = iframeBounds();
    card.finding = finding;
    card.elementLabel = label ?? '';
    card.index = groupIds.indexOf(finding.id);
    card.total = groupIds.length;
    card.unresolved = !session.marked || !session.rect;
    card.placement = anchorRect ? 'anchored' : 'center';
    card.anchorRect = anchorRect;
    card.bounds = bounds && {
      top: Math.max(0, bounds.top),
      left: Math.max(0, bounds.left),
      width: Math.min(bounds.right, window.innerWidth) - Math.max(0, bounds.left),
      height: Math.min(bounds.bottom, window.innerHeight) - Math.max(0, bounds.top),
    };
    card.pending = waiting;
    card.updateComplete.then(() => {
      if (!session || session.card !== card || session.focused || card.pending) return;
      session.focused = true;
      card.focusCard();
    });
  }

  function select(findingId, { scroll }) {
    const view = getView();
    const results = resolveFindings(view.state.doc, session.findings);
    const current = results.find((r) => r.finding.id === findingId);
    if (!session.groupIds) {
      session.groupIds = current.groupKey
        ? results.filter((r) => r.groupKey === current.groupKey).map((r) => r.finding.id)
        : [findingId];
      session.markerId = current.groupKey ?? `finding:${findingId}`;
    }
    session.current = current;
    session.range = current.range;
    session.rect = null;
    session.layoutDone = false;
    session.timedOut = false;
    session.anchor = current.range
      ? encodeAnchor({ selectionData: current.range, state: view.state })
      : null;
    // MESSAGE_TYPES lacks the finding types when da-nx predates the feature.
    session.marked = !!(current.range && getPort?.() && iframeBounds()
      && MESSAGE_TYPES.SET_FINDING_MARKERS);

    clearTimeout(session.layoutTimer);
    if (session.marked) {
      sendMarker(scroll);
      session.layoutTimer = setTimeout(() => {
        if (!session || session.layoutDone) return;
        session.timedOut = true;
        updateCard();
      }, layoutTimeoutMs);
    } else {
      clearMarkers();
    }
    updateCard();
  }

  function close({ restoreFocus = true } = {}) {
    if (!session) return;
    const closing = session;
    clearMarkers();
    session = null;
    clearTimeout(closing.layoutTimer);
    clearTimeout(closing.blurTimer);
    closing.teardown?.();
    closing.card?.remove();
    const prev = closing.prevFocus;
    if (restoreFocus && prev?.isConnected && prev !== document.body) {
      prev.focus?.({ preventScroll: true });
    }
  }

  function step(delta) {
    const idx = session.groupIds.indexOf(session.current.finding.id) + delta;
    if (idx < 0 || idx >= session.groupIds.length) return;
    select(session.groupIds[idx], { scroll: true });
  }

  function listenWhileOpen(card) {
    const onPointerDown = (e) => {
      if (!e.composedPath().includes(card)) close();
    };
    const onKeydown = (e) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const origin = e.composedPath()[0];
      if (isEditable(origin) && !e.composedPath().includes(card)) return;
      e.preventDefault();
      close();
    };
    const onResize = () => { if (session) updateCard(); };
    const onBlur = () => {
      const iframe = getIframe?.();
      if (!session || !iframe || iframe.getRootNode().activeElement !== iframe) return;
      clearTimeout(session.blurTimer);
      session.blurTimer = setTimeout(() => close({ restoreFocus: false }), IFRAME_CLICK_GRACE_MS);
    };
    const onClose = () => close();
    const onStep = (e) => step(e.detail.delta);

    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeydown, true);
    window.addEventListener('resize', onResize);
    window.addEventListener('blur', onBlur);
    card.addEventListener('finding-close', onClose);
    card.addEventListener('finding-step', onStep);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeydown, true);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('blur', onBlur);
      card.removeEventListener('finding-close', onClose);
      card.removeEventListener('finding-step', onStep);
    };
  }

  async function open(findings, findingId) {
    close({ restoreFocus: false });
    const mine = { findings, prevFocus: deepActiveElement() };
    session = mine;
    const card = await createCard();
    if (session !== mine) return;
    mine.card = card;
    mine.teardown = listenWhileOpen(card);
    document.body.append(card);
    select(findingId, { scroll: true });
  }

  function onFocusFinding(e) {
    if (e.defaultPrevented) return;
    const { findingId, findings } = e.detail ?? {};
    if (!getView() || !Array.isArray(findings)) return;
    const finding = findings.find((f) => f?.id === findingId);
    if (!hasResolvableEvidence(finding)) return;
    e.preventDefault();
    open(findings, findingId);
  }

  function onSuggestElement(e) {
    if (e.defaultPrevented) return;
    const { group, evaluatedUrl } = e.detail ?? {};
    const view = getView();
    if (!view || !Array.isArray(group?.findings) || !group.findings.length) return;
    const resolved = resolveGroup(view.state.doc, group.findings);
    if (!resolved) return;
    e.preventDefault();
    const pages = pagesOf(getCtx?.());
    requestSuggestions({
      group,
      resolved,
      page: pages.page,
      evaluatedUrl: evaluatedUrl ?? pages.evaluatedUrl,
    });
  }

  function onDocChange() {
    if (!session?.card || !session.anchor) return;
    const view = getView();
    const range = view && decodeAnchor({ anchor: session.anchor, state: view.state });
    if (!range) {
      close({ restoreFocus: false });
      return;
    }
    session.range = { ...session.range, from: range.from, to: range.to };
    if (session.marked) sendMarker(false);
  }

  function attach() {
    if (!wanted || listening || !evalEvents) return;
    listening = true;
    document.addEventListener(evalEvents.focus, onFocusFinding);
    // Older da-nx builds have no SUGGEST_ELEMENT; the card then falls back to its own message.
    if (evalEvents.suggest) document.addEventListener(evalEvents.suggest, onSuggestElement);
  }

  function detach() {
    if (!listening) return;
    document.removeEventListener(evalEvents.focus, onFocusFinding);
    if (evalEvents.suggest) document.removeEventListener(evalEvents.suggest, onSuggestElement);
    listening = false;
  }

  return {
    /** PM plugin that keeps the marker following document edits. */
    plugin: new Plugin({
      view: () => ({
        update(view, prev) {
          if (view.state.doc !== prev.doc) onDocChange();
        },
      }),
    }),

    /** Idempotent; the da-nx contract module is loaded lazily so older da-nx builds still work. */
    async start() {
      wanted = true;
      if (evalEvents === undefined) {
        try {
          const { EVAL_EVENT } = await import(`${getNx2()}/utils/evaluation-events.js`);
          evalEvents = EVAL_EVENT?.FOCUS_FINDING
            ? { focus: EVAL_EVENT.FOCUS_FINDING, suggest: EVAL_EVENT.SUGGEST_ELEMENT }
            : null;
        } catch {
          evalEvents = null;
        }
      }
      attach();
    },

    stop() {
      wanted = false;
      detach();
      close({ restoreFocus: false });
    },

    close,

    /** Re-sends the marker, e.g. after the preview iframe (and its port) was recreated. */
    onPortChange() {
      if (session?.card) select(session.current.finding.id, { scroll: true });
    },

    onMarkerClick({ id } = {}) {
      if (!session || id !== session.markerId) return;
      clearTimeout(session.blurTimer);
      session.card?.focusCard();
    },

    onMarkerLayout({ id, rect } = {}) {
      if (!session?.marked || id !== session.markerId) return;
      session.layoutDone = true;
      session.rect = rect ?? null;
      updateCard();
    },

    get isOpen() { return !!session; },
  };
}
