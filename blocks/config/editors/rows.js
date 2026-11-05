import { html, nothing } from 'da-lit';
import { getRows } from '../sheets.js';
import { optionLabel, renderField, renderPill } from './fields.js';
import { INHERITANCE, ROWS } from '../messages.js';

// Panel options: `idOf(row)` matches site rows to org rows and finds duplicates (default: the
// `idKey` column; `duplicate` overrides the message), and `owns(row)` limits the panel to some
// rows of a shared sheet.
const idOf = (panel) => panel.idOf ?? ((row) => row[panel.idKey]);
const ownedRows = (panel, json, sheet) => getRows(json, sheet).filter(panel.owns ?? Boolean);

// The list as the editor will see it: org rows (or the site rows that replace them), then
// site-only rows. `index` points into the own rows.
export function rowStates(panel, { own, inherited, pending, sheet }) {
  const id = idOf(panel);
  const saved = ownedRows(panel, own, sheet);
  const rows = pending ?? saved;
  const orgRows = inherited ? ownedRows(panel, inherited, sheet) : [];
  const orgIds = new Set(orgRows.map(id));
  const items = [
    ...orgRows.map((orgRow) => {
      const index = rows.findIndex((row) => id(row) === id(orgRow));
      if (index === -1) return { row: orgRow, inherited: true };
      return { row: rows[index], index, overrides: true };
    }),
    ...rows.map((row, index) => ({ row, index })).filter(({ row }) => !orgIds.has(id(row))),
  ];
  return { rows, items, dirty: JSON.stringify(rows) !== JSON.stringify(saved) };
}

// Trims values and drops empty columns so saved rows stay as small as hand-written ones.
export function cleanRow(row) {
  return Object.fromEntries(Object.entries(row)
    .map(([key, value]) => [key, String(value ?? '').trim()])
    .filter(([, value]) => value));
}

// Field errors for a draft row, including a duplicate id among the other editable rows.
export function rowErrors(panel, rows, { index, row }) {
  const others = rows.filter((_, i) => i !== index);
  const errors = panel.validate(row, others);
  const id = idOf(panel);
  if (!errors[panel.idKey] && row[panel.idKey] && others.some((other) => id(other) === id(row))) {
    errors[panel.idKey] = panel.duplicate
      ?? ROWS.duplicate(panel.noun, panel.columns[0].label);
  }
  return errors;
}

// Rows to write: the sheet's rows this panel doesn't own (kept first, in order), then its rows.
export function rowsToSave(panel, json, rows, sheet) {
  const others = panel.owns ? getRows(json, sheet).filter((row) => !panel.owns(row)) : [];
  return [...others, ...rows];
}

