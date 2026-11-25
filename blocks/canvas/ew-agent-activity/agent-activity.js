import { getNx } from '../../../scripts/utils.js';
import { canvasBus } from '../utils/canvas-bus.js';

const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);

// Fallbacks keep the listeners valid against a da-nx that predates these keys.
export const TURN_EVENT = {
  STARTED: CHAT_EVENT.TURN_STARTED || 'nx-chat-turn-started',
  PROGRESS: CHAT_EVENT.TURN_PROGRESS || 'nx-chat-turn-progress',
  COMPLETED: CHAT_EVENT.TURN_COMPLETED || 'nx-chat-turn-completed',
};

export const AGENT_ACTIVITY_VIEW_ID = 'agent-activity';

export const TURN_STATUS = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  ABORTED: 'aborted',
  ERROR: 'error',
};

/**
 * Applies one chat turn event to the activity state. Each progress event carries the
 * turn's full page list, so it replaces rather than merges. A progress event without
 * a start (e.g. installed mid-turn) still begins a running turn.
 */
export function reduceAgentActivity(state, type, detail = {}) {
  if (type === TURN_EVENT.STARTED) {
    return { status: TURN_STATUS.RUNNING, pages: [] };
  }
  if (type === TURN_EVENT.PROGRESS) {
    return { status: state?.status ?? TURN_STATUS.RUNNING, pages: detail.pages ?? [] };
  }
  if (type === TURN_EVENT.COMPLETED && state?.status === TURN_STATUS.RUNNING) {
    return { ...state, status: detail.status ?? TURN_STATUS.COMPLETED };
  }
  return state;
}

let uninstall;

/**
 * Listens for chat turn events on `document`, publishes the activity on
 * `canvasBus.agentActivityState`, and calls `onTurnStarted` when the user sends a prompt.
 */
export function installAgentActivity({ onTurnStarted } = {}) {
  if (uninstall) return uninstall;
  let state;
  const handle = ({ type, detail }) => {
    const next = reduceAgentActivity(state, type, detail);
    if (next === state) return;
    state = next;
    canvasBus.agentActivityState.emit(state);
    if (type === TURN_EVENT.STARTED) onTurnStarted?.();
  };
  const types = Object.values(TURN_EVENT);
  types.forEach((type) => document.addEventListener(type, handle));
  uninstall = () => {
    types.forEach((type) => document.removeEventListener(type, handle));
    uninstall = undefined;
  };
  return uninstall;
}
