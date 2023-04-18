import { origin, hlxOrigin } from '../../browse/state/index.js';

async function openPreview(path) {
  const opts = { method: 'POST' };
  const resp = await fetch(`${hlxOrigin}${path}`, opts);
  if (!resp.ok) console.log('error');
  const json = await resp.json();
  window.open(path, '_blank');
}

export default async function save() {
  const { hash } = window.location;
  const pathname = hash.replace('#', '');

  const fullPath = `${origin}/content${pathname}.html`;

  const editor = document.querySelector('#da-editor');

  const html = `<body><main><div>${editor.innerHTML}</div></main></body>`;

  const blob = new Blob([html], { type: 'text/html' });

  const headerOpts = { 'Content-Type': 'text/html' };
  const headers = new Headers(headerOpts);

  const opts = { method: 'PUT', headers, body: blob};
  const resp = await fetch(fullPath, opts);
  if (resp.status !== 200) return;
  openPreview(pathname);
}
