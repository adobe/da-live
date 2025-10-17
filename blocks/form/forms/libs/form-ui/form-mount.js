/**
 * mountFormUI - vanilla API to mount the form UI into a DOM node
 *
 * Usage:
 * const api = mountFormUI({
 *   mount,
 *   schema,
 *   data,
 *   onChange,
 *   onRemove,
 *   ui: {}
 * });
 * api.updateData(next); api.destroy();
 */

import FormGenerator from './form-generator.js';
import FormSidebar from './features/sidebar.js';
import FormBreadcrumb from './features/breadcrumb.js';
import FormSearch from './features/search.js';

// ---- local helpers: readability only, no behavior change ----
function hasUserData(data) {
  if (data == null) return false;
  if (typeof data !== 'object') return !!data;
  try { return Object.keys(data).length > 0; } catch { return false; }
}

function createWrapperAndHost(mount, ui) {
  if (!mount) throw new Error('mountFormUI: mount element is required');
  const controls = ui || {};

  const wrapper = document.createElement('div');
  wrapper.className = 'form-container-wrapper';

  const host = document.createElement('div');
  host.className = 'form-ui-host';
  wrapper.appendChild(host);

  return { controls, wrapper, host };
}

function instantiateGenerator(context, schema, controls) {
  let generator;
  let formEl;
  try {
    generator = new FormGenerator(context, schema, {});
    formEl = generator.generateForm();
  } catch (e) {
    console.error('[mountFormUI] failed to create/generate form:', e);
    throw e;
  }
  return { generator, formEl };
}

function attachToDom(mount, wrapper, host, formEl) {
  host.appendChild(formEl);
  mount.appendChild(wrapper);
}

function setupBreadcrumbFeature(generator, formEl) {
  const breadcrumbFeature = new FormBreadcrumb(generator);
  const contentBreadcrumb = breadcrumbFeature.init(formEl);
  generator.breadcrumb = breadcrumbFeature;
  return { breadcrumbFeature, contentBreadcrumb };
}

function setupSidebar(wrapper) {
  const sidebar = new FormSidebar();
  const sideEl = sidebar.createElement();
  wrapper.appendChild(sideEl);
  try {
    const toggle = sideEl.querySelector('.nav-activatable-toggle');
    if (toggle) {
      toggle.addEventListener('change', () => {
        wrapper.classList.toggle('hide-activatable-mode', !!toggle.checked);
        try {
          wrapper.dispatchEvent(new CustomEvent('form-ui:hideOptionalChanged', { detail: { hideOptional: !!toggle.checked } }));
        } catch { }
      });
    }
  } catch { }
  return { sidebar, sideEl };
}

function setupNavigationTree(generator, sideEl) {
  const navigationTree = sideEl.querySelector('.form-navigation-tree');
  try {
    navigationTree.classList.remove('hide-tree-connectors');
  } catch { }
  generator.navigationTree = navigationTree;
  return navigationTree;
}

function scheduleInitialRender(generator, breadcrumbFeature) {
  requestAnimationFrame(() => {
    generator.navigation.generateNavigationTree();
    breadcrumbFeature.update(generator.activeGroupId);
  });
}

function loadInitialData(generator, data) {
  if (!data) return;
  generator.loadData(data);
  try { window.scrollTo({ top: 0 }); } catch { }
  generator.rebuildBody();
  requestAnimationFrame(() => { try { window.scrollTo({ top: 0 }); } catch { } });
}

function wireNavigationClicks(sidebar, generator) {
  sidebar.onNavigationClickHandler((e) => {
    const navItem = e.target.closest('.form-ui-nav-item');
    if (!navItem) return;
    const { groupId } = navItem.dataset;
    if (groupId) generator.navigation.navigateToGroup(groupId);
  });
}

