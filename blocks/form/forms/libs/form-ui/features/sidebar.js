/**
 * Form Sidebar Component (navigation-only)
 */
import { render } from 'da-lit';
import { sidebarTemplate } from '../templates/sidebar.js';

/**
 * FormSidebar
 *
 * Lightweight component that renders the left-side navigation panel used by
 * the Form UI. It creates a titled container and exposes the `.form-navigation-tree`
 * element for the navigation feature to populate and control.
 */
export default class FormSidebar {
  /** Create a new sidebar instance (DOM is created via createElement). */
  constructor() {
    this.element = null;
    this.navigationTree = null;
    // Navigation click handler
    this.onNavigationClick = null;
    // Search click handler
    this.onSearchClick = null;
  }

  /** Create and return the sidebar DOM element using a template. */
  createElement() {
    const mount = document.createElement('div');
    render(sidebarTemplate(), mount);
    this.element = mount.firstElementChild;
    this.navigationTree = this.element.querySelector('.form-navigation-tree');
    try {
      const btn = this.element.querySelector('.form-side-panel-search');
      if (btn) btn.addEventListener('click', () => { if (this.onSearchClick) this.onSearchClick(); });
    } catch { }
    this.setupEventHandlers();
    return this.element;
  }

  /** Attach internal event handlers for delegated navigation clicks. */
  setupEventHandlers() {
    if (!this.element) return;
    if (this.navigationTree) {
      this.navigationTree.addEventListener('click', (e) => {
        if (this.onNavigationClick) this.onNavigationClick(e);
      });
    }
  }

  /** Replace the entire navigation tree innerHTML with provided markup. */
  setNavigationContent(htmlContent) {
    if (this.navigationTree) {
      this.navigationTree.innerHTML = htmlContent;
    }
  }

  /** Return the navigation tree root element for external manipulation. */
  getNavigationTree() { return this.navigationTree; }

  /** Register a handler invoked when the navigation tree is clicked. */
  onNavigationClickHandler(handler) { this.onNavigationClick = handler; }

  /** Register a handler invoked when the search button is clicked. */
  onSearchClickHandler(handler) { this.onSearchClick = handler; }

  /** Remove the sidebar from DOM and clear references. */
  destroy() {
    if (this.element) {
      this.element.remove();
      this.element = null;
      this.navigationTree = null;
    }
  }
}
