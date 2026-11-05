/**
 * The origins the views report their selections with. Each view scrolls to selections
 * from the other view only, so a click never scrolls the view that was clicked.
 */
export const NAVIGATION_ORIGINS = Object.freeze({ editor: 'editor', sidebar: 'sidebar' });