// What a cell shows: the column's `display(row)`, else an option's label, else the value, with
// URLs (comma-separated in some sheets) shown without their scheme.
export function cellText(column, row) {
  if (column.display) return column.display(row);
  const value = row[column.key] ?? '';
  if (column.options) return optionLabel(column, value);
  return value.replace(/(^|,\s*)https?:\/\//gi, '$1');
}

// Long URLs wrap after each slash rather than mid-word.
const wrappable = (text) => String(text).split(/(?<=\/)/).map((part) => html`${part}<wbr>`);

// Columns shown in the table; `list: false` keeps a column to the add/edit dialog.
export const listColumns = (panel) => panel.columns.filter((column) => column.list !== false);

const ICONS = {
  edit: '/img/icons/s2-icon-edit-20-n.svg#icon',
  delete: '/img/icons/s2-icon-delete-20-n.svg#icon',
  add: '/img/icons/s2-icon-add-20-n.svg#icon',
};

const icon = (name) => html`<svg viewBox="0 0 20 20" aria-hidden="true"><use href=${ICONS[name]}></use></svg>`;

const iconButton = (name, label, onClick) => html`
  <button type="button" class="nx-action-btn-icon nx-btn-sm" aria-label=${label} title=${label} @click=${onClick}>
    ${icon(name)}
  </button>`;

// `name` is the row's first column, e.g. "Cards", for labels and the delete confirmation.
function renderActions({ row, index, inherited }, name, handlers) {
  if (inherited) {
    return html`<button type="button" class="nx-action-btn-quiet nx-btn-sm"
      @click=${() => handlers.onOverride(row)}>Override</button>`;
  }
  return html`
    ${iconButton('edit', ROWS.edit(name), () => handlers.onEdit(index))}
    ${iconButton('delete', ROWS.delete(name), () => handlers.onRemove(index, name))}`;
}

function renderRow(columns, item, handlers) {
  const { row, inherited, overrides } = item;
  const [first, ...rest] = columns;
  return html`
    <tr class=${inherited ? 'is-inherited' : ''}>
      <th scope="row">
        <span class="config-table-name">
          <span class="config-table-name-text">${cellText(first, row)}</span>
          ${inherited ? renderPill(INHERITANCE.inheritedPill, 'neutral') : nothing}
          ${overrides ? renderPill(INHERITANCE.overridesPill, 'override') : nothing}
        </span>
      </th>
      ${rest.map((column) => html`<td><span class="config-table-text">${wrappable(cellText(column, row))}</span></td>`)}
      ${handlers.disabled ? nothing : html`
        <td class="config-table-actions"><div class="config-table-buttons">${renderActions(item, cellText(first, row), handlers)}</div></td>`}
    </tr>`;
}

// Whether a row has `query` in any listed column, as shown (case-insensitive).
export function matches(panel, row, query) {
  const needle = query.trim().toLowerCase();
  return !needle || listColumns(panel)
    .some((column) => String(cellText(column, row)).toLowerCase().includes(needle));
}

// The search filters rows (`handlers.query` / `onSearch`); add and import sit next to it.
function renderToolbar(panel, items, handlers) {
  const { disabled, query = '' } = handlers;
  if (disabled && !items.length) return nothing;
  return html`
    <div class="config-row-buttons">
      ${items.length ? html`<nx-search class="config-search" variant="field" size="m"
        placeholder=${ROWS.search(panel.noun)} .value=${query}
        @input=${(e) => handlers.onSearch(e.target.value)}></nx-search>` : nothing}
      ${disabled ? nothing : html`
        ${handlers.actions ?? nothing}
        <button type="button" class="nx-form-btn-secondary config-add-btn" @click=${handlers.onAdd}>
          ${icon('add')}<span>Add ${panel.noun}</span>
        </button>`}
    </div>`;
}

function renderTable(columns, items, handlers) {
  return html`
    <div class="config-table-wrap">
      <table class="config-table">
        <thead>
          <tr>
            ${columns.map((column) => html`<th scope="col">${column.label}</th>`)}
            ${handlers.disabled ? nothing : html`<th scope="col"><span class="config-visually-hidden">Row actions</span></th>`}
          </tr>
        </thead>
        <tbody>${items.map((item) => renderRow(columns, item, handlers))}</tbody>
      </table>
    </div>`;
}

const renderEmpty = (title, hint) => html`
  <div class="config-empty">
    <p class="config-empty-title">${title}</p>
    ${hint ? html`<p>${hint}</p>` : nothing}
  </div>`;

export function renderRows(panel, { items }, handlers) {
  const query = handlers.query ?? '';
  const shown = items.filter(({ row }) => matches(panel, row, query));
  let body = renderTable(listColumns(panel), shown, handlers);
  if (!items.length) body = renderEmpty(ROWS.empty(panel.noun), handlers.disabled ? '' : ROWS.emptyHint(panel.noun));
  else if (!shown.length) body = renderEmpty(ROWS.noMatches(query.trim()), '');
  return html`${renderToolbar(panel, items, handlers)}${body}`;
}

// Errors show once the user has tried to apply.
export function renderRowDialog(panel, draft, errors, handlers) {
  const title = `${draft.index === null ? 'Add' : 'Edit'} ${panel.noun}`;
  const field = { disabled: false, onChange: handlers.onChange };
  return html`
    <nx-dialog class="config-row-dialog" title=${title} @close=${handlers.onCancel}>
      <form class="config-row-form" @submit=${(e) => { e.preventDefault(); handlers.onApply(); }}>
        ${panel.columns.map((column, i) => {
    const raw = draft.row[column.key] ?? '';
    const error = draft.submitted ? errors[column.key] : null;
    const state = { field: column, raw, value: raw.trim(), error };
    return renderField(state, field, { autofocus: i === 0 });
  })}
      </form>
      <button type="button" slot="actions" class="nx-form-btn-secondary" @click=${handlers.onCancel}>Cancel</button>
      <button type="button" slot="actions" class="nx-form-btn-primary" @click=${handlers.onApply}>
        ${draft.index === null ? 'Add' : 'Done'}
      </button>
    </nx-dialog>`;
}
