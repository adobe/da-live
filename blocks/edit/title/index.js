import { origin, hlxOrigin } from '../../browse/state/index.js';

async function openPreview(path) {
  const opts = { method: 'POST' };
  const resp = await fetch(`${hlxOrigin}${path}`, opts);
  if (!resp.ok) console.log('error');
  const json = await resp.json();
  window.open(path, '_blank');
}

function toBlockCSSClassNames(text) {
  if (!text) {
    return [];
  }
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
    const rows = [...tbody.querySelectorAll(':scope > tr')];
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
    table.parentElement.replaceChild(div, table);
  });
}

export default async function save() {
  const { hash } = window.location;
  const pathname = hash.replace('#', '');

  const fullPath = `${origin}/content${pathname}.html`;

  const editor = document.querySelector('.da-editor');

  const toSend = editor.cloneNode(true);
  const tables = toSend.querySelectorAll('table');
  convertBlocks(tables);

  const html = `<body><main><div>${toSend.innerHTML}</div></main></body>`;

  const blob = new Blob([html], { type: 'text/html' });

  const headerOpts = { 'Content-Type': 'text/html' };
  const headers = new Headers(headerOpts);

  const opts = { method: 'PUT', headers, body: blob};
  const resp = await fetch(fullPath, opts);
  if (resp.status !== 200) return;
  openPreview(pathname);
}
