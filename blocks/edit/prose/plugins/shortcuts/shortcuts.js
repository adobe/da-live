import { Plugin } from 'da-y-wrapper';
import { openShortcutsModal } from './shortcuts-modal.js';

// Shared state to track if modal is open
const sharedModalState = { isOpen: false };

/**
 * Helper to check if the '?' key was pressed (without modifiers)
 */
function isQuestionMarkKey(event) {
  return event.key === '?' && !event.ctrlKey && !event.metaKey && !event.altKey;
}

/**
 * Helper to open the shortcuts modal and track its state
 */
function openModal(event) {
  event.preventDefault();
  event.stopPropagation();
  sharedModalState.isOpen = true;

  const modal = openShortcutsModal();
  modal.addEventListener('close', () => {
    sharedModalState.isOpen = false;
  }, { once: true });
}

/**
 * Plugin to handle opening shortcuts modal with '?'
 * Only opens when not in an editable state or when focused outside the editor
 */
export default function shortcutsPlugin() {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (!isQuestionMarkKey(event) || sharedModalState.isOpen) {
          return false;
        }

        // Check if we're in the editor and it's editable
        const { editable } = view;
        const isFocused = view.hasFocus();

        // If the editor is editable and focused, don't intercept (let user type '?')
        if (editable && isFocused) {
          return false;
        }

        openModal(event);
        return true;
      },
    },
  });
}

/**
 * Helper to check if we should block the shortcut (user is typing)
 */
function shouldBlockShortcut(event) {
  // Check if we're in a regular input field
  const { target } = event;
  const isInInput = target.tagName === 'INPUT'
    || target.tagName === 'TEXTAREA'
    || target.isContentEditable;

  if (isInInput) return true;

  // Check if editor exists and is focused and editable
  if (window.view) {
    const { editable } = window.view;
    const isFocused = window.view.hasFocus();
    if (editable && isFocused) return true;
  }

  return false;
}

/**
 * Global keyboard event handler for opening shortcuts modal
 * This handles the case when focus is outside the editor
 */
export function initGlobalShortcutsHandler() {
  const handleKeyDown = (event) => {
    if (!isQuestionMarkKey(event) || sharedModalState.isOpen) {
      return;
    }

    // Don't open if user is typing in an input field or the editor
    if (shouldBlockShortcut(event)) {
      return;
    }

    openModal(event);
  };

  document.addEventListener('keydown', handleKeyDown);

  return () => {
    document.removeEventListener('keydown', handleKeyDown);
  };
}
