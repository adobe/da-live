import getSheet from '../../shared/sheet.js';
import { CommentsPanel } from '../../shared/comments/comments-panel.js';

const panelSheet = await getSheet('/blocks/shared/comments/comments-panel.css');
const daSheet = await getSheet('/blocks/edit/da-comments/da-comments.css');

class DaComments extends CommentsPanel {
  static extraStylesheets = [panelSheet, daSheet];

  openCommentsHost() {
    this.dispatchEvent(new CustomEvent('requestOpen', { bubbles: true, composed: true }));
  }

  closeCommentsHost() {
    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  usesPanelScrollWrapper() {
    return false;
  }
}

customElements.define('da-comments', DaComments);

export default DaComments;
