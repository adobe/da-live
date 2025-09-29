import { LitElement, html, nothing } from 'da-lit';
import { getDaAdmin } from '../shared/constants.js';
import getSheet from '../shared/sheet.js';
import { daFetch } from '../shared/utils.js';
import { copyConfig, copyContent, previewContent } from './index.js';

const sheet = await getSheet('/blocks/start/start.css');

const DA_ORIGIN = getDaAdmin();

const AEM_TEMPLATES = [
  {
    title: 'AEM Boilerplate',
    demoTitle: 'None',
    description: 'A basic project.',
    demo: 'No sample content.',
    code: 'https://github.com/adobe/aem-boilerplate',
  },
  {
    title: 'AEM Block Collection',
    description: 'A project with pre-made blocks.',
    demo: 'Sample content with library.',
    code: 'https://github.com/aemsites/da-block-collection',
    content: '/da-sites/da-start-demo-content',
  },
  {
    title: 'Author Kit',
    description: 'A project for flexible authoring.',
    demo: 'Sample content with library.',
    code: 'https://github.com/aemsites/author-kit',
    content: '/da-sites/author-kit-starter',
  },
];

class DaStart extends LitElement {
  static properties = {
    activeStep: { state: true },
    org: { state: true },
    site: { state: true },
    goEnabled: { state: true },
    url: { state: true },
    showOpen: { state: true },
    showDone: { state: true },
    _goText: { state: true },
    _statusText: { state: true },
    _templates: { state: true },
  };

  constructor() {
    super();
    const urlParams = new URLSearchParams(window.location.search);
    this.activeStep = 1;
    this.org = urlParams.get('org');
    this.site = urlParams.get('site');
    this.url = this.site && this.org ? `https://github.com/${this.org}/${this.site}` : '';
    this.goEnabled = this.site && this.org;
    this._demoContent = false;
    this._goText = 'Make something wonderful';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._templates = AEM_TEMPLATES;
  }

  goToNextStep(e) {
    this.showOpen = false;
    this.showDone = false;
    e.preventDefault();
    this.activeStep = this.activeStep === 3 ? 1 : this.activeStep += 1;
  }

  async goToSite(e) {
    const { code, content } = this._templates.find((tpl) => tpl.selected) || this._templates[0];
    const hasDemo = !code.includes('aem-boilerplate');
    if (hasDemo) {
      e.target.disabled = true;

      const setStatus = (text) => { this._statusText = text; };

      const list = await copyContent(content, this.org, this.site, setStatus);
      if (list.some((file) => !file.ok)) {
        this._statusText = 'There was an error copying demo content.';
        return;
      }

      setStatus('Copying library config');
      const config = await copyConfig(content, this.org, this.site);
      if (!config.ok) {
        this._statusText = 'There was an error copying the library config.';
        return;
      }

      const previewList = await previewContent(this.org, this.site, setStatus);
      if (previewList.some((file) => !file.ok)) {
        setStatus('Could not preview all content. Permissions? AEM Code Sync? fstab?');
        await new Promise((resolve) => { setTimeout(() => { resolve(); }, 3000); });
      }

      delete e.target.disabled;
      this._goText = 'Opening site';
      this._statusText = '';
    }
    window.location = `${window.location.origin}/#/${this.org}/${this.site}`;
  }

  onInputChange(e) {
    try {
      const { origin, pathname } = new URL(e.target.value);
      if (origin !== 'https://github.com') throw Error('Not github');
      const [, org, site] = pathname.toLowerCase().trim().split('/');
      if (!(org && site)) throw Error('No org or site');
      this.org = org;
      this.site = site;
      this.goEnabled = true;
    } catch (ex) {
      this.org = null;
      this.site = null;
      this.goEnabled = false;
      console.log(ex);
    }
  }

  async submitForm(e) {
    e.preventDefault();
    const opts = { method: 'PUT' };
    const resp = await daFetch(e.target.action, opts);
    if (!resp.ok) return;
    this.goToNextStep(e);
  }

  setTemplate(el) {
    const url = el.href || el.dataset.url;
    for (const template of this._templates) {
      template.selected = template.code === url;
    }
    this.requestUpdate();
  }

  handleTemplateClick(e) {
    this.setTemplate(e.target.closest('a'));
  }

  handleDemoClick(e) {
    this.setTemplate(e.target.closest('button'));
  }

  renderOne() {
    return html`
      <div class="step-1-panel">
        <form class="actions" action="${DA_ORIGIN}/source/${this.org}/${this.site}" @submit=${this.submitForm}>
          <div class="git-input">
            <label for="fname">AEM codebase</label>
            <input type="text" name="site" value="${this.url}" @input=${this.onInputChange} placeholder="https://github.com/adobe/geometrixx" />
          </div>
          <button class="go-button" ?disabled=${!this.goEnabled}>Go</button>
        </form>
        <div class="text-container">
          <p>Paste your AEM codebase URL above.</p>
          <p>Don't have one, yet? Pick a template below.</p>
        </div>
        <div class="template-container">
          <ul>
            ${this._templates.map((tpl) => html`
              <li class="template-card">
                <a
                  href="${tpl.code}"
                  target="_blank"
                  class="${tpl.selected === true ? 'is-selected' : ''}"
                  @click=${this.handleTemplateClick}>
                  <p class="template-card-title">${tpl.title}</p>
                  <p>${tpl.description}</p>
                </a>
              </li>
            `)}
          </ul>
        </div>
        <div class="text-container">
          <p>Don't forget the <a href="https://da.live/bot">AEM Code Bot</a>.</p>
        </div>
      </div>
    `;
  }

  renderTwo() {
    return html`
      <div class="step-2-panel">
        <h2>Demo content</h2>
        <div class="template-container">
          <ul>
            ${this._templates.map((tpl) => html`
              <li class="template-card">
                <button
                  data-url=${tpl.code}
                  class="${tpl.selected === true ? 'is-selected' : ''}"
                  @click=${this.handleDemoClick}>
                  <p class="template-card-title">${tpl.demoTitle || tpl.title}</p>
                  <p>${tpl.demo}</p>
                </button>
              </li>
            `)}
          </ul>
        </div>
        <div class="step-3-actions">
          <button class="da-login-button con-button blue button-xl" @click=${this.goToSite}>${this._goText}</button>
          <p>${this._statusText ? this._statusText : nothing}</p>
        </div>
      </div>
    `;
  }

  render() {
    return html`
      <img src="/blocks/start/dark-alley.jpg" class="background"/>
      <div class="gradient"></div>
      <div class="foreground step-${this.activeStep}-active">
        <ul class="step-count">
          <li>1</li>
          <li class="step-2">2</li>
        </ul>
        <div class="panels">
          ${this.renderOne()}
          ${this.renderTwo()}
        </div>
      </div>
    `;
  }
}

customElements.define('da-start', DaStart);

export default function init(el) {
  el.append(document.createElement('da-start'));
}
