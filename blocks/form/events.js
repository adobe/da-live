import { createChannel } from '../shared/channel.js';

/** Where a selection came from. */
export const NAV_ORIGIN = Object.freeze({
  EDITOR: 'editor',
  OUTLINE: 'outline',
});

/**
 * Connects the form editor with its tool panel views, which live in another
 * subtree. The editor emits the `*State` channels, which replay their last
 * value to late subscribers, and the views emit `*Request` commands.
 */
export const formEvents = Object.freeze({
  /** The group to reveal in the editor. */
  jumpRequest: createChannel(),
  /** The engine state, or null without a document. */
  formState: createChannel({ replay: true }),
  /** The current selection and where it came from. */
  selectionState: createChannel({ replay: true }),
});
