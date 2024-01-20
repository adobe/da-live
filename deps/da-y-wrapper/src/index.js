import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import {
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
  undo,
  redo,
  prosemirrorToYDoc,
  prosemirrorToYXmlFragment,
} from 'y-prosemirror';

export {
  Y,
  WebsocketProvider,
  ySyncPlugin,
  yCursorPlugin,
  yUndoPlugin,
  undo,
  redo,
  prosemirrorToYDoc,
  prosemirrorToYXmlFragment,
};
