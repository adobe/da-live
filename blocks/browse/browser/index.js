import { origin, content, breadcrumbs, showNew, newName, newType } from '../state/index.js';

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
    window.location.href = `/edit#${prefix}${name}`;
  }
}

export async function getContent() {
  const pathname = getPathname();
  makeBreadCrumb(pathname);
  const resp = await fetch(`${origin}/api/list?pathname=${pathname}`);
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
  newName.value = e.target.value;
}

export function expandNew() {
  showNew.value = showNew.value === 'show-new' ? '' : 'show-new';
}

export async function handleNewType(e) {
  showNew.value = 'show-input';
  newType.value = e.target.innerText;
  setTimeout(() => {
    const input = document.querySelector('.da-actions-input');
    input.focus();
  }, 1);
}

export async function handleSave() {
  const saveName = newName.value.replaceAll(/\W+/g, '-');
  const { pathname } = breadcrumbs.value.at(-1);
  const prefix = pathname === '/' ? '' : pathname;
  const path = `${origin}/content${prefix}/${saveName}`;
  const fullPath = newType.value === 'Folder' ? path : `${path}.html`;

  const headerOpts = { 'Content-Type': 'application/json' };
  const headers = new Headers(headerOpts);

  const opts = { method: 'PUT', headers };
  const resp = await fetch(fullPath, opts);
  if (resp.status !== 200) return;

  const json = await resp.json();

  if (newType.value === 'Document') {
    window.open(`/edit#${prefix}/${saveName}`);
  }

  content.value.unshift(json);
  content.value = [...content.value];
  showNew.value = '';
  newName.value = '';
  newType.value = '';
}

export function handleCancel() {
  showFolder.value = false;
  newFolder.value = '';
}
