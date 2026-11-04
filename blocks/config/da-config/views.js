// Stateless templates of the config shell. The element passes in its state and handlers.

import { html, nothing } from 'da-lit';
import { renderAlert, renderCallout } from '../editors/fields.js';
import { SHELL, failureDetail } from '../messages.js';

// Section icons (img/<icon>.svg); nx-segmented-btn appends the #icon fragment.
export const iconUrl = (icon) => new URL(`../img/${icon}.svg`, import.meta.url).pathname;

export function renderOrgForm(onSubmit) {
  return html`
    <div class="config-note" role="note">
      <form class="config-org-form" @submit=${onSubmit}>
        <p>${SHELL.noOrg}</p>
        <input
          class="nx-input"
          name="org"
          type="text"
          placeholder="Organization"
          aria-label="Organization"
          autocomplete="off"
          required
        >
        <button type="submit" class="nx-form-btn-secondary">Open</button>
      </form>
    </div>`;
}

export function renderHeader({ siteNames, site, onScopeChange }) {
  const items = [
    { value: '', label: 'Org Configs' },
    { divider: true },
    ...siteNames.map((name) => ({ value: name, label: name })),
  ];
  return html`
    <div class="config-header">
      <h2 class="config-title">Config</h2>
      <div class="config-scope-picker">
        <nx-picker variant="field" size="m" .items=${items} .value=${site ?? ''}
          @change=${onScopeChange}></nx-picker>
      </div>
    </div>`;
}

export function renderLoadStatus({ status, httpStatus, scope }) {
  if (status === 'loading') {
    return html`
      <div class="config-loading" role="status">
        <span class="nx-loading-spinner" aria-hidden="true"></span>
        <span>${SHELL.loading(scope)}</span>
      </div>`;
  }
  if (status === 'no-access') return renderAlert(SHELL.noAccessTitle, SHELL.noAccess);
  if (status === 'error') return renderAlert(SHELL.loadFailed, failureDetail({ httpStatus }));
  return nothing;
}

export function renderTabs(tabs, { tab, section }, { onPrimaryChange, onSectionChange }) {
  return html`
    <div class="config-tabs">
      <nx-segmented-btn
        class="config-tabs-primary"
        size="m"
        label="Configuration area"
        .items=${tabs.map((t) => ({ value: t.id, label: t.label }))}
        .value=${tab.id}
        @change=${onPrimaryChange}
      ></nx-segmented-btn>
      ${tab.sections.length > 1 ? html`
        <nx-segmented-btn
          class="config-tabs-secondary"
          label=${tab.label}
          .items=${tab.sections.map((s) => ({ value: s.id, label: s.label, icon: iconUrl(s.icon) }))}
          .value=${section.id}
          @change=${onSectionChange}
        ></nx-segmented-btn>` : nothing}
    </div>`;
}

const OPEN_ICON = '/img/icons/s2-icon-openin-20-n.svg#icon';

// What the section is for, kept apart from the editor like the permissions note.
export function renderIntro(panel, { docs, inheritance, setupUrl, readOnly, notes = nothing }) {
  const { setup } = panel;
  return html`
    <div class="config-info" role="note">
      <p>${panel.description} ${inheritance}</p>
      ${setupUrl ? html`
        <p>${setup.rerun.text} <a href=${setupUrl} target="_blank" rel="noopener">${setup.rerun.action}</a></p>`
    : nothing}
      ${notes}
      ${readOnly ? html`<p>${SHELL.readOnly}</p>` : nothing}
      <a class="nx-action-btn nx-btn-sm" href=${docs} target="_blank" rel="noopener">
        <svg viewBox="0 0 20 20" aria-hidden="true"><use href=${OPEN_ICON}></use></svg>
        <span>${SHELL.learnMore}</span>
      </a>
    </div>`;
}

// A setup step that replaces the panel until it's done (e.g. the ew-setup app).
export function renderSetup(setup, { setupUrl, onCheck }) {
  return renderCallout(setup.text, html`
    <a class="nx-form-btn-primary" href=${setupUrl} target="_blank" rel="noopener">${setup.action}</a>
    <button type="button" class="nx-form-btn-secondary" @click=${onCheck}>Check again</button>`);
}

export function renderParts(parts, part, onChange) {
  return html`
    <div class="config-parts">
      <nx-picker variant="field" size="m" aria-label="Show"
        .items=${parts.map((p) => ({ value: p.id, label: p.name }))}
        .value=${part.id}
        @change=${onChange}></nx-picker>
    </div>`;
}

export function renderSaveBar({ dirty, label, invalid }, { busy, onDiscard, onSave }) {
  if (!dirty) return nothing;
  return html`
    <div class="config-savebar" role="region" aria-label=${SHELL.unsaved}>
      <span class="config-savebar-count">${label}</span>
      <button type="button" class="nx-form-btn-secondary" ?disabled=${busy}
        @click=${onDiscard}>Discard</button>
      <button type="button" class="nx-form-btn-primary" ?disabled=${busy || invalid}
        @click=${onSave}>${busy ? SHELL.saving : 'Save'}</button>
    </div>`;
}

export function renderConfirm(label, onResolve) {
  return html`
    <nx-dialog title=${SHELL.discardTitle} @close=${() => onResolve(false)}>
      <p>${SHELL.discardText(label)}</p>
      <button type="button" slot="actions" class="nx-form-btn-secondary" autofocus
        @click=${() => onResolve(false)}>Keep editing</button>
      <button type="button" slot="actions" class="nx-form-btn-primary"
        @click=${() => onResolve(true)}>Discard changes</button>
    </nx-dialog>`;
}

export function renderImportButton(dirty, onOpen) {
  return html`
    <button type="button" class="nx-form-btn-secondary" ?disabled=${dirty}
      title=${dirty ? SHELL.saveFirst : ''}
      @click=${onOpen}>Import blocks</button>`;
}

// Defined in blocks-import/dialog.js, loaded on demand.
export function renderImportDialog({
  org, site, listPath, existing, onClose, onDone,
}) {
  return html`
    <da-config-blocks-import .org=${org} .site=${site} .listPath=${listPath}
      .existing=${existing} @import-close=${onClose} @import-done=${onDone}></da-config-blocks-import>`;
}
