import getSheet from '../../shared/sheet.js';
import { CommentsPanel } from '../../shared/comments/comments-panel.js';
import { openCommentsPanel } from '../editor-utils/comments-bridge.js';

const sheet = await getSheet('/blocks/shared/comments/comments-panel.css');

export class EwComments extends CommentsPanel {
  static extraStylesheets = [sheet];

  openCommentsHost() {
    openCommentsPanel();
  }

  closeCommentsHost() {
    this.dispatchEvent(new CustomEvent('nx-panel-close', { bubbles: true, composed: true }));
  }
}

customElements.define('ew-comments', EwComments);

export default EwComments;
