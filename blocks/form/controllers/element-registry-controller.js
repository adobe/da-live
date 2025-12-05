/**
 * Lit controller that maintains a registry of form elements by pointer.
 * Provides O(1) lookup for elements, used by scroll and focus controllers.
 */
export default class ElementRegistryController {
  constructor(host) {
    this.host = host;
    this._registry = new Map();
    host.addController(this);
  }

  register(pointer, element) {
    if (pointer == null || !element) return;
    this._registry.set(pointer, element);
  }

  unregister(pointer) {
    if (pointer == null) return;
    this._registry.delete(pointer);
  }

  get(pointer) {
    return this._registry.get(pointer);
  }

  has(pointer) {
    return this._registry.has(pointer);
  }

  getPointers() {
    return Array.from(this._registry.keys());
  }

  getElements() {
    return Array.from(this._registry.values());
  }

  clear() {
    this._registry.clear();
  }

  hostDisconnected() {
    this._registry.clear();
  }
}
