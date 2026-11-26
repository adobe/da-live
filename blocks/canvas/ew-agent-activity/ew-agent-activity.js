import { LitElement, html, nothing } from 'da-lit';
import { getNx } from '../../../scripts/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';
import { TURN_STATUS } from './agent-activity.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const style = await loadStyle(import.meta.url);

const TURN_LABEL = {
  [TURN_STATUS.RUNNING]: 'Running',
  [TURN_STATUS.COMPLETED]: 'Completed',
  [TURN_STATUS.ABORTED]: 'Stopped',
  [TURN_STATUS.ERROR]: 'Failed',
};

// Display order for the per-status counts.
const PAGE_LABEL = {
  'needs-approval': 'Needs approval',
  working: 'Working',
  failed: 'Failed',
  rejected: 'Rejected',
  done: 'Done',
};

const FINISHED = new Set(['done', 'failed', 'rejected']);

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

class EwAgentActivity extends LitElement {
  static properties = { _activity: { state: true } };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [style];
    this._unsubscribe = canvasBus.agentActivityState.subscribe((activity) => {
      this._activity = activity;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe?.();
  }

  _renderCounts(pages) {
    const counts = pages.reduce((acc, { status }) => {
      acc[status] = (acc[status] ?? 0) + 1;
      return acc;
    }, {});
    const entries = Object.keys(PAGE_LABEL).filter((status) => counts[status]);
    if (!entries.length) return nothing;
    return html`
      <ul class="counts" aria-label="Pages by status">
        ${entries.map((status) => html`
          <li class="count" data-status=${status}>${PAGE_LABEL[status]} ${counts[status]}</li>`)}
      </ul>`;
  }

  _renderPages(pages, running) {
    if (!pages.length) {
      return html`<p class="note">${running
        ? 'Waiting for the agent to identify pages…'
        : 'The agent did not work on any pages for this prompt.'}</p>`;
    }
    return html`
      <ul class="pages" aria-label="Pages">
        ${pages.map(({ path, status }) => html`
          <li class="page">
            <span class="page-path" title=${path}>${path}</span>
            <span class="page-status" data-status=${status}>${PAGE_LABEL[status] ?? status}</span>
          </li>`)}
      </ul>`;
  }

  render() {
    const activity = this._activity;
    if (!activity) {
      return html`<p class="note empty">Send a prompt in chat to see which pages the agent works on.</p>`;
    }
    const { status, pages } = activity;
    const running = status === TURN_STATUS.RUNNING;
    const finished = pages.filter((page) => FINISHED.has(page.status)).length;
    return html`
      <section class="agent-activity" aria-live="polite">
        <div class="summary">
          <h3>${plural(pages.length, 'page')} identified</h3>
          <span class="turn-status" data-status=${status}>${TURN_LABEL[status] ?? status}</span>
        </div>
        ${pages.length ? html`
          <progress max=${pages.length} .value=${finished}
            aria-label="${finished} of ${pages.length} pages finished"></progress>
          <p class="note">${finished} of ${plural(pages.length, 'page')} finished</p>` : nothing}
        ${this._renderCounts(pages)}
        ${this._renderPages(pages, running)}
      </section>`;
  }
}

customElements.define('ew-agent-activity', EwAgentActivity);
