import { html, repeat } from 'da-lit';

export default function renderFileTable({ files, label, renderRow }) {
  return html`<div class="file-table-scroll" role="region" aria-label="Files list" tabindex="0">
    <table class="file-table" aria-label=${label}>
      <colgroup><col><col><col><col></colgroup>
      <thead><tr>
        <th scope="col">Name</th><th scope="col">Folder</th><th scope="col">Modified at</th>
        <th scope="col"><span class="sr-only">File information and Favorite</span></th>
      </tr></thead>
      <tbody>${repeat(files, (item) => item.path, renderRow)}</tbody>
    </table>
  </div>`;
}
