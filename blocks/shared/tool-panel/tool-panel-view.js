/**
 * The view `experience` values that open outside the panel instead of as a
 * tab. `window` opens the view's first source in a new browser tab,
 * `fullsize-dialog` shows it in the panel's full size dialog and `modal` calls
 * the view's own `openModal`.
 */
const EXTERNAL_EXPERIENCES = new Set(['window', 'fullsize-dialog', 'modal']);

/**
 * Tells whether a view opens outside the panel, in a window, dialog or modal.
 *
 * @param {object} view - The view.
 * @returns {boolean} Whether the view opens outside the panel.
 */
export const opensOutsidePanel = (view) => EXTERNAL_EXPERIENCES.has(view.experience);

/**
 * Tells whether a view can be pinned as a tab. Views that open outside the
 * panel can't.
 *
 * @param {object} [view] - The view.
 * @returns {boolean} Whether the view can be pinned.
 */
export const canPin = (view) => !!view && !opensOutsidePanel(view);

/**
 * Reads a view's current label.
 *
 * @param {object} view - The view.
 * @returns {string} The label.
 */
export const labelOf = (view) => view.getLabel?.() ?? view.label;
