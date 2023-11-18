import { origin, content, breadcrumbs, create, resetCreate } from '../state/index.js';

function getPathname() {
  const { hash } = window.location;
  if (hash) return hash.replace('#', '');
  return '/';
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
  const resp = await fetch(`${origin}${pathname}.1.json`);
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
  create.value.name = e.target.value;
  create.value = { ...create.value };
}

export function showCreateMenu() {
  const { show } = create.value;
  create.value.show = show === 'menu' ? '' : 'menu';
  create.value = { ...create.value };
}

export async function handleNewType(e) {
  create.value.show = 'input';
  create.value.type = e.target.dataset.type;
  create.value = { ...create.value };
  setTimeout(() => {
    const input = document.querySelector('.da-actions-input');
    input.focus();
  }, 1);
}

export async function handleSave() {
  const saveName = create.value.name.replaceAll(/\W+/g, '-');
  const { pathname } = breadcrumbs.value.at(-1);
  const prefix = pathname === '/' ? '' : pathname;
  const path = `${origin}${prefix}/${saveName}`;
  const fullPath = create.value.type === 'folder' ? path : `${path}.html`;

  const headerOpts = { 'Content-Type': 'application/json' };
  const headers = new Headers(headerOpts);

  const opts = { method: 'PUT', headers };
  const resp = await fetch(fullPath, opts);
  if (resp.status !== 200) return;
  const json = await resp.json();

  if (create.value.type === 'document') {
    window.open(`/edit#${prefix}/${saveName}`);
  }

  resetCreate();
  content.value.unshift(json);
  content.value = [...content.value];
}
