import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);

await import(`${getNx()}/blocks/shared/picker/picker.js`);

const style = await loadStyle(import.meta.url);

const CLOSE_ICON_SRC = '/img/icons/s2-icon-splitright-20-n.svg';
const OPEN_IN_ICON_URL = '/img/icons/s2-icon-openin-20-n.svg';
const ACTIVE_VIEW_KEY = 'nx-tool-panel-active-view';

class EwToolPanel extends LitElement {
  static properties = {
    views: { attribute: false },
    activeId: { type: String },
    _fullsizeDialogViewId: { state: true },
  };

  _loaded = {};

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
  }

  get _fullsizeDialogView() {
    const id = this._fullsizeDialogViewId;
    if (!id || !this.views) return null;
    return this.views.find((v) => v.id === id) ?? null;
  }

  _pickerItemsFromViews() {
    if (!this.views?.length) return [];
    const items = [];
    let lastSection;
    for (const v of this.views) {
      if (v.section && v.section !== lastSection) {
        items.push({ section: v.section });
        lastSection = v.section;
      }
      const opensExternally = v.experience === 'window' || v.experience === 'fullsize-dialog';
      items.push({
        value: v.id,
        label: v.label,
        ...(opensExternally && {
          action: true,
          trailingIcon: OPEN_IN_ICON_URL,
          ariaLabel: v.experience === 'window'
            ? `${v.label} (opens in new tab)`
            : `${v.label} (opens in dialog)`,
        }),
      });
    }
    return items;
  }

  _pruneLoadedViews() {
    const ids = new Set(this.views.map((v) => v.id));
    Object.keys(this._loaded).forEach((id) => {
      if (!ids.has(id)) {
        this._loaded[id].remove();
        delete this._loaded[id];
      }
    });
  }

  async updated(changed) {
    if (changed.has('views')) await this._onViewsChange();
    if (changed.has('activeId')) {
      if (this.activeId) {
        try { sessionStorage.setItem(ACTIVE_VIEW_KEY, this.activeId); } catch { /* ignore */ }
      }
      this._syncContent();
      this._syncHeaderActions();
    }
    if (changed.has('_fullsizeDialogViewId') && this._fullsizeDialogViewId) {
      await this._mountDialog();
    }
  }

  async _onViewsChange() {
    if (!this.views?.length) {
      this._closeDialog();
      this.activeId = undefined;
      this._loaded = {};
      this.shadowRoot.querySelector('.tool-panel-content').replaceChildren();
      return;
    }

    this._pruneLoadedViews();
    const ids = new Set(this.views.map((v) => v.id));

    if (this._fullsizeDialogViewId && !ids.has(this._fullsizeDialogViewId)) {
      this._closeDialog();
    }

    if (!this.activeId || !ids.has(this.activeId)) {
      const stored = sessionStorage.getItem(ACTIVE_VIEW_KEY);
      await this.showView(stored && ids.has(stored) ? stored : this.views[0].id);
    }
  }

  async _mountDialog() {
    await this.updateComplete;
    const dialog = this.shadowRoot.querySelector('.tool-panel-fullsize-dialog');
    const body = dialog.querySelector('.tool-panel-fullsize-dialog-body');
    const viewId = this._fullsizeDialogViewId;
    if (body.dataset.mountedFor === viewId) return;
    body.innerHTML = '';
    body.dataset.mountedFor = viewId;
    if (!dialog.open) dialog.showModal();
    const view = this.views.find((v) => v.id === viewId);
    await view.loadModal(body, () => dialog.close());
  }

  _closeDialog() {
    const dialog = this.shadowRoot.querySelector('.tool-panel-fullsize-dialog');
    if (dialog?.open) {
      dialog.close();
    } else {
      this._fullsizeDialogViewId = undefined;
    }
  }

  async showView(id) {
    const consumer = this.views.find((c) => c.id === id);
    if (!consumer) return;
    if (consumer.experience === 'window') {
      window.open(
        new URL(consumer.sources[0], window.location.href).href,
        '_blank',
        'noopener,noreferrer',
      );
      return;
    }
    if (consumer.experience === 'fullsize-dialog') {
      this._fullsizeDialogViewId = id;
      return;
    }
    if (!this._loaded[id]) {
      this._loaded[id] = await consumer.load();
    }
    this.activeId = id;
  }

  _syncContent() {
    const content = this.shadowRoot.querySelector('.tool-panel-content');
    Object.entries(this._loaded).forEach(([id, el]) => {
      el.hidden = id !== this.activeId;
      if (id === this.activeId && !content.contains(el)) content.append(el);
    });
  }

  _syncHeaderActions() {
    const zone = this.shadowRoot.querySelector('.tool-panel-header-actions');
    zone.textContent = '';
    const consumer = this.views.find((c) => c.id === this.activeId);
    if (!consumer?.firstParty) return;
    const actions = this._loaded[this.activeId]?.getHeaderActions?.();
    if (actions) zone.append(actions);
  }

  _renderDialogIcon(icon) {
    if (!icon) return nothing;
    if (icon.startsWith('#')) return html`<svg class="tool-panel-dialog-icon" aria-hidden="true"><use href="${icon}"></use></svg>`;
    return html`<img class="tool-panel-dialog-icon" src="${icon}" alt="">`;
  }

  _close() {
    this.dispatchEvent(new CustomEvent('nx-panel-close', { bubbles: true, composed: true }));
  }

  _onFullsizeDialogClose() {
    this._fullsizeDialogViewId = undefined;
  }

  render() {
    const items = this._pickerItemsFromViews();
    const dialogTitle = this._fullsizeDialogView?.label ?? 'Extension';
    const dialogIcon = this._fullsizeDialogView?.icon;

    return html`
      <div class="tool-panel-header">
        <button type="button" class="tool-panel-close" aria-label="Close panel" @click=${this._close}>
          <svg aria-hidden="true" class="icon" viewBox="0 0 20 20"><use href="${CLOSE_ICON_SRC}#icon"></use></svg>
        </button>
        <nx-picker
          .items=${items}
          .value=${this.activeId}
          placement="below-start"
          @change=${(e) => this.showView(e.detail.value)}
        ></nx-picker>
        <div class="tool-panel-header-actions"></div>
      </div>
      <div class="tool-panel-content"></div>
      ${this._fullsizeDialogViewId ? html`
        <dialog
          class="tool-panel-fullsize-dialog"
          @close=${this._onFullsizeDialogClose}
        >
          <div class="tool-panel-fullsize-dialog-header">
            <div class="tool-panel-fullsize-dialog-title">
              ${this._renderDialogIcon(dialogIcon)}
              <p>${dialogTitle}</p>
            </div>
            <button type="button" class="tool-panel-fullsize-dialog-close" aria-label="Close"
              @click=${(e) => e.target.closest('dialog').close()}>✕</button>
          </div>
          <div class="tool-panel-fullsize-dialog-body"></div>
        </dialog>
      ` : nothing}
    `;
  }
}

customElements.define('ew-tool-panel', EwToolPanel);
