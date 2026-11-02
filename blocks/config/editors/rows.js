import { html, nothing } from 'da-lit';
import { getRows } from '../sheets.js';
import { renderField, renderPill } from './fields.js';
import { INHERITANCE, ROWS } from '../messages.js';

// Panel options: `idOf(row)` matches site rows to org rows and finds duplicates (default: the
// `idKey` column; `duplicate` overrides the message), `owns(row)` limits the panel to some rows of
// a shared sheet, and `label(row)` / `details(row)` describe a row in the list.
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

function renderItem(panel, { row, index, inherited, overrides }, handlers) {
  const { disabled } = handlers;
  const details = panel.details?.(row)
    ?? panel.columns.slice(1).map((c) => row[c.key]).filter(Boolean).join(' · ');
  return html`
    <li class="config-row ${inherited ? 'is-inherited' : ''}">
      <div class="config-row-text">
        <span class="config-row-title">
          ${panel.label?.(row) ?? row[panel.idKey]}
          ${inherited ? renderPill(INHERITANCE.inheritedPill, 'neutral') : nothing}
          ${overrides ? renderPill(INHERITANCE.overridesPill, 'override') : nothing}
        </span>
        ${details ? html`<span class="config-row-details">${details}</span>` : nothing}
      </div>
      ${disabled ? nothing : html`
        <div class="config-row-actions">
          ${inherited
    ? html`<button type="button" class="nx-action-btn-quiet nx-btn-sm" @click=${() => handlers.onOverride(row)}>Override</button>`
    : html`
              <button type="button" class="nx-action-btn-quiet nx-btn-sm" @click=${() => handlers.onEdit(index)}>Edit</button>
              <button type="button" class="nx-action-btn-quiet nx-btn-sm" @click=${() => handlers.onRemove(index)}>Remove</button>`}
        </div>`}
    </li>`;
}

export function renderRows(panel, { items }, handlers) {
  return html`
    ${items.length
    ? html`<ul class="config-rows">${items.map((item) => renderItem(panel, item, handlers))}</ul>`
    : handlers.empty ?? html`<p class="config-message">${ROWS.empty(panel.noun)}</p>`}
    ${handlers.disabled ? nothing : html`
      <div class="config-row-buttons">
        <button type="button" class="nx-form-btn-secondary" @click=${handlers.onAdd}>Add ${panel.noun}</button>
        ${handlers.actions ?? nothing}
      </div>`}`;
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
