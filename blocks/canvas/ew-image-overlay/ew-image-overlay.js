import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import {
  uploadImageToDa,
  updateImageAttrs,
  altFromFilename,
  SUPPORTED_IMAGE_TYPES,
} from '../editor-utils/image-ops.js';
import { sourceUrlFromEditorCtx } from '../ew-editor-doc/utils/ctx.js';

const { loadStyle, hashChange } = await import(`${getNx()}/utils/utils.js`);

const styles = await loadStyle(import.meta.url);

// Document-scoped stylesheet for the AEM Assets modal — see the file header.
let assetsStyleLinked = false;
function ensureAssetsStylesLoaded() {
  if (assetsStyleLinked) return;
  assetsStyleLinked = true;
  const { href } = new URL('./ew-image-overlay-assets.css', import.meta.url);
  if (document.querySelector(`link[data-ew-image-overlay-assets][href="${href}"]`)) return;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.dataset.ewImageOverlayAssets = '1';
  document.head.append(link);
}

const ICON_ALT = 'tag';
const ICON_REPLACE = 'imageadd';
const ICON_LIBRARY = 'cclibrary';
const ICON_UPLOAD = 'uploadtocloud';
const ICON_URL = 'link';
// Use a unicode glyph for close — no Spectrum stem is referenced elsewhere
// in the canvas for this affordance.
const CLOSE_GLYPH = '\u2715';

const ALT_MAX_LENGTH = 250;

const SAFE_URL_SCHEMES = new Set(['http:', 'https:']);

/**
 * `ew-image-overlay` is the per-image action surface for Experience Workspace.
 *
 * It positions itself ABSOLUTELY against an anchor rect provided by the
 * selection-toolbar plugin:
 *   - Content/Split: the anchor is the image's own `<img>` element rect.
 *   - Layout: the anchor is the iframe's bounding rect (we cannot read the
 *     image's coordinates from the cross-origin preview iframe).
 *
 * It always uses `position: fixed` so it stays glued to the anchor as the
 * page scrolls — we recompute the rect on every scroll/resize while visible.
 */
class EwImageOverlay extends LitElement {
  static properties = {
    view: { attribute: false },
    /** 'content' | 'layout' — drives Replace-popover placement and corner. */
    placement: { type: String },
    /** Function returning the anchor element (image or iframe) — re-invoked each frame. */
    getAnchor: { attribute: false },
    _open: { state: true },
    _replaceOpen: { state: true },
    _altOpen: { state: true },
    _urlOpen: { state: true },
    _aemState: { state: true },
    _assetsOpen: { state: true },
  };

  constructor() {
    super();
    this.placement = 'content';
    this._open = false;
    this._replaceOpen = false;
    this._altOpen = false;
    this._urlOpen = false;
    this._assetsOpen = false;
    // Tri-state so the popover can show "Browse AEM Assets…" as a disabled
    // item while we're still checking, instead of vanishing entirely.
    //   'unknown'      → check in flight (or hash not yet set)
    //   'available'    → site has aem.repositoryId configured
    //   'unavailable'  → check completed, site has no AEM Assets config
    this._aemState = 'unknown';
    this._aemOrg = undefined;
    this._aemSite = undefined;
    this._rafId = 0;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
    this._onOutside = (e) => this._handleOutsidePointer(e);
    this._onKey = (e) => this._handleKey(e);
    this._onScroll = () => this._scheduleReposition();
    this._onResize = () => this._scheduleReposition();
    document.addEventListener('pointerdown', this._onOutside, true);
    document.addEventListener('keydown', this._onKey, true);
    window.addEventListener('scroll', this._onScroll, true);
    window.addEventListener('resize', this._onResize);
    this._unsubHash = hashChange.subscribe((s) => this._refreshAemCapability(s));
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('pointerdown', this._onOutside, true);
    document.removeEventListener('keydown', this._onKey, true);
    window.removeEventListener('scroll', this._onScroll, true);
    window.removeEventListener('resize', this._onResize);
    this._unsubHash?.();
    this._closeAssetsModal();
    this._cancelRaf();
  }

