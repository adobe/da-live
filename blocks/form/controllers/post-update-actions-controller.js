import { EVENT_FOCUS_ELEMENT } from '../constants.js';

/**
 * Lit controller that handles post-update actions after model changes.
 * Schedules actions to run after component updates complete, ensuring DOM is ready.
 * 
 * Supports actions like:
 * - focus: Navigate to and focus a specific pointer after model update
 * 
 * @example
 * constructor() {
 *   this._postUpdateActions = new PostUpdateActionsController(this, {
 *     getChildComponents: () => [this.shadowRoot?.querySelector('da-form-editor')]
 *   });
 * }
 * 
 * handleOperation(operation) {
 *   this.model = applyOperation(operation);
 *   this._postUpdateActions.scheduleAction({
 *     type: 'focus',
 *     pointer: '/items/2',
 *     source: 'editor'
 *   });
 * }
 */
export default class PostUpdateActionsController {
  constructor(host, options = {}) {
    this.host = host;
    this.getChildComponents = options.getChildComponents || (() => []);
    this._pendingActions = [];
    host.addController(this);
  }

  /**
   * Schedule an action to run after the next update completes.
   * @param {Object} action - Action to schedule
   * @param {string} action.type - Action type ('focus', etc.)
   * @param {*} action.* - Additional action-specific properties
   */
  scheduleAction(action) {
    if (!action || !action.type) {
      // eslint-disable-next-line no-console
      console.warn('[PostUpdateActionsController] Invalid action scheduled:', action);
      return;
    }
    this._pendingActions.push(action);
    this.host.requestUpdate();
  }

  /**
   * Called by Lit after host component updates.
   * Processes all pending actions after child components finish updating.
   */
  async hostUpdated() {
    if (this._pendingActions.length === 0) return;

    const actions = [...this._pendingActions];
    this._pendingActions = [];

    // Wait for child components to update
    const children = this.getChildComponents();
    const updatePromises = children
      .map((c) => c?.updateComplete)
      .filter(Boolean);

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    // Process all scheduled actions
    actions.forEach((action) => this._processAction(action));
  }

  /**
   * Process a single action based on its type.
   * @param {Object} action - Action to process
   * @private
   */
  _processAction(action) {
    switch (action.type) {
      case 'focus':
        this._processFocusAction(action);
        break;
      default:
        // eslint-disable-next-line no-console
        console.warn('[PostUpdateActionsController] Unknown action type:', action.type);
    }
  }

  /**
   * Process a focus action - dispatch focus event to coordinate scrolling.
   * @param {Object} action - Focus action with pointer and source
   * @private
   */
  _processFocusAction(action) {
    if (!action.pointer) {
      // eslint-disable-next-line no-console
      console.warn('[PostUpdateActionsController] Focus action missing pointer:', action);
      return;
    }

    window.dispatchEvent(new CustomEvent(EVENT_FOCUS_ELEMENT, {
      detail: {
        pointer: action.pointer,
        source: action.source || 'unknown',
      },
      bubbles: true,
      composed: true,
    }));
  }
}
