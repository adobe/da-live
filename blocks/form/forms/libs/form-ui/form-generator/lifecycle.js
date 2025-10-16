/**
 * Lifecycle
 * - generateForm(self): initial container/header/body/footer build
 * - rebuildBody(self): rebuilds body inline preserving order; remaps/validates
 */
import { UI_CLASS as CLASS } from '../constants.js';
import { mapFieldsToGroups, ensureGroupRegistry } from './mapping.js';
import { render } from 'da-lit';
import { formShellTemplate } from '../templates/form.js';

export function generateForm(self) {
  const mount = document.createElement('div');
  render(formShellTemplate({ title: self.schema.title || 'Form' }), mount);
  const container = mount.firstElementChild;
  const body = container.querySelector(`.${CLASS.body}`);
  // Compute sticky header height for scroll offset
  try {
    const header = container.querySelector('.form-ui-header');
    const extra = 32; // add a bit more room so titles are not hidden
    self._headerOffset = header ? (header.offsetHeight + extra) : extra;
  } catch {}

  // Build content from the FormUiModel tree to keep UI aligned with navigation
  const modelRoot = self.formUiModel;
  if (modelRoot) {
    self.groupElements = self.groupBuilder.buildFormUiModel(
      body,
      modelRoot,
      [],
      new Map(),
    );
    self.ensureGroupRegistry();
  }

  self.container = container;
  self.highlightOverlay.attach(self.container);

  requestAnimationFrame(() => {
    // Recompute header offset after layout settles
    try {
      const header = container.querySelector('.form-ui-header');
      const extra = 32;
      self._headerOffset = header ? (header.offsetHeight + extra) : (self._headerOffset || extra);
    } catch {}
    mapFieldsToGroups(self);
    ensureGroupRegistry(self);
    self.validation.validateAllFields();
  });

  return container;
}

export function rebuildBody(self) {
  if (!self.container) return;
  const body = self.container.querySelector(`.${CLASS.body}`);
  if (!body) return;
  const previousScrollTop = body.scrollTop;
  // Preserve sticky content breadcrumb across rebuilds
  const breadcrumbEl = body.querySelector('.form-content-breadcrumb');
  // Detach breadcrumb before clearing
  if (breadcrumbEl && breadcrumbEl.parentNode === body) {
    body.removeChild(breadcrumbEl);
  }
  self.groupElements.clear();
  self.fieldSchemas.clear();
  self.fieldElements.clear();
  self.fieldToGroup.clear();
  body.innerHTML = '';
  // Re-attach breadcrumb at the top
  if (breadcrumbEl) {
    body.appendChild(breadcrumbEl);
  }
  const modelRoot = self.formUiModel;
  if (modelRoot) {
    self.groupElements = self.groupBuilder.buildFormUiModel(
      body,
      modelRoot,
      [],
      new Map(),
    );
  }
  self.highlightOverlay.attach(self.container);
  requestAnimationFrame(() => {
    body.scrollTop = previousScrollTop;
    mapFieldsToGroups(self);
    ensureGroupRegistry(self);
    // Restore existing data into fields after DOM rebuild
    try { self.loadData(self.data); } catch {}
    if (self.navigationTree) {
      self.navigation.generateNavigationTree();
    }
    self.validation.validateAllFields();
  });
}


