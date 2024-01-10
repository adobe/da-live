import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import { origin } from '../shared/constants.js';

import getSheet from '../shared/sheet.js';
import { daFetch } from '../shared/utils.js';
const sheet = await getSheet('/blocks/start/start-wc.css');

const DEMO_URLS = [
  'https://content.da.live/adobecom/da-milo-college/gnav',
  'https://content.da.live/adobecom/da-milo-college/footer',
  'https://content.da.live/adobecom/da-milo-college/demo',
]

class DaStart extends LitElement {
  static properties = {
    activeStep: { state: true },
    owner: { state: true },
    repo: { state: true },
    goEnabled: { state: true },
    url: { state: true },
    showOpen: { state: true },
    showDone: { state: true },
    _demoContent: { state: true },
    _goText: { state: true },
  };

  constructor() {
    super();
    const urlParams = new URLSearchParams(window.location.search);
    this.activeStep = 1;
    this.owner = urlParams.get('owner');
    this.repo = urlParams.get('repo');
    this.url = this.repo && this.owner ? `https://github.com/${this.owner}/${this.repo}` : '';
    this.goEnabled = this.repo && this.owner;
    this._demoContent = false;
    this._goText = 'Make something wonderful';
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  goToOpen(e) {
    try {
      const code = this.shadowRoot.querySelector('#mountpoint');
      const blob = new Blob([code.value], { type: 'text/plain' });
      const data = [new ClipboardItem({ [blob.type]: blob })];
      navigator.clipboard.write(data);
      this.showOpen = true;
    } catch {

    }
    e.preventDefault();
  }

  goToDone(e) {
    window.open(`https://github.com/${this.owner}/${this.repo}/edit/main/fstab.yaml`);
    // Wait a beat
    setTimeout(() => { this.showDone = true; }, 200);
    e.preventDefault();
  }

  goToNextStep(e) {
    this.showOpen = false;
    this.showDone = false;
    e.preventDefault();
    this.activeStep = this.activeStep === 3 ? 1 : this.activeStep += 1;
  }

  async goToSite(e) {
    if (this._demoContent) {
      e.target.disabled = true;
      for (const url of DEMO_URLS) {
        const name = url.split('/').pop();
        this._goText = `Creating ${name}`;
        const resp = await daFetch(url);
        if (!resp.ok) return;
        const html = await resp.text();
        // Do any modifications here
        const blob = new Blob([html], { type: 'text/html' });
        const formData = new FormData();
        formData.append('data', blob);
        const opts = { method: 'PUT', body: formData };
        const putResp = await daFetch(`https://admin.da.live/source/${this.owner}/${this.repo}/${name}.html`, opts);
        if (!putResp.ok) return;
        const aemResp = await daFetch(`https://admin.hlx.page/preview/${this.owner}/${this.repo}/main/${name}`, { method: 'POST' });
        if (!aemResp.ok) return;
      }
      this._goText = 'Done';
    }
    window.open(`/#/${this.owner}/${this.repo}`);
  }

  toggleDemo() {
    this._demoContent = !this._demoContent;
  }


  onInputChange(e) {
    if (!e.target.value.startsWith('https://github.com')) {
      this.owner = null;
      this.repo = null;
      this.goEnabled = false;
      return;
    }
    try {
      const { pathname } = new URL(e.target.value);
      const [owner, repo] = pathname.slice(1).toLowerCase().split('/');
      if (owner && repo) {
        this.owner = owner;
        this.repo = repo;
        this.goEnabled = true;
      } else {
        this.owner = null;
        this.repo = null;
        this.goEnabled = false;
      }
    } catch { }
  }

  isGoDisabled() {
    return this.repo === 'aem-boilerplate';
  }

  async submitForm(e) {
    e.preventDefault();
    const opts = { method: 'PUT' }
    const resp = await daFetch(e.target.action, opts);
    if (!resp.ok) return;
    this.goToNextStep(e);
  }

  getStepOnePanel() {
    return html`
      <div class="step-1-panel">
        <form class="actions" action="${origin}/source/${this.owner}/${this.repo}" @submit=${this.submitForm}>
          <div class="git-input">
            <label for="fname">AEM codebase</label>
            <input type="text" name="repo" value="${this.url}" @input=${this.onInputChange} placeholder="https://github.com/adobe/geometrixx" />
          </div>
          <button class="go-button" ?disabled=${!this.goEnabled}>Go</button>
        </form>
        <div class="text-container">
          <p>Paste your AEM repo URL above.<br/>
          Don't have one, yet? Fork <a href="https://github.com/adobecom/da-aem-boilerplate">AEM Boilerplate</a>.</p>
        </div>
      </div>
    `;
  }

  getStepTwoPanel() {
    return html`
      <div class="step-2-panel">
      <div class="pre-code-wrapper">
        <textarea id="mountpoint">
mountpoints:
  /:
    url: https://content.da.live/${this.owner}/${this.repo}/
    type: markup</textarea>
        <div class="fstab-action-container">
          <button class="go-button" @click=${this.goToOpen}>Copy</button>
          ${this.showOpen ? html`<button class="go-button" @click=${this.goToDone}>Open</button>` : null}
          ${this.showDone ? html`<button class="go-button" @click=${this.goToNextStep}>Done</button>` : null}
        </div>
      </div>
      <div class="text-container">
        <p>Tell your code about your content.<br/>
        Copy the code above and save it into your fstab.<br/>Head back here when you're done.</p>
      </div>
    </div>
    `;
  }

  getStepThreePanel() {
    return html`
      <div class="step-3-panel">
        <div class="demo-wrapper">
          <label for="demo-toggle">Demo content</label>
          <input class="demo-toggle" id="demo-toggle" type="checkbox" .checked="${this._demoContent}" @click="${this.toggleDemo}" />
        </div>
        <button class="da-login-button con-button blue button-xl" @click=${this.goToSite}>${this._goText}</button>
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
          ${this.getStepThreePanel()}
        </div>
      </div>
    `;
  }
}

customElements.define('da-start', DaStart);

export default function init(el) {
  el.append(document.createElement('da-start'));
}
