import { LitElement, html, ifDefined, until } from '../../../deps/lit/lit-all.min.js';
import { aem2prose, parse } from '../utils/helpers.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-versions/da-versions.css');

export default class DaVersions extends LitElement {
  static properties = { path: {} };

  constructor() {
    super();
    this.parent = document.querySelector('da-content');
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  setDaVersionVisibility(displayStyle) {
    const dav = this.parent.shadowRoot.querySelector('da-version');
    dav.style.display = displayStyle;
    return dav;
  }

  hideVersions() {
    this.setDaVersionVisibility('none');

    this.parent.classList.remove('show-versions');
    this.classList.remove('show-versions');
  }

  async loadVersion(href, pm) {
    const sourceURL = new URL(this.path);
    const resURL = new URL(href, sourceURL);

    const aemResp = await fetch(resURL);
    const aemDoc = await aemResp.text();

    const doc = parse(aemDoc);
    const pdoc = aem2prose(doc);
    const docc = document.createElement('div');
    docc.append(...pdoc);

    pm.innerHTML = docc.innerHTML;
  }

  versionSelected(event) {
    const li = event.target;
    if (!li.dataset.href) {
      this.setDaVersionVisibility('none');
      return;
    }

    const dav = this.setDaVersionVisibility('block');
    const pm = dav.shadowRoot.querySelector('.ProseMirror');
    this.loadVersion(li.dataset.href, pm);
  }

  async renderVersions() {
    if (!this.path) {
      // Path not yet known, don't render
      return html``;
    }

    // this.path is something like
    // 'https://admin.da.live/source/bosschaert/da-aem-boilerplate/blah3.html'
    const url = new URL(this.path);
    const pathName = url.pathname;
    if (!pathName.startsWith('/source/')) {
      // Unexpected document URL
      console.log('Unexpected document URL', this.path);
      return html``;
    }

    const versionsURL = `http://localhost:3000/mock-versions/list${pathName.slice(7, -5)}.json`;
    const res = await fetch(versionsURL);
    const list = await res.json();

    const versions = [];
    for (const l of list) {
      let verURL;
      if (l.resource) {
        verURL = new URL(l.resource, versionsURL);
      }

      versions.push(html`
        <li tabindex="1" data-href="${ifDefined(verURL)}">
          ${new Date(l.timestamp).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' })}
        <br/>${l.authors.join(', ')}</li>`);
    }
    return versions;
  }

  render() {
    return html`
    <div class="da-versions-menubar">
      <span class="da-versions-menuitem da-versions-create"></span>
      <span class="da-versions-menuitem da-versions-restore"></span>
      <span class="da-versions-menuitem da-versions-close" @click=${this.hideVersions}></span>
    </div>
    <div class="da-versions-panel">
    <ul @click=${this.versionSelected}>
      ${until(this.renderVersions(), html`<li>Loading...</li>`)}
    </ul>
    </div>
    `;
  }
}

customElements.define('da-versions', DaVersions);
