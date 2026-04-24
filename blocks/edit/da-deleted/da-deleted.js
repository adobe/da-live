import { html, render } from 'da-lit';
import '../../shared/da-dialog/da-dialog.js';

const isMac = /Mac|iP(hone|[oa]d)/.test(navigator.platform);
const shortcut = isMac ? 'Cmd-Option-T' : 'Ctrl-Alt-T';

export default function showDocDeletedDialog() {
  return new Promise((resolve) => {
    const dialog = document.createElement('da-dialog');
    dialog.title = 'Document deleted';
    dialog.classList.add('da-deleted-dialog');

    render(html`
      <style>
        da-dialog.da-deleted-dialog::part(inner) { width: 460px; }
        da-dialog.da-deleted-dialog p { margin: 0 0 12px; line-height: 1.5; }
        da-dialog.da-deleted-dialog p:last-of-type { margin-bottom: 0; }
      </style>
      <p>This document has been deleted by someone else. You will be returned to the containing folder.</p>
      <p>If you want to undelete, the file can be found in the <b>.trash</b> directory (toggle with <b>${shortcut}</b> in list view).</p>
    `, dialog);

    dialog.action = {
      label: 'Return to folder',
      style: 'accent',
      click: () => dialog.close(),
    };

    dialog.addEventListener('close', () => {
      resolve();
      dialog.remove();
    }, { once: true });

    document.body.appendChild(dialog);
  });
}
