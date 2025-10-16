/**
 * Navigation feature
 * Builds the sidebar tree, maintains active/hover states and scroll syncing,
 * and delegates clicks to navigate and activate optional groups.
 */
import { getDeepActiveElement } from '../utils/dom-utils.js';

import { UI_CLASS as CLASS } from '../constants.js';
import { render } from 'da-lit';
import { breadcrumbItemTemplate, breadcrumbSeparatorTemplate } from '../templates/nav.js';
import { createTreeClickHandler } from './navigation/handlers/click.js';
import { enableHoverSync } from './navigation/sync/hover.js';
import { enableScrollSync } from './navigation/sync/scrollspy.js';
import { buildFlatNavFormUiModel } from './navigation/builders/model-to-flat.js';
import { buildNestedList } from './navigation/builders/nested-list.js';
import { attachDragHandlers as attachDragHandlersExternal } from './navigation/handlers/drag.js';
import { attachContentClick } from './navigation/handlers/content-click.js';

/**
 * FormNavigation
 *
 * Builds and maintains the sidebar navigation for a generated form.
 *
 * High-level responsibilities:
 * - Generate a flat list of navigation items from the active JSON Schema structure
 * - Convert that flat list into a nested UL/LI tree used in the sidebar
 * - Keep nav selection in sync with the content scroll position (scrollspy)
 * - Provide hover and click interactions to highlight and navigate to groups
 * - Support arrays-of-objects with per-item entries and drag-and-drop reordering
 * - Emit and maintain an "active group" concept across content and navigation
 *
 * Usage:
 * - Instantiated by `FormGenerator` and wired with the same context and model
 * - Call `generateNavigationTree()` after the form body is (re)built
 * - Call `destroy()` on teardown to remove event listeners
 */
export default class FormNavigation {
  /**
   * Create a new FormNavigation instance
   * @param {object} context - Shared app context (services, config, DOM refs)
   * @param {import('../form-generator.js').default} formGenerator - Owner generator
   */
  constructor(context, formGenerator) {
    this.context = context;
    this.formGenerator = formGenerator;
    // Single delegated handler bound once to avoid duplicate listeners
    this.onTreeClick = this.onTreeClick.bind(this);
    this._dragData = null; // { arrayPath, fromIndex }

  }

