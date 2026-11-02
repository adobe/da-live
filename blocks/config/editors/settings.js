import { html, nothing } from 'da-lit';
import { getValue } from '../sheets.js';
import { optionLabel, renderField, renderPill } from './fields.js';
import { INHERITANCE, VALIDATION } from '../messages.js';

// A stored value as the editor compares it: a trimmed string, whatever the sheet holds
// (hand-edited sheets can have stray spaces or non-string values).
const normalized = (json, key, sheet) => String(getValue(json, key, sheet) ?? '').trim();

// `inherited` is the org config under a site (null at org scope). Values compare trimmed, so
// whitespace alone never makes a field dirty.
export function fieldStates(fields, { own, inherited, edits, sheet }) {
  return fields.map((field) => {
    const saved = normalized(own, field.key, sheet);
    const raw = field.key in edits ? String(edits[field.key]) : saved;
    const value = raw.trim();
    const orgValue = inherited ? normalized(inherited, field.key, sheet) : '';
    let error = value ? field.validate?.(value) ?? null : null;
    // Required only bites once the user clears a saved value: an empty field on load isn't an
    // error to shout about, and an org value satisfies it at site scope.
    const cleared = !value && !orgValue && value !== saved;
    if (field.required && cleared) error = VALIDATION.required(field.label);
    return {
      field,
      raw,
      value,
      orgValue,
      atSite: !!inherited,
      dirty: value !== saved,
      overridden: !!value && !!orgValue,
      inherits: !value && !!orgValue,
      error,
    };
  });
}

// { key: value } for every edited field, ready for applyValues.
export function pendingChanges(states) {
  return Object.fromEntries(states.filter((s) => s.dirty).map((s) => [s.field.key, s.value]));
}

// Kept outside the <label>: a label forwards clicks to the first button inside it.
function renderInheritance(state, { disabled, onReset }) {
  const { field, orgValue } = state;
  if (state.inherits) {
    return html`<p class="config-setting-note">${INHERITANCE.inheritedValue(optionLabel(field, orgValue))}</p>`;
  }
  if (!state.overridden) return nothing;
  return html`
    <p class="config-setting-note">
      ${renderPill(INHERITANCE.overridesPill, 'override')}
      ${INHERITANCE.orgDefault(optionLabel(field, orgValue))}
      ${disabled ? nothing : html`
        <button type="button" class="nx-action-btn-quiet nx-btn-sm" @click=${() => onReset(field.key)}>
          Use org default
        </button>`}
    </p>`;
}

export function renderSettings(states, handlers) {
  return html`
    <div class="config-settings">
      ${states.map((state) => html`
        <div class="config-setting ${state.dirty ? 'is-dirty' : ''}">
          ${renderField(state, handlers, { showKey: true })}
          ${renderInheritance(state, handlers)}
        </div>`)}
    </div>`;
}
