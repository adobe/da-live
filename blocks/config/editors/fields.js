// Field, pill and callout renderers shared by the settings list, row dialog and import dialog.

import { html, nothing } from 'da-lit';
import { INHERITANCE } from '../messages.js';

export const optionLabel = (field, value) => field.options
  ?.find((o) => o.value === value)?.label ?? value;

export const renderCallout = (text, actions) => html`
  <div class="config-note config-setup" role="note"><p>${text}</p>${actions}</div>`;

const ALERT_ICON = '/img/icons/s2-icon-alerttriangle-20-n.svg#icon';

// A problem that blocks the panel (Coworker-style): what failed, why, and a warning icon.
export const renderAlert = (title, detail) => html`
  <div class="config-alert" role="alert">
    <div class="config-alert-text">
      <p class="config-alert-title">${title}</p>
      <p>${detail}</p>
    </div>
    <svg class="config-alert-icon" viewBox="0 0 20 20" aria-hidden="true"><use href=${ALERT_ICON}></use></svg>
  </div>`;

// Read-only status tag. `tone` is `override` (orange) or `neutral` (grey).
export function renderPill(label, tone) {
  return html`<nx-pills class="config-pill-${tone}" label="Status"
    .items=${[{ id: label, label, removable: false }]}></nx-pills>`;
}

function renderControl({ field, raw, value, orgValue, atSite }, { disabled, onChange }, autofocus) {
  const required = !!field.required;
  const id = `config-${field.key.replace(/\s+/g, '-')}`;
  if (field.options) {
    // At site scope an empty value inherits the org value, whatever the field's default is.
    const empty = atSite ? INHERITANCE.inheritFromOrg : field.emptyLabel ?? INHERITANCE.notSet;
    return html`
      <nx-picker
        id=${id}
        ?autofocus=${autofocus}
        aria-required=${required ? 'true' : 'false'}
        variant="field"
        size="m"
        .items=${[{ value: '', label: empty }, ...field.options]}
        .value=${value}
        ?inert=${disabled}
        @change=${(e) => onChange(field.key, e.detail.value)}
      ></nx-picker>`;
  }
  const placeholder = orgValue || field.placeholder || '';
  const onInput = (e) => onChange(field.key, e.target.value);
  if (field.multiline) {
    return html`<textarea id=${id} ?autofocus=${autofocus} ?required=${required} class="nx-input config-textarea" rows="3" .value=${raw}
      placeholder=${placeholder} ?disabled=${disabled} @input=${onInput}></textarea>`;
  }
  return html`<input id=${id} ?autofocus=${autofocus} ?required=${required} class="nx-input" type=${field.type ?? 'text'} autocomplete="off" .value=${raw}
    placeholder=${placeholder} ?disabled=${disabled} @input=${onInput}>`;
}

const renderHelp = ({ hint, key }, showKey) => (hint || showKey ? html`
  <span class="config-field-help">${hint} ${showKey ? html`<code>${key}</code>` : nothing}</span>` : nothing);

// Spectrum TextField layout: label (`*` when required), control, then help text, which an error
// replaces. `showKey` adds the config key to the help text; `autofocus` marks the control
// nx-dialog focuses when it opens.
export function renderField(state, handlers, { showKey = false, autofocus = false } = {}) {
  const { field, error } = state;
  return html`
    <label class="nx-form-field ${error ? 'nx-field-error' : ''}">
      <span class="config-field-label">
        ${field.label}${field.required ? html`<span class="config-required" aria-hidden="true">*</span>` : nothing}
      </span>
      ${renderControl(state, handlers, autofocus)}
      ${error ? html`<span class="nx-input-error-msg" role="alert">${error}</span>` : renderHelp(field, showKey)}
    </label>`;
}
