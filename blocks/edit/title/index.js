import { origin, hlxOrigin } from '../../browse/state/index.js';

async function saveToFranklin(path, action) {
  const opts = { method: 'POST' };
  const resp = await fetch(`${hlxOrigin}/${action}/auniverseaway/dac/main${path}`, opts);
  if (!resp.ok) console.log('error');
  return resp.json();
}

function toBlockCSSClassNames(text) {
  if (!text) return [];
  const names = [];
  const idx = text.lastIndexOf('(');
  if (idx >= 0) {
    names.push(text.substring(0, idx));
    names.push(...text.substring(idx + 1).split(','));
  } else {
    names.push(text);
  }

  return names.map((name) => name
    .toLowerCase()
    .replace(/[^0-9a-z]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, ''))
    .filter((name) => !!name);
}

function convertBlocks(tables) {
  tables.forEach(table => {
    const tbody = table.querySelector(':scope > tbody');
    const rows = tbody ? [...tbody.querySelectorAll(':scope > tr')] : [...table.querySelectorAll(':scope > tr')];
    const nameRow = rows.shift();
    const divs = [...rows].map((row) => {
      const cols = row.querySelectorAll(':scope > td');
      const divs = [...cols].map((col) => {
        const { innerHTML } = col;
        const div = document.createElement('div');
        div.innerHTML = innerHTML;
        return div;
      });
      const div = document.createElement('div');
      div.append(...divs);
      return div;
    });

    const div = document.createElement('div');
    div.className = toBlockCSSClassNames(nameRow.textContent).join(' ');
    div.append(...divs);
    table.parentElement.parentElement.replaceChild(div, table.parentElement);
  });
}

function saveToDas(pathname) {
  const fullPath = `${origin}/content${pathname}.html`;

  const editor = document.querySelector('.da-editor > .ProseMirror').cloneNode(true);
  editor.removeAttribute('class');
  editor.removeAttribute('contenteditable');
  editor.removeAttribute('translate');

  const emptyImgs = editor.querySelectorAll('img.ProseMirror-separator');
  emptyImgs.forEach((img) => { img.remove(); });

  const tables = editor.querySelectorAll('.tableWrapper > table');
  convertBlocks(tables);

  const html = `<body><main>${editor.outerHTML}</main></body>`;
  const blob = new Blob([html], { type: 'text/html' });

  const headerOpts = { 'Content-Type': 'text/html' };
  const headers = new Headers(headerOpts);

  const opts = { method: 'PUT', headers, body: blob};
  return fetch(fullPath, opts);
}

export async function handleAction(action) {
  const { hash } = window.location;
  const pathname = hash.replace('#', '');
  const dasSave = await saveToDas(pathname);
  if (dasSave.status !== 200) return;
  let json = await saveToFranklin(pathname, 'preview');
  if (action === 'publish') json = await saveToFranklin(pathname, 'live');
  const { url } = action === 'publish' ? json.live : json.preview;
  window.open(url, '_blank');
}

export function open(e) {
  e.target.closest('.da-header-actions').classList.toggle('is-open');
}
