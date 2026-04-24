/*
 * Copyright 2026 Adobe. All rights reserved.
 * Licensed under the Apache License, Version 2.0.
 */

/**
 * Lightweight i18n runtime for DA-live.
 *
 * Catalog shape (per locale JSON file):
 *   {
 *     "simple.key": "Plain text",
 *     "with.interpolation": "Hello, {name}",
 *     "with.plural": { "one": "# item", "other": "# items" }
 *   }
 *
 * Message tokens:
 *   {name}   → replaced with values[name]
 *   #        → replaced with the plural count (inside plural branches only)
 *
 * Missing keys fall back to the `en` catalog, then to the key itself.
 */

export const SUPPORTED_LOCALES = ['en', 'fr', 'de'];
export const DEFAULT_LOCALE = 'en';
const STORAGE_KEY = 'da-locale';

let current = DEFAULT_LOCALE;
let catalog = {};
let fallbackCatalog = {};
let initPromise = null;
const listeners = new Set();

function detectLocale() {
  const fromQuery = new URLSearchParams(window.location.search).get('lang');
  if (fromQuery && SUPPORTED_LOCALES.includes(fromQuery)) {
    localStorage.setItem(STORAGE_KEY, fromQuery);
    return fromQuery;
  }

  try {
    const fromStorage = localStorage.getItem(STORAGE_KEY);
    if (fromStorage && SUPPORTED_LOCALES.includes(fromStorage)) return fromStorage;
  } catch {
    // localStorage unavailable (private mode, SSR, etc.)
  }

  const nav = (navigator.language || '').toLowerCase().split('-')[0];
  if (SUPPORTED_LOCALES.includes(nav)) return nav;

  return DEFAULT_LOCALE;
}

async function loadCatalog(locale) {
  const base = import.meta.url.replace(/\/blocks\/shared\/i18n\.js.*$/, '');
  const url = `${base}/locales/${locale}.json`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) return {};
    return await resp.json();
  } catch {
    return {};
  }
}

export async function initI18n(locale) {
  current = locale || detectLocale();
  const tasks = [loadCatalog(current)];
  if (current !== DEFAULT_LOCALE) tasks.push(loadCatalog(DEFAULT_LOCALE));
  const [primary, fallback] = await Promise.all(tasks);
  catalog = primary;
  fallbackCatalog = fallback || {};
  initPromise = Promise.resolve();
  listeners.forEach((fn) => {
    try { fn(current); } catch { /* noop */ }
  });
  return current;
}

export async function setLocale(locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return current;
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* noop */ }
  await initI18n(locale);
  return current;
}

export function getLocale() {
  return current;
}

export function onLocaleChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function readyI18n() {
  return initPromise || initI18n();
}

function lookup(key) {
  if (Object.prototype.hasOwnProperty.call(catalog, key)) return catalog[key];
  if (Object.prototype.hasOwnProperty.call(fallbackCatalog, key)) return fallbackCatalog[key];
  return undefined;
}

function interpolate(template, values) {
  if (!values) return template;
  return template.replace(/\{(\w+)\}/g, (match, name) => {
    const v = values[name];
    return v === undefined || v === null ? match : String(v);
  });
}

function formatPlural(entry, values) {
  const count = values?.count;
  if (typeof count !== 'number') {
    // No count provided — best effort: prefer 'other'.
    const fallback = entry.other ?? entry.one ?? '';
    return interpolate(fallback, values).replace(/#/g, '');
  }
  let category;
  try {
    category = new Intl.PluralRules(current).select(count);
  } catch {
    category = count === 1 ? 'one' : 'other';
  }
  const template = entry[category] ?? entry.other ?? entry.one ?? '';
  return interpolate(template, values).replace(/#/g, String(count));
}

/**
 * Translate a message key to a localized string.
 * @param {string} key  The catalog key.
 * @param {object} [values]  Interpolation values. Use `count` for plurals.
 * @returns {string}
 */
export function t(key, values) {
  const entry = lookup(key);
  if (entry === undefined) return key;
  if (typeof entry === 'string') return interpolate(entry, values);
  if (typeof entry === 'object') return formatPlural(entry, values);
  return key;
}

/**
 * Lit ReactiveController that triggers host re-renders when the locale changes.
 * Usage:
 *   class MyEl extends LitElement {
 *     #i18n = new I18nController(this);
 *     render() { return html`${t('my.key')}`; }
 *   }
 */
export class I18nController {
  constructor(host) {
    this.host = host;
    host.addController?.(this);
  }

  hostConnected() {
    this._unsubscribe = onLocaleChange(() => this.host.requestUpdate?.());
  }

  hostDisconnected() {
    if (this._unsubscribe) this._unsubscribe();
  }
}