/**
 * Mount the Form UI into a DOM node and return an imperative API.
 *
 * @param {object} context - Shared app context with services and configuration
 * @param {object} options
 * @param {HTMLElement} options.mount - Host element to mount into (required)
 * @param {object} options.schema - JSON Schema describing the form
 * @param {object} [options.data] - Initial data to hydrate the form
 * @param {(nextData: object) => void} [options.onChange] - Callback invoked on any data change
 * @param {{}} [options.ui]
 * @returns {{
 *   updateData(next: object): void,
 *   updateSchema(nextSchema: object): void,
 *   navigateTo(groupId: string): void,
 *   getData(): object,
 *   destroy(): void
 * }}
 */
export default function mountFormUI(context, { mount, schema, data, onChange, ui } = {}) {
  const { controls, wrapper, host } = createWrapperAndHost(mount, ui);
  let { generator, formEl } = instantiateGenerator(context, schema, controls);
  attachToDom(mount, wrapper, host, formEl);
  // Breadcrumb moved into header
  const { breadcrumbFeature, contentBreadcrumb } = setupBreadcrumbFeature(generator, formEl);

  // Sidebar
  const { sidebar, sideEl } = setupSidebar(wrapper);
  // Feature flag: enable/disable navigation toggle from config
  const isToggleEnabled = !!(context?.config?.ui?.feature?.toggleOptionalGroups?.enabled);
  const defaultToggleOn = !!(context?.config?.ui?.feature?.toggleOptionalGroups?.defaultOn);
  // Feature flag: enable/disable search + pin
  const isSearchEnabled = !!(context?.config?.ui?.feature?.search?.enabled);
  // Runtime state for hide optional groups (data-driven). If the toggle feature is disabled,
  // hideOptionalMode must be false so search includes all groups.
  let hideOptionalMode = !!(isToggleEnabled && defaultToggleOn);
  try {
    const controlsEl = sideEl.querySelector('.form-side-panel-controls');
    if (controlsEl) {
      if (!isToggleEnabled) {
        controlsEl.style.display = 'none';
      } else if (!hasUserData(data)) {
        // Toggle enabled but hide by default for brand-new forms without user data
        controlsEl.style.display = 'none';
      } else {
        controlsEl.style.display = '';
        // Apply default-on setting once shown
        try {
          const toggle = controlsEl.querySelector('.nav-activatable-toggle');
          if (toggle) {
            toggle.checked = !!defaultToggleOn;
            wrapper.classList.toggle('hide-activatable-mode', !!toggle.checked);
            hideOptionalMode = !!toggle.checked;
          }
        } catch { }
      }
      // Toggle search button visibility based on feature flag
      try {
        const searchBtn = controlsEl.querySelector('.form-side-panel-search');
        if (searchBtn) searchBtn.style.display = isSearchEnabled ? '' : 'none';
      } catch { }
    }
  } catch { }
  wireNavigationClicks(sidebar, generator);

  // Wire search click from sidebar (guarded by feature flag)
  let searchFeature = null;
  sidebar.onSearchClickHandler(() => {
    if (!isSearchEnabled) return;
    try { searchFeature && searchFeature.open('search'); } catch { }
  });

  // Connect navigation tree to form generator (use rAF instead of setTimeout)
  const navigationTree = setupNavigationTree(generator, sideEl);
  // Expose content breadcrumb element for navigation/scroll sync
  generator.contentBreadcrumbEl = contentBreadcrumb;
  // First render
  scheduleInitialRender(generator, breadcrumbFeature);

  // Initial data
  loadInitialData(generator, data);
  // No mode badge to initialize

  // Listen for changes and bubble up
  generator.onChange((next) => {
    onChange(next);
  });

  // Initialize search feature (isolated) only if enabled
  if (isSearchEnabled) {
    searchFeature = new FormSearch(context, generator);
    searchFeature.init();
    // Initial sync using state
    try { searchFeature.setHideOptional?.(hideOptionalMode); } catch { }
    // Listen to app-level state event instead of querying elements
    try {
      wrapper.addEventListener('form-ui:hideOptionalChanged', (e) => {
        hideOptionalMode = !!(e?.detail?.hideOptional);
        try { searchFeature.setHideOptional?.(hideOptionalMode); } catch { }
      });
    } catch { }
  }

  // expose API continues below
  /** Replace current form data with `next` and re-render inputs. */
  function updateData(next) {
    generator.loadData(next || {});
    try {
      const controlsEl = sideEl.querySelector('.form-side-panel-controls');
      if (controlsEl) {
        if (!isToggleEnabled) controlsEl.style.display = 'none';
        else {
          const shouldShow = hasUserData(next);
          controlsEl.style.display = shouldShow ? '' : 'none';
          if (shouldShow) {
            const toggle = controlsEl.querySelector('.nav-activatable-toggle');
            if (toggle && toggle.getAttribute('data-init') !== '1') {
              toggle.checked = !!defaultToggleOn;
              wrapper.classList.toggle('hide-activatable-mode', !!toggle.checked);
              toggle.setAttribute('data-init', '1');
            }
          }
        }
      }
    } catch { }
    // Propagate hide-optional state to search if available (state-driven)
    try { if (searchFeature) searchFeature.setHideOptional?.(hideOptionalMode); } catch { }
  }
  /** Return whether current form has validation errors. */
  function hasValidationErrors() {
    try {
      return (generator.fieldErrors?.size || 0) + (generator.groupErrors?.size || 0) > 0;
    } catch { return false; }
  }
  /** Get the current total validation error count. */
  function getValidationErrorCount() {
    try { return (generator.fieldErrors?.size || 0) + (generator.groupErrors?.size || 0); } catch { return 0; }
  }
  /**
   * Replace the current schema and rebuild the form while preserving current data.
   * Useful for hot-reloading or switching between schemas.
   * @param {object} nextSchema
   */
  function updateSchema(nextSchema) {
    const dataSnapshot = generator.data;
    generator.destroy();
    const newGen = new FormGenerator(context, nextSchema, {});
    const newForm = newGen.generateForm();
    // Replace current form and update references
    if (formEl.parentNode === host) {
      host.replaceChild(newForm, formEl);
    } else {
      // Fallback: clear and append if structure changed unexpectedly
      host.innerHTML = '';
      host.appendChild(newForm);
    }
    formEl = newForm;
    generator = newGen;

    const h = newForm.querySelector('.form-ui-header');
    if (h) h.insertAdjacentElement('afterend', sideEl);
    generator.navigationTree = navigationTree;
    requestAnimationFrame(() => generator.navigation.generateNavigationTree());
    generator.onChange((next) => typeof onChange === 'function' && onChange(next));
    generator.loadData(dataSnapshot);

    // Recompute toggle visibility based on preserved data
    try {
      const controlsEl = sideEl.querySelector('.form-side-panel-controls');
      if (controlsEl) {
        if (!isToggleEnabled) controlsEl.style.display = 'none';
        else {
          const shouldShow = hasUserData(dataSnapshot);
          controlsEl.style.display = shouldShow ? '' : 'none';
          if (shouldShow) {
            const toggle = controlsEl.querySelector('.nav-activatable-toggle');
            if (toggle && toggle.getAttribute('data-init') !== '1') {
              toggle.checked = !!defaultToggleOn;
              wrapper.classList.toggle('hide-activatable-mode', !!toggle.checked);
              toggle.setAttribute('data-init', '1');
            }
          }
          // Update search button visibility according to feature flag
          try {
            const searchBtn = controlsEl.querySelector('.form-side-panel-search');
            if (searchBtn) searchBtn.style.display = isSearchEnabled ? '' : 'none';
          } catch { }
        }
      }
    } catch { }
  }
  /** Programmatically navigate to a group by its DOM id. */
  function navigateTo(groupId) { generator.navigation.navigateToGroup(groupId); }
  /** Return the latest form data snapshot. */
  function getData() { return generator.data; }
  /** Tear down all features and remove mounted DOM nodes. */
  function destroy() {
    // listeners were not added due to disabled auto-float
    generator.destroy();
    wrapper.remove();
    sidebar.destroy();
    breadcrumbFeature.destroy();
    try { searchFeature && searchFeature.destroy(); } catch { }
  }

  return {
    updateData,
    updateSchema,
    navigateTo,
    getData,
    hasValidationErrors,
    getValidationErrorCount,
    destroy,
  };
}
