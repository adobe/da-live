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

  triggerHiddenVersions(li) {
    const shrink = li.classList.contains('auditlog-expanded');
    let newClass;
    if (shrink) {
      newClass = 'auditlog-hidden';
      li.classList.remove('auditlog-expanded');
    } else {
      newClass = 'auditlog-detail';
      li.classList.add('auditlog-expanded');
    }

    const lis = li.parentNode.querySelectorAll(`li[data-parent="${li.id}"]`);
    lis.forEach((l) => {
      l.classList = newClass;
    });
  }

  async versionSelected(event) {
    const li = event.target;
    if (!li.dataset.href) {
      this.setDaVersionVisibility('none');
      this.triggerHiddenVersions(li);
      return;
    }

    const dav = this.setDaVersionVisibility('block');
    const pm = dav.shadowRoot.querySelector('.ProseMirror');
    await this.loadVersion(li.dataset.href, pm);
  }

  insertAggregate(list, start, end) {
    const agg = {
      timestamp: list[start].timestamp,
      aggregatedTo: list[end - 1].timestamp,
      aggregateID: `${start}-${end}`,
    };
    const authors = new Set();

    for (let i = start; i < end; i += 1) {
      list[i].authors.forEach((e) => authors.add(e));
      list[i].parent = agg.aggregateID;
    }
    agg.authors = [...authors];

    list.splice(start, 0, agg);
  }

  sameDays(d1, d2) {
    const ds1 = new Date(d1).toLocaleDateString([], { dateStyle: 'short' });
    const ds2 = new Date(d2).toLocaleDateString([], { dateStyle: 'short' });
    return ds1 === ds2;
  }

  aggregateList(list) {
    let noResStart;
    for (let i = 0; i < list.length; i += 1) {
      if (!list[i].resource && noResStart === undefined) {
        noResStart = i;
      }

      const sameDays = this.sameDays(list[noResStart].timestamp, list[i].timestamp);
      if (noResStart !== undefined && (list[i].resource || !sameDays)) {
        if (i - noResStart > 1) {
          // only if more than 1 element
          this.insertAggregate(list, noResStart, i);
          // Increase i with 1 as we added an element
          i += 1;
        }

        if (!sameDays) {
          noResStart = i;
        } else {
          noResStart = undefined;
        }
      }

      // This is if it's at the end of the list
      if (i === list.length - 1 && noResStart !== undefined) {
        if (i - noResStart >= 1) {
          this.insertAggregate(list, noResStart, i + 1);
          i += 1;
        }
        noResStart = undefined;
      }
    }
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

    this.aggregateList(list);

    const versions = [];
    for (const l of list) {
      let verURL;
      if (l.resource) {
        verURL = new URL(l.resource, versionsURL);
      }

      let fromDate;
      let toDate;
      if (l.aggregatedTo) {
        fromDate = new Date(l.aggregatedTo).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' });
        toDate = ` - ${new Date(l.timestamp).toLocaleTimeString([], { timeStyle: 'short' })}`;
      } else {
        fromDate = new Date(l.timestamp).toLocaleString([], { dateStyle: 'full', timeStyle: 'short' });
        toDate = '';
      }

      versions.push(html`
        <li tabindex="1" data-href="${ifDefined(verURL)}" data-parent="${ifDefined(l.parent)}"
          id=${ifDefined(l.aggregateID)}
          class="${l.parent ? 'auditlog-hidden' : ''}">
          ${fromDate}${toDate}
        <br/>${l.authors.join(', ')} ${l.aggregatedTo ? '...' : ''}</li>`);
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
