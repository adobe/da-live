import { html, repeat } from 'da-lit';

export default function renderFileTable({ files, label, renderRow }) {
  return html`<div class="file-table-scroll" role="region" aria-label="Files list" tabindex="0">
    <div class="file-table" role="table" aria-label=${label}>
      <div role="rowgroup">
        <div class="file-table-header" role="row">
          <div role="columnheader">Name</div><div role="columnheader">Folder</div>
          <div role="columnheader">Modified at</div><div role="columnheader">Modified by</div>
          <div role="columnheader"><span class="sr-only">File information and Favorite</span></div>
        </div>
      </div>
      <div role="rowgroup">${repeat(files, (item) => item.path, renderRow)}</div>
    </div>
  </div>`;
}
