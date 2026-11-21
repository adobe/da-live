import { DA_ORIGIN, COLLAB_ORIGIN, getDaAdminEnvironment, getDaCollabEnvironment } from './constants.js';

const FIRST_PARTY_ROUTES = new Set(['/', '/browse', '/canvas', '/edit', '/sheet', '/media']);

// Propagate only the explicit selection, and only to known same-origin app routes.
export function withDaRsBinding(destination, currentHref = window.location.href) {
  const current = new URL(currentHref);
  if (current.searchParams.get('da-source') !== 'da-rs') return destination;
  // Hash-only navigation already retains the current binding without a reload.
  if (destination.startsWith('#')) return destination;
  const target = new URL(destination, current);
  if (target.origin !== current.origin || target.username || target.password
    || !FIRST_PARTY_ROUTES.has(target.pathname)) {
    return destination;
  }
  target.searchParams.set('da-source', 'da-rs');
  const configured = {
    'da-admin': getDaAdminEnvironment(DA_ORIGIN),
    'da-collab': getDaCollabEnvironment(COLLAB_ORIGIN),
  };
  ['da-admin', 'da-collab'].forEach((key) => {
    target.searchParams.delete(key);
    const explicit = current.searchParams.get(key);
    const value = explicit && explicit !== 'reset' ? explicit : configured[key];
    if (value) target.searchParams.set(key, value);
  });
  return /^[a-z][a-z\d+.-]*:/i.test(destination)
    ? target.href : `${target.pathname}${target.search}${target.hash}`;
}

let installed = false;
export function installDaRsNavigation() {
  if (installed) return;
  installed = true;
  const preserve = (event) => {
    const anchor = event.composedPath().find((node) => node instanceof HTMLAnchorElement);
    if (!anchor?.hasAttribute('href')) return;
    const href = anchor.getAttribute('href');
    const next = withDaRsBinding(href);
    if (next !== href) anchor.setAttribute('href', next);
  };
  document.addEventListener('click', preserve, true);
  document.addEventListener('auxclick', preserve, true);
}
