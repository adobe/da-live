import { LitElement, html, ifDefined, until } from '../../../deps/lit/lit-all.min.js';
import { aem2prose, parse } from '../utils/helpers.js';
import getSheet from '../../shared/sheet.js';

const sheet = await getSheet('/blocks/edit/da-versions/da-versions.css');
const DEFAULT_VERSION_LABEL = 'Version Label';

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

    if (displayStyle === 'none') {
      this.loadedVersion = undefined;
    }
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
    this.loadedVersion = resURL;
    const aemDoc = await aemResp.text();

    const doc = parse(aemDoc);
    const pdoc = aem2prose(doc);
    const docc = document.createElement('div');
    docc.append(...pdoc);

    pm.innerHTML = docc.innerHTML;
  }

  async versionSelected(event) {
    const li = event.target;
    if (!li.dataset.href) {
      this.setDaVersionVisibility('none');
      // this.triggerHiddenVersions(li);
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
    const users = [];

    for (let i = start; i < end; i += 1) {
      list[i].users.forEach((e) => users.push(e));
      list[i].parent = agg.aggregateID;
    }

    // remove duplicates
    agg.users = users.filter((val, idx) => {
      const v = JSON.stringify(val);
      return idx === users.findIndex((obj) => JSON.stringify(obj) === v);
    });

    list.splice(start, 0, agg);
  }

  sameDays(d1, d2) {
    const ds1 = new Date(d1).toLocaleDateString([], { dateStyle: 'short' });
    const ds2 = new Date(d2).toLocaleDateString([], { dateStyle: 'short' });
    return ds1 === ds2;
  }

  aggregateList(list) {
    // make sure each element has a timestamp
    list.forEach((l) => { if (!l.timestamp) { l.timestamp = 1; } });
    // and sort by timestamp
    list.sort((a, b) => b.timestamp - a.timestamp);

    let noResStart;
    for (let i = 0; i < list.length; i += 1) {
      if (!list[i].url && noResStart === undefined) {
        noResStart = i;
      }

      const sameDays = noResStart !== undefined
        ? this.sameDays(list[noResStart].timestamp, list[i].timestamp) : undefined;
      if (noResStart !== undefined && (list[i].url || !sameDays)) {
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

  getDaySuffix(day) {
    return (day >= 4 && day <= 20) || (day >= 24 && day <= 30)
      ? 'th'
      : ['st', 'nd', 'rd'][(day % 10) - 1];
  }

  renderDate(millis) {
    const d = new Date(millis);

    const currentYear = new Date().getFullYear();
    let yearSuffix = '';
    if (d.getFullYear() !== currentYear) {
      yearSuffix = `, ${d.getFullYear()}`;
    }
    return `${d.toLocaleDateString([], { month: 'long' })} ${d.getDate()}${this.getDaySuffix(d.getDate())}${yearSuffix}`;
  }

  async renderVersions() {
    let res;
    try {
      res = await this.renderVersionDetails();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.log('Problem fetching versions', error);
    }

    if (res) {
      return res;
    }
    return html`<div>no versions found.</div.`;
  }

  triggerAuditLogCollapse(versionGroup) {
    const ag = versionGroup.currentTarget.querySelector('.audit-group');
    if (ag) {
      ag.classList.toggle('audit-group-collapse');
    }
  }

  triggerAuditLogHidden(versionGroup) {
    this.triggerAuditLogCollapse(versionGroup);
    const entries = versionGroup.currentTarget.querySelectorAll('.audit-entry');
    entries.forEach((e) => {
      e.classList.toggle('audit-entry-hidden');
    });
  }

  async renderVersionDetails() {
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
      // eslint-disable-next-line no-console
      console.log('Unexpected document URL', this.path);
      return html``;
    }

    const versionsURL = `${url.origin}/versionlist/${pathName.slice(8)}`;
    const res = await fetch(versionsURL);
    if (res.status !== 200) {
      return html``;
    }
    const list = await res.json();

    this.aggregateList(list);

    const versions = [html`<div class="version-line"></div>`];
    for (let i = 0; i < list.length; i += 1) {
      const l = list[i];

      const children = [];
      if (l.aggregateID) {
        // while (list[i].parent === l.aggregateID) {
        let moreChildren;
        do {
          i += 1;
          const c = list[i];
          const userList = c.users.map((u) => html`<div>${u.email}</div>`);
          const time = new Date(c.timestamp).toLocaleTimeString([], { timeStyle: 'medium' });
          const hiddenClass = versions.length === 1 ? '' : 'audit-entry-hidden';

          children.push(html`
            <div class="audit-entry ${hiddenClass}" data-parent="${c.parent}">
              <div class="entry-time">${time}</div><div class="user-list">${userList}</div>
            </div>`);

          moreChildren = ((list.length > (i + 1)) && (list[i + 1].parent === l.aggregateID));
        } while (moreChildren);

        // now that the children are rendered, render the parent
        const date = this.renderDate(l.aggregatedTo);
        let bulletClass;
        let triggerCall;
        if (versions.length === 1) {
          bulletClass = 'bullet-audit-first';
          triggerCall = this.triggerAuditLogCollapse;
        } else {
          bulletClass = 'bullet-audit';
          triggerCall = this.triggerAuditLogHidden;
        }

        versions.push(html`
          <div class="version-group" @click=${triggerCall}><div class="bullet ${bulletClass}"></div>
            <div class="audit-group audit-group-collapse" id=l.aggregateID}>
              ${date}
              ${children}
            </div>
          </div>`);
      } else {
        const verURL = l.url ? new URL(l.url, versionsURL) : undefined;
        let label = '';
        if (l.label) {
          label = html`<div class="label" data-href="${ifDefined(verURL)}">${l.label}</div>`;
        }

        const bulletClass = verURL ? 'bullet-stored' : `bullet-audit${versions.length === 1 ? '-first' : ''}`;
        const date = this.renderDate(l.timestamp);
        const time = new Date(l.timestamp).toLocaleTimeString([], { timeStyle: 'medium' });
        const userList = l.users.map((u) => html`<div data-href="${ifDefined(verURL)}">${u.email}</div>`);
        const entryClass = verURL ? 'version' : `audit-entry ${versions.length === 1 ? '' : 'audit-entry-hidden'}`;

        versions.push(html`
          <div class="version-group" @click=${this.triggerAuditLogHidden}><div class="bullet ${bulletClass}"></div><div data-href="${ifDefined(verURL)}">
            ${date}
            ${label}
            <div class="${entryClass}">
              <div class="entry-time" data-href="${ifDefined(verURL)}">${time}</div>
              <div class="user-list">${userList}</div>
            </div>
          </div></div>`);
      }
    }
    return versions;
  }

  normalizeVersionName(element) {
    if (!element.parentNode) {
      return null;
    }

    element.contentEditable = false;
    if (element.innerText === DEFAULT_VERSION_LABEL) {
      element.innerText = '';
    }

    return element.innerText.trim();
  }

  async completeVersionCreation(labelElement) {
    const label = this.normalizeVersionName(labelElement);
    if (!label) {
      return;
    }

    const url = new URL(this.path);
    const pathName = url.pathname;
    if (!pathName.startsWith('/source/')) {
      // Unexpected document URL
      // eslint-disable-next-line no-console
      console.log('Unexpected document URL', this.path);
      return;
    }

    const versionURL = `${url.origin}/versionsource/${pathName.slice(8)}`;

    let options;
    if (label) {
      options = {
        method: 'POST',
        body: `{"label": "${label}"}`,
      };
    } else {
      options = { method: 'POST' };
    }

    const res = await fetch(versionURL, options);
    if (res.status !== 201) {
      // eslint-disable-next-line no-console
      console.log('Unable to create version', res.status);
    }

    this.requestUpdate();
  }

  async completeVersionNaming(labelElement) {
    const label = this.normalizeVersionName(labelElement);
    if (!label) {
      return;
    }

    const url = this.loadedVersion;
    await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: `{"label": "${label}"}`,
    });
    this.update();
  }

  editLabel(lbl, commitFunction) {
    const cf = commitFunction.bind(this);

    lbl.onfocus = () => {
      // This selects all text in the Display Name element on focus
      setTimeout(() => {
        let sel;
        let range;
        if (window.getSelection && document.createRange) {
          range = document.createRange();
          range.selectNodeContents(lbl);
          sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        } else if (document.body.createTextRange) {
          range = document.body.createTextRange();
          range.moveToElementText(lbl);
          range.select();
        }
      }, 1);
    };
    lbl.onkeyup = (e) => {
      switch (e.key) {
        case 'Escape': // Escape will cancel the version creation
          lbl.remove();
          this.update();
          break;
        case 'Enter':
          cf(lbl);
          break;
        default:
          // Do nothing
          break;
      }
    };
    // Call the commitFunction a little later on blur to avoid interference
    // with the escape key
    lbl.onblur = () => setTimeout(() => cf(lbl), 200);
    lbl.focus();
  }

  async createVersion() {
    if (!this.path) {
      // Path not yet known, don't render
      // eslint-disable-next-line no-console
      console.log('Unable to save version as path not known');
      return;
    }

    const vl = this.shadowRoot.querySelector('.version-line');
    if (!vl) return;

    const oldEntry = vl.nextElementSibling;
    if (oldEntry) {
      const oldBullet = oldEntry.children[0];
      oldBullet.classList.remove('bullet-audit-first');
      oldBullet.classList.add('bullet-audit');
    }

    const vg = document.createElement('div');
    vg.classList.add('version-group');
    vg.innerHTML = `<div class="bullet bullet-stored"></div><div>
    ${this.renderDate(Date.now())}
    <div class="label" id="new-label" contenteditable="plaintext-only">${DEFAULT_VERSION_LABEL}</div>
    <div class="version">
      <div class="entry-time">${new Date().toLocaleTimeString([], { timeStyle: 'medium' })}</div>
    </div></div>
    </div>
    `;
    vl.after(vg);

    const lbl = vg.querySelector('#new-label');
    this.editLabel(lbl, this.completeVersionCreation);
  }

  async restoreVersion() {
    if (!this.path) {
      // eslint-disable-next-line no-console
      console.log('Unable to restore version as path not known');
      return;
    }

    if (this.loadedVersion) {
      const verURL = this.loadedVersion;
      this.hideVersions();

      // eslint-disable-next-line no-console
      console.log('Restoring from ', verURL);
      const res = await fetch(verURL);
      const content = await res.text();

      const blob = new Blob([content], { type: 'text/html' });
      const formData = new FormData();
      formData.append('data', blob);

      const opts = { method: 'PUT', body: formData };
      const putresult = await fetch(this.path, opts);

      if (putresult.status !== 201) {
        // eslint-disable-next-line no-console
        console.log('Unable to restore version', putresult.status);
      }
    }
  }

  nameVersion() {
    if (this.loadedVersion) {
      let lbl = this.shadowRoot.querySelector(`.label[data-href="${this.loadedVersion}"]`);
      if (!lbl) {
        const div = this.shadowRoot.querySelector(`.bullet + [data-href="${this.loadedVersion}"]`);

        if (!div) {
          return;
        }

        lbl = document.createElement('div');
        lbl.classList.add('label');
        lbl.innerText = DEFAULT_VERSION_LABEL;
        div.insertBefore(lbl, div.children[0]);
      }

      lbl.contentEditable = 'plaintext-only';
      this.editLabel(lbl, this.completeVersionNaming);
    }
  }

  render() {
    return html`
    <div class="da-versions-menubar">
      <span class="da-versions-menuitem da-versions-create" title="Create Version" @click=${this.createVersion}></span>
      <span class="da-versions-menuitem da-versions-restore" title="Restore Version" @click=${this.restoreVersion}></span>
      <span class="da-versions-menuitem da-versions-name" title="Name Version" @click=${this.nameVersion}></span>
      <span class="da-versions-menuitem da-versions-close" title="Close" @click=${this.hideVersions}></span>
    </div>
    <div class="da-versions-panel">
    <div class="version-group history-title"><div class="bullet bullet-history"></div><div>HISTORY</div></div>
    <div class="versions-wrapper" @click=${this.versionSelected}>
      ${until(this.renderVersions(), html`<div>Loading...</div>`)}
    </div>
    </div>
    `;
  }
}

customElements.define('da-versions', DaVersions);
