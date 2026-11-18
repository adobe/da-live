import createOutlineView from './outline/outline-view.js';

/* The form's delegate for the shared tool panel. */
export const toolPanelHost = Object.freeze({ getViews: () => [createOutlineView()] });
