import { LitElement, html, nothing } from 'da-lit';
import getSheet from '../shared/sheet.js';
import { daFetch } from '../shared/utils.js';
import { daApi } from '../shared/da-api.js';
import { copyConfig, copyContent, previewContent } from './index.js';
import { sanitizePathParts } from '../../scripts/utils.js';

const sheet = await getSheet('/blocks/start/start.css');

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

const ORG_CONFIG = `{
    "data": {
        "total": 1,
        "limit": 1,
        "offset": 0,
        "data": [{}]
    },
    "permissions": {
        "total": 2,
        "limit": 2,
        "offset": 0,
        "data": [
          {
              "path": "CONFIG",
              "groups": "{{EMAIL}}",
              "actions": "write",
              "comments": "The ability to set configurations for an org."
          },
          {
              "path": "/ + **",
              "groups": "{{EMAIL}}",
              "actions": "write",
              "comments": "The ability to create content."
          }
        ]
    },
    ":names": [
        "data",
        "permissions"
    ],
    ":version": 3,
    ":type": "multi-sheet"
}`;

async function fetchConfig(org, body) {
  let opts;
  if (body) opts = { method: 'POST', body };

  return daApi.getConfig(`/${org}/`, opts);
}

export async function loadConfig(org) {
  const resp = await fetchConfig(org);

  const result = { status: resp.status };

  if (!resp.ok) {
    if (resp.status === 403 && resp.status === 401) {
      result.message = 'You are not authorized to change this organization.';
    }
  } else {
    const json = await resp.json();
    if (json) result.json = json;
  }

  return result;
}

export async function saveConfig(org, email, existingConfig) {
  const defConfigStr = ORG_CONFIG.replaceAll('{{EMAIL}}', email);
  const defConfig = JSON.parse(defConfigStr);

  // Preserve the existing config
  if (existingConfig?.data) defConfig.data = existingConfig;

  const body = new FormData();
  body.append('config', JSON.stringify(defConfig));

  const resp = await fetchConfig(org, body);

  return { status: resp.status };
}

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
    _errorText: { state: true },
    _templates: { state: true },
    _loading: { state: true },
    _disableCreate: { state: true },
  };

  constructor() {
    super();
    const urlParams = new URLSearchParams(window.location.search);
    this.activeStep = 1;
    this.org = urlParams.get('org');
    this.site = urlParams.get('site');
    this.autoSubmit = this.site && this.org;
    this.url = this.autoSubmit ? `https://github.com/${this.org}/${this.site}` : '';
    this.goEnabled = this.autoSubmit;
    this._demoContent = false;
    this._goText = 'Make something wonderful';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
    this._templates = AEM_TEMPLATES;
  }

  async firstUpdated() {
    if (this.autoSubmit) {
      const form = this.shadowRoot.querySelector('form');
      if (form) {
        const event = {
          preventDefault: () => {},
          target: form,
        };
        await this.submitForm(event);
      }
    }
  }

  goToNextStep(e) {
    this.showOpen = false;
    this.showDone = false;
    this._errorText = undefined;
    this._disableCreate = undefined;
    e.preventDefault();
    this.activeStep = this.activeStep === 3 ? 1 : this.activeStep += 1;
  }

  async goToSite(e) {
    const { code, content } = this._templates.find((tpl) => tpl.selected) || this._templates[0];
    const hasDemo = !code.includes('aem-boilerplate');
    if (hasDemo) {
      this._disableCreate = true;

      const resp = await daFetch(`${DA_ORIGIN}/list/${this.org}/${this.site}`);
      const json = await resp.json();
      if (json.length > 0) {
        this._errorText = 'The target site is not empty. Choose no demo content or a different site.';
        this._disableCreate = undefined;
        return;
      }

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

      const previewResult = await previewContent(this.org, this.site, setStatus);
      if (previewResult.type === 'error') {
        setStatus('Could not preview all content. Permissions? AEM Code Sync? fstab?');
        return;
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
      const [org, site] = sanitizePathParts(pathname);
      if (!(org && site)) throw Error('No org or site');
      this.org = org;
      this.site = site;
      this.goEnabled = true;
    } catch (ex) {
      this.org = null;
      this.site = null;
      this.goEnabled = false;
      // eslint-disable-next-line no-console
      console.log(ex);
    }
  }

  async submitForm(e) {
    e.preventDefault();
    const siteUrl = e.target.action;

    // Check if user is signed in
    if (!window.adobeIMS?.isSignedInUser()) {
      this._errorText = 'You need to sign in first.';
      return;
    }

    this._loading = true;

    const { status: orgLoadStatus } = await loadConfig(this.org);
    if (orgLoadStatus === 404) {
      // Check if user has an email address
      const { email } = await window.adobeIMS.getProfile();
      if (!email) {
        this._errorText = 'Make sure your profile contains an email address.';
        this._loading = false;
        return;
      }

      const { status: orgSaveStatus } = await saveConfig(this.org, email);
      if (orgSaveStatus !== 201) {
        if (orgSaveStatus === 401 || orgSaveStatus === 403) {
          this._errorText = 'You are not authorized to create this DA organization. Check your permissions.';
        } else {
          this._errorText = 'The org could not be created. Check the console logs or contact an administrator.';
        }
        this._loading = false;
        return;
      }
    }

    const resp = await daFetch(siteUrl, { method: 'PUT' });
    this._loading = false;
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        this._errorText = 'You are not authorized to create this site in the corresponding DA organization. Check with the organization administrator.';
      } else {
        this._errorText = 'The site could not be created. Check the console logs or contact an administrator.';
      }
      return;
    }

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
        <form class="actions" action="${daApi.getSourceUrl(`/${this.org}/${this.site}`)}" @submit=${this.submitForm}>
          <div class="git-input">
            <label for="fname">AEM codebase</label>
            <input type="text" name="site" value="${this.url}" @input=${this.onInputChange} placeholder="https://github.com/adobe/geometrixx" />
          </div>
          <button class="go-button ${this._loading ? 'is-loading' : ''}" ?disabled=${!this.goEnabled || this._loading}>
            ${this._loading ? html`<span class="spinner"></span>` : 'Go'}
          </button>
        </form>
        ${this._errorText ? html`<p class="error-text">${this._errorText}</p>` : nothing}
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
          <p>Don't forget to add the <a href="https://da.live/bot">AEM Code Sync App</a> to your repository.</p>
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
        ${this._errorText ? html`<p class="error-text">${this._errorText}</p>` : nothing}
        <div class="step-3-actions">
          <button class="da-login-button con-button blue button-xl" @click=${this.goToSite} ?disabled=${this._disableCreate}>${this._goText}</button>
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
