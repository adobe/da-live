import { origin } from '../../browse/state/index.js';

export default async function save() {
  const { hash } = window.location;
  const pathname = hash.replace('#', '');

  const fullPath = `${origin}/content${pathname}.html`;

  const editor = document.querySelector('#da-editor');
  const blob = new Blob([editor.innerHTML], { type: 'text/html' });

  const headerOpts = { 'Content-Type': 'text/html' };
  const headers = new Headers(headerOpts);

  const opts = { method: 'PUT', headers, body: blob};
  const resp = await fetch(fullPath, opts);
  if (resp.status !== 200) return;
  console.log('success');
}
