import { html, nothing, repeat } from 'da-lit';
import { LIST_COLUMNS } from './constants.js';

export default function renderFileTable({ files, label, renderRow }) {
  return html`<div class="file-table-scroll" role="region" aria-label="Files list" tabindex="0">
    <div class="file-table" role="table" aria-label=${label}>
      <div role="rowgroup">
        <div class="file-table-header" role="row">
          ${LIST_COLUMNS.map(({ label: title, hideLabel }) => html`<div role="columnheader">
            <span class=${hideLabel ? 'sr-only' : nothing}>${title}</span>
          </div>`)}
        </div>
      </div>
      <div role="rowgroup">${repeat(files, (item) => item.path, renderRow)}</div>
    </div>
  </div>`;
}
