/** Stands in for nx2's `nx-picker`. Tests set `value` and fire `change` themselves. */
class MockNxPicker extends HTMLElement {}

if (!customElements.get('nx-picker')) {
  customElements.define('nx-picker', MockNxPicker);
}
