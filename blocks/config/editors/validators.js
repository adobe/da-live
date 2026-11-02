// Building blocks for row validators. A check takes a trimmed value, the row and the panel's
// other rows, and returns an error message, or a falsy value when the value is fine.

import { VALIDATION } from '../messages.js';

// A full URL or a path the editor resolves against the site (/tools/x.html).
export const isPath = (value) => /^(https?:\/\/|\/)\S*$/i.test(value);

export const required = (text) => (value) => !value && text;

// `example` shows a value that would pass.
export const urlOrPath = (example) => (value) => (
  value && !isPath(value) && VALIDATION.urlOrPath(example));

// Icons may also be SVG symbol references (#id).
export const icon = (value) => value && !isPath(value) && !value.startsWith('#')
  && VALIDATION.icon;

// `ref` gates a row to ?ref=<value>, so it must be a single word.
export const ref = (example) => (value) => /\s/.test(value) && VALIDATION.ref(example);

// First failing check wins.
export const all = (...checks) => (...args) => checks.reduce((error, check) => (
  error || check(...args)), null);

// { column: check } → (row, others) => { column: message } for the columns that fail.
export function validator(checks) {
  return (row, others = []) => Object.fromEntries(Object.entries(checks)
    .map(([key, check]) => [key, check((row[key] ?? '').trim(), row, others)])
    .filter(([, error]) => error));
}
