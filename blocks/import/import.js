import { LitElement, html } from '../../../deps/lit/lit-core.min.js';
import 'helix-importer'; // https://github.com/adobe/helix-importer
import getSheet from '../shared/sheet.js';

const styles = await getSheet('/blocks/import/import-wc.css');

class DaImport extends LitElement {
  static properties = {
    importHTML: { state: true },
    urlsButtonEnabled: { state: true },
    importUrls: { state: true },
  };

  constructor() {
    super();
    const sourceField = document.querySelector(':root main textarea');
    this.importHTML = sourceField.textContent;
    this.importOrigin = sourceField.getAttribute('data-origin');
  }

  connectedCallback() {
    super.connectedCallback();
    this.shadowRoot.adoptedStyleSheets = [styles];
  }

  createDocumentFromString(htmlStr) {
    try {
      // eslint-disable-next-line no-undef
      const parser = new DOMParser();
      return parser.parseFromString(htmlStr, 'text/html');
    } catch (e) {
      throw new Error('Unable to parse HTML using default createDocumentFromString function and global DOMParser. Please provide a custom createDocumentFromString.');
    }
  }

  async onInputChange(e) {
    const { name, value } = e.target;

    const plainHTML = value;
    const dom = this.createDocumentFromString(plainHTML);
    const md = await WebImporter.html2md(this.importOrigin, dom, WebImporter.defaultTransformDOM);
    const transformedHTML = await WebImporter.md2html(md.md);
    console.log(transformedHTML);
  }

  async submitForm(e) {
    e.preventDefault();

    console.log('sitemap', this.importUrls);
  }

  getStepOnePanel() {
    return html`
      <div class="step-1-panel">
        <h2>Importing ${this.importOrigin}</h2>
        <form class="actions" @submit=${this.submitForm}>
          <div class="input-container">
            <div class="urllist-input">
              <label for="fname">Original HTML</label>
              <textarea rows=5 name="urls" @input=${this.onInputChange}>${this.importHTML}</textarea>
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

  // getStepTwoPanel() {

  //   return html`
  //     <div class="step-2-panel">
  //       <h2>Importing ${this.importUrls.length} pages.</h2>
  //       <div class="progress-container">
  //         <table>
  //           <thead>
  //             <tr>
  //               <th>URL</th>
  //               <th>Status</th>
  //             </tr>
  //           </thead>
  //           <tbody>
  //           ${this.importUrls.map((url) => html`
  //             <tr>
  //               <td>${url}</td>
  //               <td>...</td>
  //             </tr>
  //           `)}
  //           </tbody>
  //         </table>
  //       </div>
  //     </div>
  //   `;
  // }

  render() {
    return html`
      <img src="/blocks/login/img/dark-alley.jpg" class="background"/>
      <div class="gradient"></div>
      <div class="foreground">
        <div class="panels">
          ${this.getStepOnePanel()}
        </div>
      </div>
    `;
  }
}

customElements.define('da-import', DaImport);

export default async function init(el) {
  const test = document.createElement('textarea');
  test.style.display = 'none';
  test.textContent = `<html><head></head><body><h1>test</h1></body></html>`;
  test.setAttribute('id', 'test');
  test.setAttribute('data-origin', 'https://wknd.site/us/en/magazine.html');
  el.closest('main').appendChild(test);

  el.append(document.createElement('da-import'));
}
