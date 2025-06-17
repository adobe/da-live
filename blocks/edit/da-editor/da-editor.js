import { DOMParser as proseDOMParser } from 'da-y-wrapper';
import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../../shared/sheet.js';
import { initIms, daFetch } from '../../shared/utils.js';
import { parse, aem2prose } from '../utils/helpers.js';
import { toHTML } from './utils.js';
import prose2aem from '../../shared/prose2aem.js';
import { getNx } from '../../../scripts/utils.js';
import { DA_AI_ORIGIN } from '../../shared/constants.js';


const sheet = await getSheet('/blocks/edit/da-editor/da-editor.css');

// Throttle utility function
const throttle = (func, delay) => {
  let lastCall = 0;
  return function (...args) {
    const now = Date.now();
    if (now - lastCall >= delay) {
      lastCall = now;
      return func.apply(this, args);
    }
  };
};

const fixTextNotInParagraph = (dom) => {
  dom.querySelectorAll('div').forEach(div => {
    div.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
        const p = document.createElement('p');
        div.replaceChild(p, node);
        p.appendChild(node);
      }
    });
  });
}

const updateProseInternal = async (docBuffer, currentHTML) => {
  const newHtml = toHTML(docBuffer, true);
  if (!newHtml) return; // may not be able to parse the html

  const newDom = parse(newHtml);
  fixTextNotInParagraph(newDom.body); // ai might omit to wrap text in a paragraph

  const currentDom = parse(currentHTML);
  // console.log('currentDom:')
  // console.log(currentDom.body.innerHTML);
  // console.log('newDom:')
  // console.log(newDom.body.innerHTML);
  const { regionalDiff } = await import(`${getNx()}/blocks/loc/regional-diff/regional-diff.js`);
  const diff = await regionalDiff(currentDom, newDom);

  const proseDom = aem2prose(newDom);
  const flattedDom = document.createElement('div');
  flattedDom.append(...proseDom);
  flattedDom.querySelectorAll('table').forEach((table) => {
    const div = document.createElement('div');
    div.className = 'tableWrapper';
    table.insertAdjacentElement('afterend', div);
    div.append(table);
  });

  const { schema, doc } = window.view.state;
  const newDoc = proseDOMParser.fromSchema(schema).parse(flattedDom);
  const tr = window.view.state.tr.replaceWith(0, doc.content.size, newDoc.content);

  const newState = window.view.state.apply(tr);
  window.view.updateState(newState);
};

// Throttled version of updateProse - only executes once every 300ms
const updateProse = throttle(updateProseInternal, 200);

// Helper function to find the corresponding node in the cloned DOM
const findCorrespondingNode = (originalNode, originalRoot, clonedRoot) => {
  if (originalNode === originalRoot) return clonedRoot;
  
  const path = [];
  let current = originalNode;
  
  // Build path from target node to root
  while (current && current !== originalRoot) {
    const parent = current.parentNode;
    if (parent) {
      const index = Array.from(parent.childNodes).indexOf(current);
      path.unshift(index);
    }
    current = parent;
  }
  
  // Follow the path in the cloned DOM
  let target = clonedRoot;
  for (const index of path) {
    if (target.childNodes && target.childNodes[index]) {
      target = target.childNodes[index];
    } else {
      return null;
    }
  }
  
  return target;
};

// Helper function to insert cursor marker at a specific position
const insertCursorMarker = (node, offset, marker) => {
  if (node.nodeType === Node.TEXT_NODE) {
    // Split text node and insert marker
    const text = node.textContent;
    const before = text.slice(0, offset);
    const after = text.slice(offset);
    node.textContent = before + marker + after;
  } else {
    // Insert marker as a text node at the specified child position
    const textNode = document.createTextNode(marker);
    if (offset < node.childNodes.length) {
      node.insertBefore(textNode, node.childNodes[offset]);
    } else {
      node.appendChild(textNode);
    }
  }
};

const CURSOR_MARKER = '%%CURSOR%%';
const SELECTION_START_MARKER = '%%SELECTIONSTART%%';
const SELECTION_END_MARKER = '%%SELECTIONEND%%';

/**
 * Mark the cursor/selection position in the cloned DOM, before sending it to the AI
 * @param {Element} clone 
 */
const markCursor = (clone) => {
  // Mark cursor/selection position in the clone
  const selection = window.view.state.selection;
  const isCollapsed = selection.from === selection.to;
  
  if (isCollapsed) {
    // Single cursor position
    try {
      const { node, offset } = window.view.docView.domFromPos(selection.from, 0);
      const targetNode = findCorrespondingNode(node, window.view.docView.dom, clone);
      if (targetNode) {
        insertCursorMarker(targetNode, offset, CURSOR_MARKER);
      }
    } catch (error) {
      console.warn('Could not mark cursor position:', error);
    }
  } else {
    // Selection range
    try {
      const { node: startNode, offset: startOffset } = window.view.docView.domFromPos(selection.from, 0);
      const { node: endNode, offset: endOffset } = window.view.docView.domFromPos(selection.to, 0);
      
      const targetStartNode = findCorrespondingNode(startNode, window.view.docView.dom, clone);
      const targetEndNode = findCorrespondingNode(endNode, window.view.docView.dom, clone);
      
      if (targetStartNode && targetEndNode) {
        // Insert end marker first to avoid offset issues
        insertCursorMarker(targetEndNode, endOffset, SELECTION_END_MARKER);
        insertCursorMarker(targetStartNode, startOffset, SELECTION_START_MARKER);
      }
    } catch (error) {
      console.warn('Could not mark selection range:', error);
    }
  }
}

