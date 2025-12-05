/**
 * Creates a debounced handleEvent method for input/textarea components.
 * Debounces @input events while keeping @change events immediate.
 *
 * @param {Object} component - Component instance (must have _debounceTimer, etc.)
 * @param {Function} superHandleEvent - Parent class's handleEvent method
 * @returns {Function} The handleEvent method to use
 */
export default function createDebouncedHandleEvent(component, superHandleEvent) {
  return function handleEvent(event) {
    // For input events, debounce the update
    if (event.type === 'input') {
      // Capture the value immediately before debouncing
      const value = event.target.value ?? '';
      // Store pending value to prevent reset during re-render
      // eslint-disable-next-line no-underscore-dangle
      component._pendingValue = value;

      // eslint-disable-next-line no-underscore-dangle
      clearTimeout(component._debounceTimer);
      // eslint-disable-next-line no-underscore-dangle
      component._debounceTimer = setTimeout(() => {
        // Create a synthetic event with the captured value
        const syntheticEvent = new InputEvent('input', {
          bubbles: event.bubbles,
          cancelable: event.cancelable,
          composed: event.composed,
        });
        // Create a target-like object with the captured value
        const targetWithValue = {
          value,
          ...event.target,
        };
        Object.defineProperty(syntheticEvent, 'target', {
          value: targetWithValue,
          enumerable: true,
        });
        // Call parent's handleEvent with the synthetic event
        superHandleEvent.call(component, syntheticEvent);
        // Clear pending value after event is dispatched
        // eslint-disable-next-line no-underscore-dangle
        component._pendingValue = null;
        // eslint-disable-next-line no-underscore-dangle
      }, component._debounceDelay);
    } else {
      // For change events (blur/Enter), call immediately
      superHandleEvent.call(component, event);
    }
  };
}
