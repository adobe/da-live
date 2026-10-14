import { html, render } from 'da-lit';
import { getNx } from '../../../../scripts/utils.js';

const { PANEL_EVENT, registerPanelSection } = await import(`${getNx()}/utils/panel.js`);

function toggleToolsPanel(open) {
  const type = open ? PANEL_EVENT.CLOSE : PANEL_EVENT.OPEN;
  document.dispatchEvent(new CustomEvent(type, { detail: { section: 'tools', id: 'search' } }));
}

// Owns a browse search session: the nav field, the tools panel, and the search engine lifecycle.
// The host (da-browse) supplies details, editor, permissions and the list component.
export default class SearchSession {
  #state = { matchCase: true };

  #toolsOpen = false;

  constructor(host) {
    this.host = host;
  }

  get state() {
    return this.#state;
  }

  set state(value) {
    this.#state = value;
    this.host.requestUpdate();
  }

  get toolsOpen() {
    return this.#toolsOpen;
  }

  set toolsOpen(value) {
    this.#toolsOpen = value;
    this.host.requestUpdate();
  }

  get action() {
    return this.navField?.querySelector('[slot="actions"]');
  }

  mount() {
    document.addEventListener(PANEL_EVENT.OPEN, this.handleToolsPanel);
    document.addEventListener(PANEL_EVENT.CLOSE, this.handleToolsPanel);
    registerPanelSection('tools', {
      position: 'after',
      width: '360px',
      getContent: () => this.getPanel(),
      onShow: async (aside) => {
        const panel = await this.getPanel();
        if (!this.host.isConnected) {
          aside.remove();
          return;
        }
        const body = aside.querySelector('.panel-body');
        if (!body.contains(panel)) body.replaceChildren(panel);
        aside.id = 'da-browse-tools';
        aside.setAttribute('aria-label', 'Browse tools');
        if (!this.toolsOpen) {
          document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'tools' } }));
          return;
        }
        await panel.updateComplete;
        panel.focus();
      },
    });
    this.ready = this.mountNavField();
  }

  destroy() {
    document.removeEventListener(PANEL_EVENT.OPEN, this.handleToolsPanel);
    document.removeEventListener(PANEL_EVENT.CLOSE, this.handleToolsPanel);
    if (this.panel) {
      document.dispatchEvent(new CustomEvent(PANEL_EVENT.CLOSE, { detail: { section: 'tools' } }));
      this.panel.closest('aside.panel')?.remove();
      this.panel.remove();
    }
    this.clear();
    this.navField?.remove();
  }

  async mountNavField() {
    const nav = document.querySelector('nx-nav');
    if (!nav) return;
    await import('../da-browse-search/da-browse-search.js');
    if (!this.host.isConnected) return;
    if (!this.navField) {
      const field = document.createElement('da-browse-search');
      field.getDirectory = async () => {
        await this.host.updateComplete;
        const list = this.host.browseCmp;
        if (!list) throw new Error('Directory listing is not ready');
        return list.getDirectorySnapshot();
      };
      field.addEventListener('search-submit', (event) => this.submit(event));
      field.addEventListener('input', () => this.setDraft(field.value));
      this.navField = field;
      this.renderAction();
    }
    nav.append(this.navField);
    this.updateNavField();
    this.sync();
  }

  renderAction() {
    if (!this.navField) return;
    render(html`
      <button type="button" slot="actions" title="Search options" aria-label="Search options"
        aria-controls="da-browse-tools" aria-expanded=${String(!!this.toolsOpen)}
        @click=${() => toggleToolsPanel(this.toolsOpen)}>
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
          <use href="/img/icons/s2-icon-properties-20-n.svg#icon"></use>
        </svg>
      </button>`, this.navField);
  }

  updateNavField() {
    if (!this.navField) return;
    const { fullpath } = this.host.details ?? {};
    const directory = fullpath?.split('/').filter(Boolean).at(-1);
    const label = directory ? `Search ${directory}` : 'Search files';
    this.navField.label = label;
    this.navField.placeholder = label;
    this.navField.fullpath = fullpath;
    this.navField.setAttribute('aria-label', label);
  }

  setDraft(value) {
    if (this.state.replacement?.loading) return;
    if (!value) {
      this.clear();
      return;
    }
    this.state = { ...this.state, draft: value, replacement: undefined };
    this.sync();
  }

  clear() {
    const wasSearching = !!this.engine;
    this.request = undefined;
    this.engine?.cancelSearch();
    this.engine = undefined;
    this.state = { matchCase: this.state.matchCase, loading: false };
    if (this.navField) {
      this.navField.resetCatalog();
      this.navField.value = '';
    }
    this.sync();
    if (wasSearching) {
      this.host.browseCmp?.notifySortState?.();
      this.host.browseCmp?.notifyTypesFilter?.();
    }
  }

  async submit(event, { preserveDraft = false } = {}) {
    event.preventDefault();
    if (this.state.replacement?.loading) return;
    this.navField?.closeSuggestions();
    const term = event.detail.value.trim();
    const fullpath = this.host.details?.fullpath;
    if (!term || !fullpath) return;
    const request = {};
    this.request = request;
    this.engine?.cancelSearch();
    this.state = {
      matchCase: this.state.matchCase,
      draft: preserveDraft ? this.state.draft ?? event.detail.value : event.detail.value,
      term,
      items: [],
      loading: true,
    };
    try {
      const { default: SearchEngine } = await import('./search.js');
      if (this.request !== request || !this.host.isConnected) return;
      const search = new SearchEngine();
      search.fullpath = fullpath;
      search.browseItems = this.host.browseCmp?.items?.map((item) => ({ ...item }));
      search.caseSensitive = this.state.matchCase;
      this.engine?.cancelSearch();
      search.addEventListener('updated', ({ detail }) => {
        if (this.engine === search && this.request === request) {
          this.state = { ...this.state, items: detail.items };
        }
      });
      this.engine = search;
      this.state = { ...this.state, items: [] };
      await this.host.updateComplete;
      if (this.request !== request || !this.host.isConnected) return;
      await search.search(fullpath, term);
    } catch (error) {
      if (this.request === request) {
        this.state = { ...this.state, error: `Search failed: ${error.message}` };
      }
    } finally {
      if (this.request === request) {
        this.state = { ...this.state, loading: false };
      }
    }
  }

  handleToolsPanel = (event) => {
    const closingOwnPanel = event.type === PANEL_EVENT.CLOSE
      && this.panel?.closest('aside.panel')?.contains(event.target);
    if (event.detail?.section !== 'tools' && !closingOwnPanel) return;
    this.toolsOpen = event.type === PANEL_EVENT.OPEN;
    if (!this.toolsOpen) this.action?.focus();
  };

  async getPanel() {
    this.panelReady ??= import('../da-browse-tools/da-browse-tools.js').then(() => {
      const panel = document.createElement('da-browse-tools');
      panel.addEventListener('findchange', ({ detail }) => this.setDraft(detail.value));
      panel.addEventListener('search-submit', (event) => this.submit(event));
      panel.addEventListener('matchcasechange', (event) => this.changeMatchCase(event));
      panel.addEventListener('replacerequest', (event) => this.replace(event));
      this.panel = panel;
      this.sync();
      return panel;
    }).catch((error) => {
      this.panelReady = undefined;
      this.toolsOpen = false;
      this.state = { ...this.state, error: `Search options failed: ${error.message}` };
      throw error;
    });
    return this.panelReady;
  }

  sync() {
    const { state, navField, host } = this;
    if (navField) {
      navField.disabled = !!state.replacement?.loading;
      navField.matchCase = state.matchCase;
      navField.editor = host.editor;
      const value = state.draft ?? state.term ?? '';
      if (navField.value !== value) navField.value = value;
    }
    this.renderAction();
    if (!this.panel) return;
    this.panel.searchState = {
      ...state,
      request: this.request,
      scope: host.details?.fullpath,
      count: state.items?.length ?? 0,
      canWrite: host.canWrite,
    };
  }

  async changeMatchCase({ detail: { matchCase } }) {
    if (this.state.replacement?.loading || this.state.matchCase === matchCase) return;
    this.state = { ...this.state, matchCase };
    if (this.state.term) {
      await this.submit(
        new CustomEvent('search-submit', { detail: { value: this.state.term } }),
        { preserveDraft: true },
      );
    }
  }

  async replace({ detail: { replacement } }) {
    const search = this.engine;
    const {
      loading,
      error: searchError,
      replacement: previousReplacement,
      term,
      draft,
    } = this.state;
    if (!search || !term || (draft ?? term).trim() !== term
      || loading || previousReplacement?.loading
      || searchError || !this.host.canWrite) return;
    this.state = { ...this.state, replacement: { loading: true } };
    try {
      const result = await search.replaceMatches({ replacement });
      if (this.engine !== search || !this.host.isConnected) return;
      if (result.cancelled) {
        this.state = { ...this.state, replacement: { error: 'Replacement cancelled.' } };
      } else {
        // Results are stale once replaced; reset the search but keep the outcome visible.
        this.clear();
        this.state = { ...this.state, replacement: result };
        this.sync();
      }
    } catch (error) {
      if (this.engine === search && this.host.isConnected) {
        this.state = {
          ...this.state,
          replacement: { error: `Replacement failed: ${error.message}` },
        };
      }
    }
  }
}