/**
 * Remove the cursor/selection markers from the cloned HTML string
 * @param {string} cloneHTML 
 */
const removeCursorMarkers = (cloneHTML) => {
  return cloneHTML.replaceAll(CURSOR_MARKER, '').replaceAll(SELECTION_START_MARKER, '').replaceAll(SELECTION_END_MARKER, '');
}


window.genai = async (prompt) => {
  if (!DA_AI_ORIGIN) {
    console.error('DA_AI_ORIGIN is not set');
    return;
  }
  const clone = window.view.docView.dom.cloneNode(true);
  markCursor(clone);

  let currentHTML = prose2aem(clone);
  
  const { accessToken } = await initIms() || {};
  const response = await fetch(`${DA_AI_ORIGIN}/agent/${window.location.hash.substring(2)}.html`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ prompt, current: currentHTML }),
  });

  currentHTML = removeCursorMarkers(currentHTML);

  const reader = response.body
    .pipeThrough(new TextDecoderStream())
    .getReader();

  let docBuffer = '';
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += value;

    let lines = buffer.split('\n');
    buffer = lines.pop(); // keep the last incomplete line

    for (const line of lines) {
      if (line.startsWith('data:')) {
        const data = line.replace(/^data:\s*/, '');
        const json = JSON.parse(data);

        if (json.type === 'delta') {
          docBuffer += json.delta;
          await updateProse(docBuffer);
        }
        if (json.type === 'thought') {
          console.log(`Thinking: ${json.content}`);
          continue;
        }
        if (json.type === 'done') {
          break;
        }
        if (json.type === 'error') {
          throw new Error(json.error);
        }

        if (json.type === 'image') {
          // This definitely needs to be done better
          docBuffer = docBuffer.replaceAll(json.placeholderRef, json.imageUrl);
          await updateProseInternal(docBuffer, currentHTML);
        }

        if (json.type === 'document') {
          docBuffer = json.content;
          await updateProseInternal(docBuffer, currentHTML);
        }
      }
    }
  }
  console.log('out of the while loop...')
  // await updateProseInternal(docBuffer); // ensure the last bit is processed
}

export default class DaEditor extends LitElement {
  static properties = {
    path: { type: String },
    version: { type: String },
    proseEl: { attribute: false },
    wsProvider: { attribute: false },
    permissions: { state: true },
    _imsLoaded: { state: false },
    _versionDom: { state: true },
  };

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this.shadowRoot.createRange = () => document.createRange();
    initIms().then(() => { this._imsLoaded = true; });
  }

  async fetchVersion() {
    this._versionDom = null;
    const resp = await daFetch(this.version);
    if (!resp.ok) return;
    const text = await resp.text();
    const doc = parse(text);
    const proseDom = aem2prose(doc);
    const flattedDom = document.createElement('div');
    flattedDom.append(...proseDom);
    flattedDom.querySelectorAll('table').forEach((table) => {
      const div = document.createElement('div');
      div.className = 'tableWrapper';
      table.insertAdjacentElement('afterend', div);
      div.append(table);
    });
    this._versionDom = flattedDom;
  }

  handleCancel() {
    const opts = { bubbles: true, composed: true };
    const event = new CustomEvent('versionreset', opts);
    this.dispatchEvent(event);
    this._versionDom = null;
  }

  handleRestore() {
    const { schema, doc } = window.view.state;
    const newDoc = proseDOMParser.fromSchema(schema).parse(this._versionDom);
    const tr = window.view.state.tr.replaceWith(0, doc.content.size, newDoc.content);

    const newState = window.view.state.apply(tr);
    window.view.updateState(newState);
    this.handleCancel();
  }

  get _proseEl() {
    return this.shadowRoot.querySelector('.da-prose-mirror');
  }

  get _canWrite() {
    if (!this.permissions) return false;
    return this.permissions.some((permission) => permission === 'write');
  }

  renderVersion() {
    return html`
      <div class="da-prose-mirror da-version-preview">
        <div class="da-version-action-area">
          <button @click=${this.handleCancel}>Cancel</button>
          <button class="accent" @click=${this.handleRestore} ?disabled=${!this._canWrite}>Restore</button>
        </div>
        <div class="ProseMirror">${this._versionDom}</div>
      </div>`;
  }

  render() {
    return html`
      ${this._versionDom ? this.renderVersion() : nothing}
    `;
  }

  async updated(props) {
    if (props.has('version') && this.version) {
      this.fetchVersion();
    }

    // Do not setup prosemirror until we know the permissions
    if (props.has('proseEl') && this.path && this.permissions) {
      if (this._proseEl) this._proseEl.remove();
      this.shadowRoot.append(this.proseEl);
      const pm = this.shadowRoot.querySelector('.ProseMirror');
      if (pm) pm.contentEditable = 'false';
    }
  }
}

customElements.define('da-editor', DaEditor);
