import { LitElement, html } from '../../../deps/lit/lit-core.min.js';

import getSheet from '../shared/sheet.js';
const sheet = await getSheet('/blocks/start/start-wc.css');


class DaStart extends LitElement {
  static properties = {
    activeStep: { state: true },
    owner: { state: true },
    repo: { state: true },
    goEnabled: { state: true },
    url: { state: true },
    showOpen: { state: true },
    showDone: { state: true },
  };

  constructor() {
    super();
    const urlParams = new URLSearchParams(window.location.search);
    this.origin = urlParams.get('local') ? 'http://localhost:8787' : 'https://admin.da.live';

    this.activeStep = 1;
    this.owner = urlParams.get('owner');
    this.repo = urlParams.get('repo');
    this.url = this.repo && this.owner ? `https://github.com/${this.owner}/${this.repo}` : '';
    this.goEnabled = this.repo && this.owner;
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

  goToSite(e) {
    window.open(`https://da.live/edit#/${this.owner}/${this.repo}/test`);
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
    } catch {}
  }

  isGoDisabled() {
    return this.repo === 'aem-boilerplate';
  }

  async submitForm(e) {
    e.preventDefault();
    const opts = { method: 'PUT' }
    const resp = await fetch(e.target.action, opts);
    if (!resp.ok) return;
    this.goToNextStep(e);
  }

  getStepOnePanel() {
    return html`
      <div class="step-1-panel">
        <form class="actions" action="${this.origin}/source/${this.owner}/${this.repo}/really/long/name/of/stuff.jpg" @submit=${this.submitForm}>
          <div class="git-input">
            <label for="fname">AEM codebase</label>
            <input type="text" name="repo" value="${this.url}" @input=${this.onInputChange} placeholder="https://github.com/adobe/geometrixx" />
          </div>
          <button class="go-button" ?disabled=${!this.goEnabled}>Go</button>
        </form>
        <div class="text-container">
          <p>Paste your AEM repo URL above.<br/>
          Don't have one, yet? Fork AEM Boilerplate <a href="https://github.com/adobe/aem-boilerplate">from here</a>.</p>
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
          <input class="demo-toggle" id="demo-toggle" type="checkbox" />
        </div>
        <button class="da-login-button con-button blue button-xl" @click=${this.goToSite}>Make something wonderful</button>
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