  /* ---- Public API used by the selection-toolbar plugin ---- */

  showFor({ view, placement, getAnchor }) {
    this.view = view;
    this.placement = placement ?? 'content';
    this.getAnchor = getAnchor;
    this._open = true;
    this._scheduleReposition(true);
  }

  hide() {
    this._open = false;
    this._replaceOpen = false;
    this._altOpen = false;
    this._urlOpen = false;
    this._closeAssetsModal();
    this._cancelRaf();
    this.style.visibility = 'hidden';
  }

  get isOpen() { return this._open; }

  get isInteracting() {
    return this._replaceOpen || this._altOpen || this._urlOpen || this._assetsOpen;
  }

  /* ---- Capability detection ---- */

  async _refreshAemCapability(hashState) {
    const { org, site } = hashState ?? {};
    const key = org && site ? `${org}/${site}` : '';
    if (key === this._aemCapKey) return;
    this._aemCapKey = key;
    this._aemOrg = org;
    this._aemSite = site;
    if (!key) {
      this._aemState = 'unknown';
      return;
    }
    this._aemState = 'unknown';
    try {
      const { hasAemAssetsConfig } = await import('../ew-panel-extensions/aem-assets.js');
      const ok = await hasAemAssetsConfig({ org, site });
      if (this._aemCapKey === key) this._aemState = ok ? 'available' : 'unavailable';
    } catch {
      if (this._aemCapKey === key) this._aemState = 'unavailable';
    }
  }

  /* ---- Positioning ---- */

