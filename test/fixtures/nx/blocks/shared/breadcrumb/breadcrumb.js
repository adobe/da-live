class NxBreadcrumb extends HTMLElement {}

if (!customElements.get('nx-breadcrumb')) {
  customElements.define('nx-breadcrumb', NxBreadcrumb);
}
