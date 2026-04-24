import { LitElement, html, nothing } from 'da-lit';
import { getDaAdmin } from '../shared/constants.js';
import getSheet from '../shared/sheet.js';
import { daFetch } from '../shared/utils.js';
import { copyConfig, copyContent, previewContent } from './index.js';
import { sanitizePathParts } from '../../scripts/utils.js';
import { I18nController, t } from '../shared/i18n.js';

const sheet = await getSheet('/blocks/start/start.css');

const DA_ORIGIN = getDaAdmin();

const AEM_TEMPLATES = [
  {
    title: 'AEM Boilerplate',
    demoTitleKey: 'start.template.aemBoilerplate.demoTitle',
    descriptionKey: 'start.template.aemBoilerplate.description',
    demoKey: 'start.template.aemBoilerplate.demo',
    code: 'https://github.com/adobe/aem-boilerplate',
  },
  {
    title: 'AEM Block Collection',
    descriptionKey: 'start.template.aemBlockCollection.description',
    demoKey: 'start.template.aemBlockCollection.demo',
    code: 'https://github.com/aemsites/da-block-collection',
    content: '/da-sites/da-start-demo-content',
  },
  {
    title: 'Author Kit',
    descriptionKey: 'start.template.authorKit.description',
    demoKey: 'start.template.authorKit.demo',
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

  return daFetch(`${DA_ORIGIN}/config/${org}/`, opts);
}

export async function loadConfig(org) {
  const resp = await fetchConfig(org);

  const result = { status: resp.status };

  if (!resp.ok) {
    if (resp.status === 403 && resp.status === 401) {
      result.message = t('start.error.notAuthorizedOrg');
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
    _goingToSite: { state: true },
    _statusText: { state: true },
    _errorText: { state: true },
    _templates: { state: true },
    _loading: { state: true },
    _disableCreate: { state: true },
  };

  // eslint-disable-next-line no-unused-private-class-members
  #i18n = new I18nController(this);

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
        this._errorText = t('start.error.targetNotEmpty');
        this._disableCreate = undefined;
        return;
      }

      const setStatus = (text) => { this._statusText = text; };

      const list = await copyContent(content, this.org, this.site, setStatus);
      if (list.some((file) => !file.ok)) {
        this._statusText = t('start.error.copyContent');
        return;
      }

      setStatus(t('start.copying.config'));
      const config = await copyConfig(content, this.org, this.site);
      if (!config.ok) {
        this._statusText = t('start.error.copyConfig');
        return;
      }

      const previewResult = await previewContent(this.org, this.site, setStatus);
      if (previewResult.type === 'error') {
        setStatus(t('start.error.preview'));
        return;
      }

      delete e.target.disabled;
      this._goingToSite = true;
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
      this._errorText = t('start.error.signIn');
      return;
    }

    this._loading = true;

    const { status: orgLoadStatus } = await loadConfig(this.org);
    if (orgLoadStatus === 404) {
      // Check if user has an email address
      const { email } = await window.adobeIMS.getProfile();
      if (!email) {
        this._errorText = t('start.error.noEmail');
        this._loading = false;
        return;
      }

      const { status: orgSaveStatus } = await saveConfig(this.org, email);
      if (orgSaveStatus !== 201) {
        if (orgSaveStatus === 401 || orgSaveStatus === 403) {
          this._errorText = t('start.error.createOrgUnauthorized');
        } else {
          this._errorText = t('start.error.createOrgFailed');
        }
        this._loading = false;
        return;
      }
    }

    const resp = await daFetch(siteUrl, { method: 'PUT' });
    this._loading = false;
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) {
        this._errorText = t('start.error.createSiteUnauthorized');
      } else {
        this._errorText = t('start.error.createSiteFailed');
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
        <form class="actions" action="${DA_ORIGIN}/source/${this.org}/${this.site}" @submit=${this.submitForm}>
          <div class="git-input">
            <label for="fname">${t('start.label.codebase')}</label>
            <input type="text" name="site" value="${this.url}" @input=${this.onInputChange} placeholder="https://github.com/adobe/geometrixx" />
          </div>
          <button class="go-button ${this._loading ? 'is-loading' : ''}" ?disabled=${!this.goEnabled || this._loading}>
            ${this._loading ? html`<span class="spinner"></span>` : t('start.button.go')}
          </button>
        </form>
        ${this._errorText ? html`<p class="error-text">${this._errorText}</p>` : nothing}
        <div class="text-container">
          <p>${t('start.cta.line1')}</p>
          <p>${t('start.cta.line2')}</p>
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
                  <p>${t(tpl.descriptionKey)}</p>
                </a>
              </li>
            `)}
          </ul>
        </div>
        <div class="text-container">
          <p>${t('start.codeSyncApp.before')}<a href="https://da.live/bot">${t('start.codeSyncApp.linkText')}</a>${t('start.codeSyncApp.after')}</p>
        </div>
      </div>
    `;
  }

  renderTwo() {
    const goLabel = this._goingToSite ? t('start.openingSite') : t('start.title');
    return html`
      <div class="step-2-panel">
        <h2>${t('start.demoContent')}</h2>
        <div class="template-container">
          <ul>
            ${this._templates.map((tpl) => html`
              <li class="template-card">
                <button
                  data-url=${tpl.code}
                  class="${tpl.selected === true ? 'is-selected' : ''}"
                  @click=${this.handleDemoClick}>
                  <p class="template-card-title">${tpl.demoTitleKey ? t(tpl.demoTitleKey) : tpl.title}</p>
                  <p>${t(tpl.demoKey)}</p>
                </button>
              </li>
            `)}
          </ul>
        </div>
        ${this._errorText ? html`<p class="error-text">${this._errorText}</p>` : nothing}
        <div class="step-3-actions">
          <button class="da-login-button con-button blue button-xl" @click=${this.goToSite} ?disabled=${this._disableCreate}>${goLabel}</button>
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