  _cancelRaf() {
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = 0;
    }
  }

  _scheduleReposition(immediate = false) {
    if (!this._open) return;
    if (immediate) {
      this._reposition();
      return;
    }
    if (this._rafId) return;
    this._rafId = requestAnimationFrame(() => {
      this._rafId = 0;
      this._reposition();
    });
  }

  _reposition() {
    if (!this._open) return;
    const anchor = this.getAnchor?.();
    if (!anchor) {
      this.style.visibility = 'hidden';
      return;
    }
    const rect = anchor.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      // Anchor present but not laid out yet (e.g. detached image during a
      // collab sync). Hide rather than render at (0,0).
      this.style.visibility = 'hidden';
      return;
    }

    this.style.position = 'fixed';
    this.style.visibility = 'visible';
    this.style.zIndex = '120';

    // Place the toolbar at the TOP-RIGHT corner of the anchor, just inside it.
    // For Layout (iframe anchor) we pin under the top edge so it's not
    // obscured by the canvas header.
    const top = Math.max(rect.top + 8, 8);
    const right = Math.max(window.innerWidth - rect.right + 8, 8);
    this.style.top = `${top}px`;
    this.style.right = `${right}px`;
    this.style.left = 'auto';
    this.style.bottom = 'auto';
  }

  /* ---- Outside dismissal ---- */

  _handleOutsidePointer(e) {
    if (!this._open) return;
    // When the AEM Assets selector is open, the underlying library frequently
    // mounts secondary surfaces (file pickers, focus traps, etc.) outside our
    // shadow root. Treat all pointer activity as belonging to that flow and
    // never auto-dismiss while it's up — the user closes it via the X.
    if (this._assetsOpen) return;
    const path = e.composedPath();
    if (path.includes(this)) return;
    // A click on the anchor itself should not dismiss — the plugin will
    // re-show on the next selection update anyway.
    const anchor = this.getAnchor?.();
    if (anchor && path.includes(anchor)) return;
    // Outside the toolbar AND outside the anchor — close any popover/dialog.
    if (this._replaceOpen || this._altOpen || this._urlOpen) {
      this._replaceOpen = false;
      this._altOpen = false;
      this._urlOpen = false;
    } else {
      this.hide();
    }
  }

  _handleKey(e) {
    if (!this._open) return;
    if (e.key !== 'Escape') return;
    if (this._assetsOpen) {
      this._assetsOpen = false;
      e.stopPropagation();
    } else if (this._altOpen || this._urlOpen) {
      this._altOpen = false;
      this._urlOpen = false;
      e.stopPropagation();
    } else if (this._replaceOpen) {
      this._replaceOpen = false;
      e.stopPropagation();
    }
  }

  /* ---- Editor helpers ---- */

  _getSourceUrl() {
    const editorDoc = this.view?.dom?.closest?.('ew-editor-doc');
    return sourceUrlFromEditorCtx(editorDoc?.ctx);
  }

  /** Resolve the selected `image` node and its position from the active view. */
  _selectedImage() {
    const sel = this.view?.state?.selection;
    if (!sel) return null;
    const node = sel.node ?? null;
    if (node?.type?.name !== 'image') return null;
    return { node, pos: sel.from };
  }

  /* ---- Actions ---- */

  _onAltClick() {
    this._replaceOpen = false;
    this._altOpen = true;
  }

  _onReplaceClick() {
    this._altOpen = false;
    this._urlOpen = false;
    this._replaceOpen = !this._replaceOpen;
  }

  _closeReplace() { this._replaceOpen = false; }

  _onAltSubmit(e) {
    e.preventDefault();
    const image = this._selectedImage();
    if (!image) {
      this._altOpen = false;
      return;
    }
    const raw = (e.target.elements['alt-text'].value || '').replace(/\s+/g, ' ').trim();
    const next = raw.slice(0, ALT_MAX_LENGTH) || null;
    this._altOpen = false;
    updateImageAttrs(this.view, image.pos, { alt: next });
  }

  _resolveOrgSite() {
    if (this._aemOrg && this._aemSite) {
      return { org: this._aemOrg, site: this._aemSite };
    }
    // Fallback: hash listener hasn't populated us yet (custom-element upgrade
    // and `hashChange.subscribe` haven't reconciled by the first user click).
    // Parse `#/<org>/<site>/…` directly so the click still works.
    const [org, site] = window.location.hash.replace(/^#\//, '').split('/');
    return { org: org || undefined, site: site || undefined };
  }

  async _onReplaceAem() {
    // Open the AEM Assets selector inside our own modal rather than routing
    // through the tool-panel. This sidesteps two pitfalls:
    //   1. The tool-panel's <dialog>.showModal() needs transient user
    //      activation that can be lost across the await chain that opens the
    //      side panel, syncs extension views, and mounts the dialog.
    //   2. The tool-panel may not be open at all (Layout-only mode), in which
    //      case the panel-open event also has to spin up the aside.
    // The selector library mounts its own CSS and DOM into the host element
    // and expects the host to live in light DOM (its stylesheets are scoped
    // at the document level). We append the modal to document.body so the
    // selector renders correctly.
    this._closeReplace();
    if (this._assetsOpen) return;
    const { org, site } = this._resolveOrgSite();
    if (!org || !site) {
      // eslint-disable-next-line no-console
      console.warn('[ew-image-overlay] Cannot open AEM Assets — missing org/site in hash');
      return;
    }
    this._assetsOpen = true;
    ensureAssetsStylesLoaded();
    const modal = this._createAemModal();
    document.body.append(modal);
    this._assetsModal = modal;
    try {
      modal.showModal();
    } catch (err) {
      // Fall back to non-modal display if showModal() rejects (rare — happens
      // when transient user activation has been consumed).
      // eslint-disable-next-line no-console
      console.warn('[ew-image-overlay] showModal failed, using open()', err);
      modal.show();
    }

    // Surface progress in the modal so a slow / failed selector script load
    // doesn't look like nothing happened.
    const host = modal.querySelector('.ovl-assets-host');
    host.textContent = 'Loading AEM Assets…';

    try {
      const { renderAssets, hasAemAssetsConfig } = await import('../ew-panel-extensions/aem-assets.js');
      const configured = await hasAemAssetsConfig({ org, site });
      if (!configured) {
        host.textContent = 'AEM Assets is not configured for this site.';
        return;
      }
      host.textContent = '';
      await renderAssets({
        container: host,
        org,
        site,
        onClose: () => this._closeAssetsModal(),
      });
      // `renderAssets` resolves whether or not the selector actually rendered
      // (it bails silently when there is no IMS token or repo config). If the
      // host is still empty, surface that to the user.
      if (!host.firstElementChild && !host.firstChild) {
        host.textContent = 'Could not load AEM Assets — you may need to sign in to Adobe IMS.';
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[ew-image-overlay] AEM Assets selector failed to load', err);
      host.textContent = `AEM Assets failed to load: ${err?.message || err}`;
    }
  }

  _createAemModal() {
    // Use a native <dialog>+showModal() — this is what the canvas tool-panel
    // uses for its AEM Assets surface and is known to work with the third-
    // party selector library. It also puts us in the top layer so we don't
    // have to fight z-index against other canvas chrome.
    const dialog = document.createElement('dialog');
    dialog.className = 'ew-image-overlay-assets-dialog';
    dialog.innerHTML = `
      <div class="ew-image-overlay-assets-frame">
        <button type="button" class="ew-image-overlay-assets-close" aria-label="Close" title="Close">${CLOSE_GLYPH}</button>
        <div class="ovl-assets-host"></div>
      </div>
    `;
    dialog.addEventListener('close', () => this._closeAssetsModal());
    dialog.querySelector('.ew-image-overlay-assets-close')
      .addEventListener('click', () => dialog.close());
    return dialog;
  }

  _closeAssetsModal() {
    this._assetsOpen = false;
    if (this._assetsModal) {
      try { if (this._assetsModal.open) this._assetsModal.close(); } catch { /* noop */ }
      this._assetsModal.remove();
      this._assetsModal = null;
    }
  }

  async _onReplaceUpload(e) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = '';
    this._closeReplace();
    const image = this._selectedImage();
    if (!file || !image) return;
    if (!SUPPORTED_IMAGE_TYPES.includes(file.type)) {
      // eslint-disable-next-line no-console
      console.warn('[ew-image-overlay] Unsupported image type:', file.type);
      return;
    }
    const result = await uploadImageToDa({ file, sourceUrl: this._getSourceUrl() });
    if (!result) return;
    const altOverride = image.node.attrs.alt ? {} : { alt: altFromFilename(file.name) };
    updateImageAttrs(this.view, image.pos, { src: result.src, ...altOverride });
  }

  _showUrlDialog() {
    this._replaceOpen = false;
    this._urlOpen = true;
  }

  _onUrlSubmit(e) {
    e.preventDefault();
    const image = this._selectedImage();
    if (!image) {
      this._urlOpen = false;
      return;
    }
    const raw = (e.target.elements['image-src'].value || '').trim();
    if (!raw) return;
    try {
      const u = new URL(raw, window.location.href);
      if (!SAFE_URL_SCHEMES.has(u.protocol)) {
        // eslint-disable-next-line no-console
        console.warn('[ew-image-overlay] Unsafe URL scheme:', u.protocol);
        return;
      }
    } catch { return; }
    this._urlOpen = false;
    updateImageAttrs(this.view, image.pos, { src: raw });
  }

  /* ---- Rendering ---- */

  updated() {
    if (this._open) this._reposition();
  }

  _icon(name) {
    return html`<svg aria-hidden="true" class="ovl-icon" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-${name}-20-n.svg#icon"></use></svg>`;
  }

  _renderReplacePopover() {
    if (!this._replaceOpen) return nothing;
    const accept = SUPPORTED_IMAGE_TYPES.join(',');
    // Always render the AEM Assets entry so its presence isn't gated on an
    // in-flight capability check (which races the user opening the popover).
    // Disable + tooltip when the site has no `aem.repositoryId` configured.
    const aemUnavailable = this._aemState === 'unavailable';
    const aemPending = this._aemState === 'unknown';
    let aemTitle = 'Browse AEM Assets…';
    if (aemUnavailable) aemTitle = 'AEM Assets is not configured for this site';
    else if (aemPending) aemTitle = 'Checking AEM Assets availability…';
    return html`
      <div class="ovl-popover" role="menu"
        @mousedown=${(e) => e.stopPropagation()}>
        <button type="button" class="ovl-popover-item" role="menuitem"
          ?disabled=${aemUnavailable}
          title=${aemTitle}
          @click=${() => this._onReplaceAem()}>
          ${this._icon(ICON_LIBRARY)}<span>Browse AEM Assets…</span>
        </button>
        <label class="ovl-popover-item" role="menuitem">
          ${this._icon(ICON_UPLOAD)}<span>Upload from computer…</span>
          <input type="file" accept=${accept} hidden
            @change=${(e) => this._onReplaceUpload(e)} />
        </label>
        <button type="button" class="ovl-popover-item" role="menuitem"
          @click=${() => this._showUrlDialog()}>
          ${this._icon(ICON_URL)}<span>Replace from URL…</span>
        </button>
      </div>
    `;
  }

  _renderAltDialog() {
    if (!this._altOpen) return nothing;
    const image = this._selectedImage();
    const existing = image?.node.attrs.alt ?? '';
    return html`
      <div class="ovl-modal"
        @mousedown=${(e) => { if (e.target === e.currentTarget) { this._altOpen = false; } }}>
        <form class="ovl-form" @submit=${(e) => this._onAltSubmit(e)}>
          <div class="ovl-form-title">Alt text</div>
          <label class="ovl-form-field">
            <span>Describe the image for screen readers</span>
            <input name="alt-text" type="text" maxlength=${ALT_MAX_LENGTH}
                   autocomplete="off" autofocus
                   placeholder="e.g. A red sports car on a mountain road"
                   .value=${existing} />
          </label>
          <div class="ovl-form-actions">
            <button type="button" class="ovl-btn-secondary"
              @click=${() => { this._altOpen = false; }}>Cancel</button>
            <button type="submit" class="ovl-btn-primary">Save</button>
          </div>
        </form>
      </div>
    `;
  }

  _renderUrlDialog() {
    if (!this._urlOpen) return nothing;
    return html`
      <div class="ovl-modal"
        @mousedown=${(e) => { if (e.target === e.currentTarget) { this._urlOpen = false; } }}>
        <form class="ovl-form" @submit=${(e) => this._onUrlSubmit(e)}>
          <div class="ovl-form-title">Replace from URL</div>
          <label class="ovl-form-field">
            <span>Image URL</span>
            <input name="image-src" type="url" placeholder="https://…"
                   required autocomplete="off" autofocus />
          </label>
          <div class="ovl-form-actions">
            <button type="button" class="ovl-btn-secondary"
              @click=${() => { this._urlOpen = false; }}>Cancel</button>
            <button type="submit" class="ovl-btn-primary">Replace</button>
          </div>
        </form>
      </div>
    `;
  }

  render() {
    if (!this._open) return nothing;
    const image = this._selectedImage();
    const altMissing = image && !(image.node.attrs.alt ?? '').trim();
    return html`
      <div class="ovl-bar"
        @mousedown=${(e) => e.preventDefault()}>
        <button
          type="button"
          class="ovl-btn ${altMissing ? 'ovl-btn-warn' : ''}"
          aria-label=${altMissing ? 'Add alt text (missing)' : 'Edit alt text'}
          title=${altMissing ? 'Add alt text (missing)' : 'Edit alt text'}
          @click=${() => this._onAltClick()}>
          ${this._icon(ICON_ALT)}
          <span class="ovl-btn-label">Alt</span>
        </button>
        <button
          type="button"
          class="ovl-btn"
          aria-label="Replace image"
          title="Replace image"
          aria-haspopup="menu"
          aria-expanded=${this._replaceOpen ? 'true' : 'false'}
          @click=${() => this._onReplaceClick()}>
          ${this._icon(ICON_REPLACE)}
          <span class="ovl-btn-label">Replace</span>
        </button>
        <button
          type="button"
          class="ovl-btn ovl-btn-close"
          aria-label="Close"
          title="Close"
          @click=${() => this.hide()}>${CLOSE_GLYPH}</button>
        ${this._renderReplacePopover()}
      </div>
      ${this._renderAltDialog()}
      ${this._renderUrlDialog()}
    `;
  }
}

customElements.define('ew-image-overlay', EwImageOverlay);

export default EwImageOverlay;
