import { LitElement, html } from '../../../deps/lit/lit-core.min.js';

import getSheet from '../shared/sheet.js';
const sheet = await getSheet('/blocks/start/start-wc.css');


class DaStart extends LitElement {
  static properties = {
    activeStep: { state: true },
    owner: { state: true },
    repo: { state: true },
    goEnabled: { state: true },
  };

  constructor() {
    super();
    this.activeStep = 1;
    this.owner = 'adobe';
    this.repo = 'aem-boilerplate';
    this.goEnabled = false;
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [sheet];
  }

  goToNextStep(e) {
    e.preventDefault();

    this.activeStep = this.activeStep === 3 ? 1 : this.activeStep += 1;
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

  getStepOnePanel() {
    return html`
      <div class="step-1-panel">
        <form class="actions">
          <div class="git-input">
            <label for="fname">AEM codebase</label>
            <input type="text" name="repo" @input=${this.onInputChange} placeholder="https://github.com/..." />
          </div>
          <button class="go-button" @click=${this.goToNextStep} ?disabled=${!this.goEnabled}>Go</button>
        </form>
        <div class="text-container">
          <p>Paste your AEM code repo above.<br/>
          Don't have one, yet? Fork AEM Boilerplate <a href="https://github.com/adobe/aem-boilerplate">from here</a>.</p>
        </div>
      </div>
    `;
  }

  getStepTwoPanel() {
    return html`
      <div class="step-2-panel">
      <div class="pre-code-wrapper">
        <pre>
          <code>
mountpoints:
  /:
    url: https://content.da.live/${this.owner}/${this.repo}/
    type: markup
          </code>
        </pre>
        <button class="go-button" @click=${this.goToNextStep}>Copy</button>
      </div>
      <div class="text-container">
        <p>Tell your code about your content.<br/>
        Copy the code above and paste it into <a href="https://github.com/${this.owner}/${this.repo}/edit/main/fstab.yaml">your fstab.yaml</a>.</p>
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

customElements.define('da-start', DaStart);


export default function init(el) {
  el.append(document.createElement('da-start'));
}
