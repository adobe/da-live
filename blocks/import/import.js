import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import { loadSitemap } from 'helix-importer-sitemap';
import 'helix-importer'; // https://github.com/adobe/helix-importer

import getSheet from '../shared/sheet.js';

const styles = await getSheet('/blocks/import/import-wc.css');

const proxyUrl = 'http://localhost:3001';

class DaImport extends LitElement {
  static properties = {
    activeStep: { state: true },
    sitemapButtonEnabled: { state: true },
    sitemapUrl: { state: true },
    urls: { state: true },
    urlsButtonEnabled: { state: true },
    importUrls: { state: true },
  };

  constructor() {
    super();
    this.activeStep = 1;
    this.importUrls = [];
  }


  buildProxyURL(url) {
    const u = new URL(url);
    if (!u.searchParams.get('host')) {
      u.searchParams.append('host', u.origin);
    }
    return `${proxyUrl}${u.pathname}${u.search}`;
  }

  // borrowed from helix-importer BrowserUtils (not exported for now)
  createDocumentFromString(html) {
    try {
      // eslint-disable-next-line no-undef
      const parser = new DOMParser();
      return parser.parseFromString(html, 'text/html');
    } catch (e) {
      throw new Error('Unable to parse HTML using default createDocumentFromString function and global DOMParser. Please provide a custom createDocumentFromString.');
    }
  }

  async getPlainHTML(url) {
    const resp = await fetch(url);

    if (!resp.ok) {
      return '';
    }

    const body = await resp.text();

    console.log(body);

    return body;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  onInputChange(e) {
    const { name, value } = e.target;
    if (name === 'sitemap' && value.includes('sitemap.xml')) {
      this.sitemapUrl = value;
      this.sitemapButtonEnabled = !!value;
    } else if (name === 'urls' && value.includes('https://')) { 
      this.urls = value;
      this.urlsButtonEnabled = !!value;
    }
  }

  goToNextStep(e) {
    this.activeStep = this.activeStep === 3 ? 1 : this.activeStep += 1;
  }

  async submitForm(e) {
    e.preventDefault();

    if (e.submitter.name === 'sitemap-button') {
      const _sitemapUrl = new URL(this.sitemapUrl);
      this.importUrls = await loadSitemap(_sitemapUrl.pathname, _sitemapUrl.origin);
    } else if (e.submitter.name === 'urls-button') {
      this.importUrls = this.urls.split('\n');
    }
    console.log('sitemap', this.importUrls);  
    this.goToNextStep(e);
  }

  getStepOnePanel() {
    return html`
      <div class="step-1-panel">
        <h2>Let do some import magic ...</h2>
        <form class="actions" @submit=${this.submitForm}>
          <div class="input-container">
          <div class="sitemap-input">
            <label for="fname">Have a sitemap.xml?</label>
            <input type="text" name="sitemap" value="${this.sitemapUrl}" @input=${this.onInputChange} placeholder="https://aem.live/sitemap.xml" />
          </div>
          <button class="go-button" name="sitemap-button" ?disabled=${!this.sitemapButtonEnabled}>Go</button>
          </div>

          <div class="input-container">
          <div class="urllist-input">
            <label for="fname">List of pages</label>
            <textarea rows=5 name="urls" value="${this.urls}" @input=${this.onInputChange}></textarea>
          </div>
          <button class="go-button large" name="urls-button" ?disabled=${!this.urlsButtonEnabled}>Go</button>
          </div>
        </form>
        <div class="text-container">
          <p>Don't have a site today?<br/>
          <a href="/start">Start</a> with a fresh one.</p>
        </div>
      </div>
    `;
  }

  async getStepTwoPanel() {

    for (var i = 0; i < this.importUrls.length; i++) {
      const url = this.buildProxyURL(this.importUrls[i]);

      const plainHTML = await this.getPlainHTML(url);
      const dom = this.createDocumentFromString(plainHTML);
      
      const md = await WebImporter.html2md(this.importUrls[i], dom, WebImporter.defaultTransformDOM);

      const transformedHTML = await WebImporter.md2html(md.md);
      console.log(transformedHTML);
    }

    return html`
      <div class="step-2-panel">
        <h2>Importing ...</h2>
        <div class="text-container">
          <p>Importing ${this.importUrls.length} pages.</p>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <img src="/blocks/login/img/dark-alley.jpg" class="background"/>
      <div class="gradient"></div>
      <div class="foreground step-${this.activeStep}-active">
        <ul class="step-count">
          <li>1</li>
          <li class="step-2">2</li>
          <li class="step-3">3</li>
        </ul>
        <div class="panels">
          ${this.getStepOnePanel()}
          ${this.getStepTwoPanel()}
        </div>
      </div>
    `;
  }
}

customElements.define('da-import', DaImport);

export default async function init(el) {
  el.append(document.createElement('da-import'));
}
