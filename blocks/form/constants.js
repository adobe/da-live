// ============================================
// WINDOW/GLOBAL CUSTOM EVENTS
// ============================================
// These events are dispatched on window or host elements
// and are used for cross-component communication

export const EVENT_FOCUS_ELEMENT = 'focus-element';
export const EVENT_EDITOR_SCROLL_TO = 'editor-scroll-to';
export const EVENT_NAVIGATION_SCROLL_TO = 'navigation-scroll-to';
export const EVENT_VISIBLE_GROUP = 'visible-group';
export const EVENT_VALIDATION_STATE_CHANGE = 'validation-state-change';
export const EVENT_ACTIVATE_FIELD = 'activate-field';

// ============================================
// COMPONENT CUSTOM EVENTS
// ============================================
// These events are dispatched by specific components
// and bubble up through the component tree

export const EVENT_HEADER_BADGE_CLICK = 'header-badge-click';
export const EVENT_FIELD_CLICK = 'field-click';
export const EVENT_FORM_MODEL_INTENT = 'form-model-intent';
export const EVENT_VALUE_CHANGE = 'value-change';
export const EVENT_SEGMENT_CLICK = 'segment-click';
export const EVENT_SECTION_CLICK = 'section-click';
export const EVENT_ERROR_BADGE_CLICK = 'error-badge-click';

// ============================================
// DOM EVENTS
// ============================================
// Standard DOM events used by the form components

export const DOM_EVENT_SCROLL = 'scroll';
export const DOM_EVENT_RESIZE = 'resize';
export const DOM_EVENT_HASHCHANGE = 'hashchange';
export const DOM_EVENT_CLICK = 'click';
export const DOM_EVENT_CHANGE = 'change';
export const DOM_EVENT_INPUT = 'input';

// ============================================
// FIELD TYPES
// ============================================

export const PRIMITIVE_TYPES = ['string', 'boolean', 'number'];

// ============================================
// LAYOUT CONSTANTS
// ============================================

export const LAYOUT = {
  HEADER_OFFSET_PADDING: 8,
  INDICATOR_OFFSET: 5,
  FALLBACK_LINE_HEIGHT: 25,
};

// ============================================
// TIMING CONSTANTS
// ============================================

export const TIMING = {
  DEBOUNCE_DELAY: 150,
  INPUT_DEBOUNCE: 300,
};

// ============================================
// SCROLL BEHAVIOR CONSTANTS
// ============================================

export const SCROLL = {
  // Scroll behavior for navigation (error badge, nav items, breadcrumbs)
  // Possible values: 'auto' (instant), 'smooth' (animated)
  BEHAVIOR: 'auto',
};

// ============================================
// INTERSECTION OBSERVER CONFIG
// ============================================

export const INTERSECTION = {
  THRESHOLDS: [0, 0.25, 0.5, 0.75, 1],
  VIEWPORT_BOTTOM_MARGIN: 0.3, // 30% visible from bottom
};

// ============================================
// SEMANTIC TYPES
// ============================================

export const SEMANTIC_TYPES = { LONG_TEXT: 'long-text' };

// ============================================
// SCHEMA TYPES
// ============================================

export const SCHEMA_TYPES = {
  OBJECT: 'object',
  ARRAY: 'array',
  STRING: 'string',
  NUMBER: 'number',
  INTEGER: 'integer',
  BOOLEAN: 'boolean',
  NULL: 'null',
};

export const DEFAULT_ITEM_TITLE = 'Item';

// ============================================
// DATA GENERATION CONSTANTS
// ============================================

// TODO: This depth limit is a safeguard against infinite recursion (circular refs).
// Could be improved with more sophisticated cycle detection that tracks reference chains
// while still allowing legitimate deep nesting beyond this limit.
export const MAX_GENERATION_DEPTH = 10;

// ============================================
// URLS
// ============================================

export const SCHEMA_EDITOR_URL = 'https://main--da-live--adobe.aem.live/apps/schema?nx=schema';