  /**
   * Given a schema path for a section/object, return the first descendant path
   * that represents a concrete group (has primitive fields) to navigate to.
   * Falls back to the section itself if a primitive is directly under it.
   *
   * @param {string} sectionPath - Dotted schema path for the section/object
   * @returns {string|null} - Best descendant group path or null if none
   */
  resolveFirstDescendantGroupPath(sectionPath) {
    const sectionSchema = this.formGenerator.model.resolveSchemaByPath(sectionPath);
    const norm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(sectionSchema) || sectionSchema || {});
    if (!norm || !norm.properties) return null;
    // Prefer direct children with primitives
    for (const [key, child] of Object.entries(norm.properties)) {
      const eff = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(child) || child || {});
      if (!eff) continue;
      const childPath = sectionPath ? `${sectionPath}.${key}` : key;
      if (eff.type === 'object' && eff.properties) {
        if (this.formGenerator.hasPrimitiveFields(eff)) return childPath;
        // Otherwise recurse
        const deeper = this.resolveFirstDescendantGroupPath(childPath);
        if (deeper) return deeper;
      } else if (eff.type === 'array') {
        // Skip arrays here; user will add items explicitly
        continue;
      } else {
        // Primitive under section: its parent group is the section itself
        return sectionPath;
      }
    }
    return null;
  }

  /**
   * Map fields to their groups after the group structure is built
   *
   * Build a mapping from field paths to their owning group element IDs.
   * Must be called after the DOM groups/fields are rendered.
   */
  mapFieldsToGroups() {
    this.formGenerator.container.querySelectorAll(`.${CLASS.field}[data-field-path]`).forEach((field) => {
      const { fieldPath } = field.dataset;
      const groupEl = field.closest(`.${CLASS.group}`);
      if (fieldPath && groupEl && groupEl.id) {
        this.formGenerator.fieldToGroup.set(fieldPath, groupEl.id);
      }
    });
  }

  /**
   * Scroll to a group by path index
   *
   * Scroll the content area to the group whose path length matches `pathIndex+1`.
   * Primarily used by index-based navigation affordances.
   * @param {number} pathIndex - Zero-based depth index into the group path
   */
  scrollToGroup(pathIndex) {
    // Find group by path index
    for (const [, groupInfo] of this.formGenerator.groupElements) {
      if (groupInfo.path.length === pathIndex + 1) {
        // Use center positioning with negative scroll margin
        groupInfo.element.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });

        // Briefly highlight the target group
        groupInfo.element.classList.add('form-ui-group-highlighted');
        setTimeout(() => {
          groupInfo.element.classList.remove('form-ui-group-highlighted');
        }, 2000);

        break;
      }
    }
  }

  /**
   * Mark a given group as active across content and sidebar and update
   * the schema-path-driven breadcrumb.
   * @param {string} activeGroupId - DOM id of the group to activate
   */
  updateActiveGroup(activeGroupId) {
    // Remove previous active states
    this.formGenerator.groupElements.forEach((groupInfo) => {
      groupInfo.element.classList.remove('form-ui-group-active');
    });

    // Add active state to current group
    const activeGroup = this.formGenerator.groupElements.get(activeGroupId);
    if (activeGroup) {
      activeGroup.element.classList.add('form-ui-group-active');

      // Persist currently active group so we can restore after hover
      this.formGenerator.activeGroupId = activeGroupId;
      // Persist active schema path in state (schema-driven)
      const schemaPath = activeGroup.schemaPath
        || activeGroup.element?.dataset?.schemaPath
        || '';
      this.formGenerator.activeSchemaPath = schemaPath;

      // Update navigation tree active state
      this.updateNavigationActiveState(activeGroupId);
      // Update content breadcrumb to reflect the active group path
      this.updateContentBreadcrumb(activeGroupId);
    }
  }

  /**
   * Update active state and visual indicator inside the navigation tree.
   * @param {string} activeGroupId - DOM id of the group to reflect as active
   */
  updateNavigationActiveState(activeGroupId) {
    if (!this.formGenerator.navigationTree) return;

    // Helper: consider an element visible only if it participates in layout
    const isVisible = (el) => !!el && el.getClientRects && el.getClientRects().length > 0;

    // First, determine the next candidate nav item. If it's missing or hidden,
    // keep current highlight instead of clearing it to avoid flicker.
    let nextActiveNavItem = null;
    try {
      const nav = this.formGenerator.navigationTree;
      nextActiveNavItem = nav.querySelector(`[data-group-id="${activeGroupId}"] .${CLASS.navItemContent}`);
      if (!isVisible(nextActiveNavItem)) {
        nextActiveNavItem = null;
      }
      if (!nextActiveNavItem) {
        const groupInfo = this.formGenerator.groupElements.get(activeGroupId);
        const schemaPath = groupInfo?.schemaPath || groupInfo?.element?.dataset?.schemaPath || '';
        if (schemaPath) {
          const fallback = nav.querySelector(`.${CLASS.navItem}.${CLASS.navItemAdd}[data-path="${schemaPath}"] .${CLASS.navItemContent}`);
          if (isVisible(fallback)) nextActiveNavItem = fallback;
        }
      }

      // Early-exit if current active indicator already matches the candidate
      if (nextActiveNavItem) {
        const currentlyActive = nav.querySelector(`.${CLASS.navItemContent}.active`);
        const indicator = nav.querySelector(`.${CLASS.navIndicator}`);
        if (currentlyActive === nextActiveNavItem && indicator) {
          const treeRect0 = nav.getBoundingClientRect();
          const itemRect0 = nextActiveNavItem.getBoundingClientRect();
          const targetTop0 = itemRect0.top - treeRect0.top + nav.scrollTop;
          const targetH0 = itemRect0.height;
          const curTop = parseFloat(indicator.style.top || 'NaN');
          const curH = parseFloat(indicator.style.height || 'NaN');
          const sameTop = Number.isFinite(curTop) && Math.abs(curTop - targetTop0) < 0.5;
          const sameH = Number.isFinite(curH) && Math.abs(curH - targetH0) < 0.5;
          if (sameTop && sameH) return;
        }
      }
    } catch { }

    // If we don't have a visible candidate, retain existing highlight and exit
    if (!nextActiveNavItem) return;

    // Remove previous active states
    this.formGenerator.navigationTree.querySelectorAll(`.${CLASS.navItemContent}.active`)
      .forEach((item) => item.classList.remove('active'));
    // Clear previous active/ancestor path highlighting on the UL/LI tree
    this.formGenerator.navigationTree
      .querySelectorAll('.form-nav-tree li.tree-active, .form-nav-tree li.tree-ancestor')
      .forEach((li) => { li.classList.remove('tree-active'); li.classList.remove('tree-ancestor'); });

    // Add active state to current item (we have a visible candidate)
    const activeNavItem = nextActiveNavItem;
    if (activeNavItem) {
      activeNavItem.classList.add('active');

      // Mark LI and its ancestors for path highlighting (affects dotted connectors via CSS vars)
      const activeLi = activeNavItem.closest('li');
      if (activeLi) {
        activeLi.classList.add('tree-active');
        let parentLi = activeLi.parentElement ? activeLi.parentElement.closest('li') : null;
        while (parentLi) {
          parentLi.classList.add('tree-ancestor');
          parentLi = parentLi.parentElement ? parentLi.parentElement.closest('li') : null;
        }
      }

      // Update or create the active indicator element to match active item height/position
      let indicator = this.formGenerator.navigationTree.querySelector(`.${CLASS.navIndicator}`);
      if (!indicator) {
        indicator = document.createElement('div');
        indicator.className = CLASS.navIndicator;
        // Hide initially to avoid a flash at 0, then reveal after positioning
        indicator.style.visibility = 'hidden';
        indicator.style.transition = 'none';
        this.formGenerator.navigationTree.appendChild(indicator);
      } else {
        // Temporarily disable transition to avoid visible jump during reposition
        indicator.style.transition = 'none';
      }

      // Compute position relative to the scroll container to keep indicator accurate
      const treeRect = this.formGenerator.navigationTree.getBoundingClientRect();
      const itemRect = activeNavItem.getBoundingClientRect();
      const top = itemRect.top - treeRect.top + this.formGenerator.navigationTree.scrollTop;
      indicator.style.top = `${top}px`;
      indicator.style.height = `${itemRect.height}px`;
      // Reveal and re-enable transition on next frame for smooth future moves
      requestAnimationFrame(() => {
        indicator.style.visibility = '';
        indicator.style.transition = '';
      });
    }
  }

  /**
   * Programmatically navigate to a group: highlight, scroll to, and activate it.
   * @param {string} groupId - DOM id of the target group
   */
  navigateToGroup(groupId) {
    const groupInfo = this.formGenerator.groupElements.get(groupId);
    if (groupInfo) {
      // Highlight the form group with blue overlay
      this.formGenerator.highlightFormGroup(groupId);

      // Scroll to the group
      // Mark a short programmatic-scroll window to defer breadcrumb updates
      try { this.formGenerator._programmaticScrollUntil = Date.now() + 1200; } catch { }
      this.formGenerator.scrollToFormGroup(groupId);

      // Update active state
      this.updateActiveGroup(groupId);
      // Immediately compute breadcrumb for the intended target (avoid wait for scrollspy)
      this.updateContentBreadcrumb(groupId);
    }
  }

  /**
   * Rebuild the breadcrumb displayed above the content based on the
   * currently active schema path. Breadcrumb items are clickable to
   * activate optional groups or navigate to array items.
   * @param {string} groupId - Current active group id (used for immediate updates)
   */
  updateContentBreadcrumb(groupId) {
    const bc = this.formGenerator?.contentBreadcrumbEl;
    if (!bc) return;
    // Schema/data-driven breadcrumb: use stored group schema path and schema titles
    // Use schema-driven active path and schema; no DOM fallbacks
    const schemaPath = this.formGenerator?.activeSchemaPath || '';
    const buildTitleForToken = (parentSchema, token, index) => {
      const m = token.match(/^([^\[]+)(?:\[(\d+)\])?$/);
      const key = m ? m[1] : token;
      const idx = m && m[2] ? Number(m[2]) : null;
      const norm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(parentSchema) || parentSchema || {});
      const propSchema = norm?.properties?.[key];
      const propNorm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(propSchema) || propSchema || {});
      if (propNorm?.type === 'array') {
        const title = this.formGenerator.getSchemaTitle(propNorm, key);
        const labels = [];
        if (title) labels.push(title);
        if (idx != null) labels.push(`${title} #${(idx || 0) + 1}`);
        return { label: labels, nextSchema: this.formGenerator.derefNode(propNorm.items) || propNorm.items };
      }
      return { label: [this.formGenerator.getSchemaTitle(propNorm || {}, key)], nextSchema: propNorm };
    };
    // Build clickable crumbs
    bc.innerHTML = '';
    const separator = () => {
      const mount = document.createElement('span');
      render(breadcrumbSeparatorTemplate(), mount);
      return mount.firstElementChild;
    };
    const tokens = String(schemaPath)
      .split('.')
      .filter((t) => t && t !== 'root');
    let curSchema = this.formGenerator.schema;
    let accPath = '';
    tokens.forEach((tok, i) => {
      const m = tok.match(/^([^\[]+)(?:\[(\d+)\])?$/);
      const key = m ? m[1] : tok;
      const idx = m && m[2] ? Number(m[2]) : null;
      accPath = accPath ? `${accPath}.${key}` : key;
      const { label, nextSchema } = buildTitleForToken(curSchema, tok, idx);

      const addCrumb = (text, dataset) => {
        if (!text) return;
        const mount = document.createElement('span');
        render(breadcrumbItemTemplate({
          text,
          path: dataset?.path ?? null,
          groupId: dataset?.groupId ?? null,
          onClick: (e) => {
            e.preventDefault(); e.stopPropagation();
            const path = dataset?.path;
            const gid = dataset?.groupId;
            if (gid) {
              this.navigateToGroup(gid);
              return;
            }
            if (path) {
              const target = this.resolveFirstDescendantGroupPath(path) || path;
              const gid2 = this.formGenerator.pathToGroupId(target);
              this.navigateToGroup(gid2);
            }
          },
        }), mount);
        bc.appendChild(mount.firstElementChild);
      };

      if (Array.isArray(label) && label.length > 0) {
        addCrumb(label[0], { path: accPath });
        if (idx != null && label[1]) {
          bc.appendChild(separator());
          const itemGroupId = this.formGenerator.arrayItemId(accPath, idx);
          addCrumb(label[1], { groupId: itemGroupId });
        }
      } else if (Array.isArray(label)) {
        // nothing to render
      } else {
        addCrumb(label, { path: accPath });
      }

      if (i < tokens.length - 1) bc.appendChild(separator());

      const curNorm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(curSchema) || curSchema || {});
      let next = curNorm?.properties?.[key];
      const nextNorm = this.formGenerator.normalizeSchema(this.formGenerator.derefNode(next) || next || {});
      curSchema = nextNorm?.type === 'array' ? (this.formGenerator.derefNode(nextNorm.items) || nextNorm.items) : nextNorm || nextSchema;
      if (idx != null) accPath = `${accPath}[${idx}]`;
    });
  }

  /**
   * Build and render the full navigation tree into the sidebar container.
   * Applies event handlers and restores scroll position.
   */
  generateNavigationTree() {
    if (!this.formGenerator.navigationTree) return;
    const treeEl = this.formGenerator.navigationTree;

    // Toggle sticky-parents behavior from config (off by default)
    const enableSticky = !!(this.context?.config?.navigation?.stickyParents);
    treeEl.classList.toggle('sticky-parents', enableSticky);

    const prevScrollTop = treeEl.scrollTop;

    this.formGenerator.navigationTree.innerHTML = '';

    const flatItems = buildFlatNavFormUiModel(this.formGenerator, this.formGenerator.formUiModel, 0);
    const nested = buildNestedList(flatItems);
    this.formGenerator.navigationTree.appendChild(nested);

    this.setupNavigationHandlers();
    this.attachDragHandlers();
    // Externalized sync modules (hover opt-in via param)
    try { this._hoverCleanup?.(); } catch { }
    this._hoverCleanup = enableHoverSync(this, false);
    try { this._scrollCleanup?.(); } catch { }
    // Defer enabling scroll sync until after scroll restore
    this._scrollCleanup = null;

    this.formGenerator.validation.refreshNavigationErrorMarkers();
    try { this._contentClickCleanup?.(); } catch { }
    this._contentClickCleanup = attachContentClick(this);

    // Restore scroll, then re-assert active item to keep indicator in place without jumping
    requestAnimationFrame(() => {
      const maxTop = Math.max(0, treeEl.scrollHeight - treeEl.clientHeight);
      treeEl.scrollTop = Math.min(prevScrollTop, maxTop);
      // Defer one more frame to ensure scrollTop is applied before measuring
      requestAnimationFrame(() => {
        try {
          const currentActiveId = this.formGenerator?.activeGroupId;
          if (currentActiveId) {
            // Temporarily hide indicator during reposition to avoid a visible jump
            const indicator = this.formGenerator.navigationTree.querySelector(`.${CLASS.navIndicator}`);
            if (indicator) {
              indicator.style.visibility = 'hidden';
              indicator.style.transition = 'none';
            }
            this.updateNavigationActiveState(currentActiveId);
            requestAnimationFrame(() => {
              if (indicator) {
                indicator.style.visibility = '';
                indicator.style.transition = '';
              }
            });
          }
        } catch { }
        // Now enable scroll sync so subsequent user scrolls update active without causing a jump
        try { this._scrollCleanup?.(); } catch { }
        this._scrollCleanup = enableScrollSync(this);
      });
    });
  }

  /**
   * Attach drag handlers to freshly rendered draggable nav items.
   */
  attachDragHandlers() {
    try { this._dragCleanup?.(); } catch { }
    this._dragCleanup = attachDragHandlersExternal(this);
  }


  /**
   * Determine which element is the scroll container: the form body (preferred)
   * or the window/document as a fallback.
   * @returns {{el:HTMLElement|null,type:'element'|'window'}}
   */
  getScrollSource() {
    const bodyEl = this.formGenerator?.container?.querySelector?.(`.${CLASS.body}`) || null;
    const isScrollable = (el) => !!el && el.scrollHeight > el.clientHeight;
    if (isScrollable(bodyEl)) return { el: bodyEl, type: 'element' };
    return { el: null, type: 'window' };
  }


  /**
   * Compute the currently visible group based on scroll position and update
   * navigation and breadcrumb accordingly. Skips updates during programmatic
   * scrolling windows to avoid flicker.
   */
  updateActiveGroupFromScroll() {
    if (!this.formGenerator?.groupElements || this.formGenerator.groupElements.size === 0) return;
    const until = this.formGenerator?._programmaticScrollUntil || 0;
    if (until && Date.now() <= until) return;
    const { el, type } = this.getScrollSource();

    let candidateId = null;
    let candidateMetric = -Infinity;

    const headerOffset = Math.max(0, this.formGenerator?._headerOffset || 0);
    const extraEarly = 100;

    if (type === 'element' && el) {
      const activeOffset = el.scrollTop + headerOffset + extraEarly;
      const getOffsetTopWithinContainer = (element, containerEl) => {
        let top = 0;
        let node = element;
        while (node && node !== containerEl) {
          top += node.offsetTop;
          node = node.offsetParent;
        }
        return top;
      };
      for (const [groupId, info] of this.formGenerator.groupElements) {
        const top = getOffsetTopWithinContainer(info.element, el);
        if (top <= activeOffset && top >= candidateMetric) {
          candidateMetric = top;
          candidateId = groupId;
        }
      }
    } else {
      const threshold = headerOffset + extraEarly;
      for (const [groupId, info] of this.formGenerator.groupElements) {
        const rect = info.element.getBoundingClientRect();
        const top = rect.top;
        if (top <= threshold && top >= candidateMetric) {
          candidateMetric = top;
          candidateId = groupId;
        }
      }
    }

    if (!candidateId) {
      const first = this.formGenerator.groupElements.keys().next();
      if (!first.done) candidateId = first.value;
    }
    if (!candidateId) return;
    this.updateNavigationActiveState(candidateId);
    this.formGenerator.activeGroupId = candidateId;
    const info = this.formGenerator.groupElements.get(candidateId);
    if (info) {
      const schemaPath = info.schemaPath || info.element?.dataset?.schemaPath || '';
      this.formGenerator.activeSchemaPath = schemaPath;
    }
    const until2 = this.formGenerator?._programmaticScrollUntil || 0;
    if (!until2 || Date.now() > until2) {
      this.updateContentBreadcrumb(candidateId);
    }
  }

  /**
   * Drag handler: begin dragging an array item entry in the nav tree.
   * Stores source array path and index.
   * @param {DragEvent} e
   */
  // Drag handlers moved to handlers/drag.js

  /**
   * Attach a single delegated click listener to the navigation tree container.
   * Safe to call multiple times; existing listener is removed first.
   */
  setupNavigationHandlers() {
    const tree = this.formGenerator.navigationTree;
    if (!tree) return;

    if (this._treeClickHandler) tree.removeEventListener('click', this._treeClickHandler);
    this._treeClickHandler = createTreeClickHandler(this);
    tree.addEventListener('click', this._treeClickHandler);
  }

  /**
   * Delegated click handler for navigation items. Handles two cases:
   * - "+ Add" controls for arrays (adds new item and navigates to it)
   * - Regular group navigation by group id (or schema path)
   * @param {MouseEvent} e
   */
  onTreeClick(e) {
    const navItem = e.target.closest(`.${CLASS.navItem}`);
    if (!navItem) return;
    e.preventDefault();
    e.stopPropagation();

    if (navItem.classList.contains(CLASS.navItemAdd) && navItem.dataset && navItem.dataset.arrayPath) {
      const arrayPath = navItem.dataset.arrayPath;
      this.formGenerator.commandAddArrayItem(arrayPath);
      requestAnimationFrame(() => {
        const arr = this.formGenerator.model.getNestedValue(this.formGenerator.data, arrayPath) || [];
        const newIndex = Math.max(0, arr.length - 1);
        const targetId = this.formGenerator.arrayItemId(arrayPath, newIndex);
        this.navigateToGroup(targetId);
        this.formGenerator.validation.validateAllFields();
      });
      return;
    }

    const { groupId } = navItem.dataset;
    if (!groupId) return;
    if (navItem.dataset && navItem.dataset.path) {
      const path = navItem.dataset.path;
      const target = this.resolveFirstDescendantGroupPath(path) || path;
      const gid = this.formGenerator.pathToGroupId(target);
      this.navigateToGroup(gid);
      return;
    }

    this.navigateToGroup(groupId);
  }

  /**
   * Highlight and mark active the group that contains the given input element.
   * Used by focus handlers from inputs to hint current editing context.
   * @param {HTMLElement} inputEl
   */
  highlightActiveGroup(inputEl) {
    const groupEl = inputEl.closest('.form-ui-group');
    if (groupEl && groupEl.id) {
      this.updateActiveGroup(groupEl.id);
    }
  }

  /**
   * Remove active and breadcrumb states across content and navigation.
   */
  clearActiveGroupHighlight() {
    this.formGenerator.groupElements.forEach((groupInfo) => {
      groupInfo.element.classList.remove('form-ui-group-active');
    });

    if (this.formGenerator.navigationTree) {
      this.formGenerator.navigationTree.querySelectorAll('.form-ui-nav-item-content.active')
        .forEach((item) => item.classList.remove('active'));
    }
    // Clear content breadcrumb text
    if (this.formGenerator?.contentBreadcrumbEl) {
      this.formGenerator.contentBreadcrumbEl.textContent = '';
    }
  }

  /**
   * Check if any focusable control is currently focused inside the active group.
   * @returns {boolean}
   */
  isAnyInputFocusedInActiveGroup() {
    if (!this.formGenerator.activeGroupId) return false;

    const activeGroup = this.formGenerator.groupElements.get(this.formGenerator.activeGroupId);
    if (!activeGroup) return false;

    const focusedElement = getDeepActiveElement();
    return !!focusedElement
      && activeGroup.element.contains(focusedElement)
      && (focusedElement.matches('input, select, textarea, button') || focusedElement.contentEditable === 'true');
  }
}

/**
 * Cleanup listeners and transient state for the navigation feature.
 */
FormNavigation.prototype.destroy = function destroy() {
  const tree = this.formGenerator?.navigationTree;
  if (tree && this._treeClickHandler) tree.removeEventListener('click', this._treeClickHandler);
  const bodyEl = this.formGenerator?.container?.querySelector?.('.form-ui-body') || this.formGenerator?.container;
  try { this._contentClickCleanup?.(); } catch { }
  try { this._hoverCleanup?.(); } catch { }
  try { this._scrollCleanup?.(); } catch { }
  this._hoverCleanup = null;
  this._scrollCleanup = null;
  this._contentClickCleanup = null;
  this._treeClickHandler = null;
};
