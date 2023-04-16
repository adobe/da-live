import { origin, content, breadcrumbs, showFolder, newFolder } from '../state/index.js';

function getPathname() {
  const { hash } = window.location;
  if (hash) return hash.replace('#', '');

  return window.location.hash;
}

function makeBreadCrumb(path) {
  const arr = path === '/' ? [''] : path.split('/');
  const temp = [];
  while (arr.length > 0) {
    let crumb = {
      pathname: arr.join('/'),
      name: arr.pop(),
    };
    if (!crumb.name) {
      crumb.name = 'documents';
      crumb.pathname = '/';
    }
    temp.unshift(crumb);
  }
  breadcrumbs.value = temp;
}

export async function handleAction(item) {
  const { parent, name } = item;
  const prefix = parent === '/' ? parent : `${parent}/`;
  const path = `${prefix}${name}`;
  if (item.type === 'folder') {
    window.location.hash = path;
    return;
  }
  if (item.type === 'file') {
    window.location.href = `/edit#${folder}${name}`;
  }
}

export async function getContent() {
  const pathname = getPathname();
  makeBreadCrumb(pathname);
  const resp = await fetch(`${origin}/browse?pathname=${pathname}`);
  const json = await resp.json();
  content.value = json;
}

export function handleHash() {
  window.addEventListener('hashchange', () => getContent());
}

export function handleCrumb(crumb) {
  window.location.hash = crumb.pathname;
}

export function handleChange(e) {
  newFolder.value = e.target.value;
}

export async function expandFolder() {
  showFolder.value = true;
  setTimeout(() => {
    const input = document.querySelector('.da-actions-input');
    input.focus();
  }, 1);
}

export async function handleSave() {
  const newName = newFolder.value.replaceAll(/\W+/g, '-');
  const { pathname } = breadcrumbs.value.at(-1);
  const fullPath = `${pathname}/${newName}`;

  const headerOpts = { 'Content-Type': 'application/json' };
  const headers = new Headers(headerOpts);

  const opts = { method: 'POST', headers, body: JSON.stringify({ pathname: fullPath })};
  const resp = await fetch(`${origin}/folder/create`, opts);
  const json = await resp.json();
  if (json.message === 'success') {
    content.value.unshift(json.item);
    content.value = [...content.value];
    showFolder.value = false;
    newFolder.value = '';
  }
}

export function handleCancel() {
  showFolder.value = false;
  newFolder.value = '';
}