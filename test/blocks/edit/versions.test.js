import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';

import { render } from '../../../deps/lit/lit-all.min.js';
import DaVersions from '../../../blocks/edit/da-versions/da-versions.js';

const fetchMap = {
  'http://localhost:3000/mock-versions/list/da-sites/da-status/tests/versions1.json': './versions1.json',
  'http://localhost:3000/mock-versions/resources/72398245211/3.html': './version3.html',
};

async function mockFetch(url) {
  const content = await readFile({ path: fetchMap[url] });
  return new Response(content);
}

function scn(html) {
  // remove HTML comments
  const nocomment = html.replaceAll(/<!--[\s\S]*?-->/g, '');

  // normalize all spaces into a single space
  return nocomment.trim().replaceAll(/\s+/g, ' ');
}

function sn(htmlEl) {
  return scn(htmlEl.innerHTML);
}

async function wait(milliseconds) {
  return new Promise((r) => {
    setTimeout(r, milliseconds);
  });
}

/* eslint-disable max-len */
/* Find the internal representation of versions1.json here for reference
<div>
   <li tabindex="1" class="">Thursday, March 21, 2024 at 4:45 PM <br>Joe Bloggs </li>
   <li tabindex="1" data-href="http://localhost:3000/mock-versions/resources/72398245211/3.html" class="">Thursday, March 21, 2024 at 4:11 PM <br>Joe Bloggs </li>
   <li tabindex="1" id="2-5" class="">Thursday, March 21, 2024 at 4:06 PM - 4:11 PM <br>Melinda Vertex, Joe Bloggs, Eric Idle, Anonymous ...</li>
   <li tabindex="1" data-parent="2-5" class="auditlog-hidden">Thursday, March 21, 2024 at 4:11 PM <br>Melinda Vertex, Joe Bloggs </li>
   <li tabindex="1" data-parent="2-5" class="auditlog-hidden">Thursday, March 21, 2024 at 4:10 PM <br>Eric Idle </li>
   <li tabindex="1" data-parent="2-5" class="auditlog-hidden">Thursday, March 21, 2024 at 4:06 PM <br>Melinda Vertex, Anonymous </li>
   <li tabindex="1" id="6-8" class="">Wednesday, March 20, 2024 at 5:25 AM - 5:33 AM <br>Melinda Vertex ...</li>
   <li tabindex="1" data-parent="6-8" class="auditlog-hidden">Wednesday, March 20, 2024 at 5:33 AM <br>Melinda Vertex </li>
   <li tabindex="1" data-parent="6-8" class="auditlog-hidden">Wednesday, March 20, 2024 at 5:25 AM <br>Melinda Vertex </li>
   <li tabindex="1" data-href="http://localhost:3000/mock-versions/resources/72398245211/1.html" class="">Wednesday, March 20, 2024 at 12:00 AM <br>Lucy Chlorine </li>
   <li tabindex="1" id="10-12" class="">Saturday, November 25, 2023 at 5:56 AM - 6:13 AM <br>Anonymous ...</li>
   <li tabindex="1" data-parent="10-12" class="auditlog-hidden">Saturday, November 25, 2023 at 6:13 AM <br>Anonymous </li>
   <li tabindex="1" data-parent="10-12" class="auditlog-hidden">Saturday, November 25, 2023 at 5:56 AM <br>Anonymous </li>
</div>
*/
/* eslint-enable max-len */

describe('Versions panel', () => {
  it('Render Versions', async () => {
    const dav = new DaVersions();
    dav.path = 'https://admin.da.live/source/da-sites/da-status/tests/versions1.html';

    const storedFetch = window.fetch;
    try {
      window.fetch = mockFetch;

      const html = await dav.renderVersions();

      const div = document.createElement('div');
      render(html, div);

      const lis = div.querySelectorAll('li');
      expect(lis.length).to.equal(13);
      lis.forEach((l) => expect(l.getAttribute('tabindex')).to.equal('1'));

      expect(sn(lis[0])).to.equal('Thursday, March 21, 2024 at 4:45 PM <br>Joe Bloggs');
      expect(sn(lis[1])).to.equal('Thursday, March 21, 2024 at 4:11 PM <br>Joe Bloggs');
      expect(lis[1].dataset.href).to.equal('http://localhost:3000/mock-versions/resources/72398245211/3.html');
      expect(sn(lis[2])).to.equal('Thursday, March 21, 2024 at 4:06 PM - 4:11 PM <br>Melinda Vertex, Joe Bloggs, Eric Idle, Anonymous ...');
      expect(lis[2].id).to.equal('2-5');
      expect(sn(lis[3])).to.equal('Thursday, March 21, 2024 at 4:11 PM <br>Melinda Vertex, Joe Bloggs');
      expect(lis[3].dataset.parent).to.equal('2-5');
      expect(sn(lis[4])).to.equal('Thursday, March 21, 2024 at 4:10 PM <br>Eric Idle');
      expect(lis[4].dataset.parent).to.equal('2-5');
      expect(sn(lis[5])).to.equal('Thursday, March 21, 2024 at 4:06 PM <br>Melinda Vertex, Anonymous');
      expect(lis[5].dataset.parent).to.equal('2-5');
      expect(sn(lis[6])).to.equal('Wednesday, March 20, 2024 at 5:25 AM - 5:33 AM <br>Melinda Vertex ...');
      expect(lis[6].id).to.equal('6-8');
      expect(sn(lis[7])).to.equal('Wednesday, March 20, 2024 at 5:33 AM <br>Melinda Vertex');
      expect(lis[7].dataset.parent).to.equal('6-8');
      expect(sn(lis[8])).to.equal('Wednesday, March 20, 2024 at 5:25 AM <br>Melinda Vertex');
      expect(lis[8].dataset.parent).to.equal('6-8');
      expect(sn(lis[9])).to.equal('Wednesday, March 20, 2024 at 12:00 AM <br>Lucy Chlorine');
      expect(lis[9].dataset.href).to.equal('http://localhost:3000/mock-versions/resources/72398245211/1.html');
      expect(sn(lis[10])).to.equal('Saturday, November 25, 2023 at 5:56 AM - 6:13 AM <br>Anonymous ...');
      expect(lis[10].id).to.equal('10-12');
      expect(sn(lis[11])).to.equal('Saturday, November 25, 2023 at 6:13 AM <br>Anonymous');
      expect(lis[11].dataset.parent).to.equal('10-12');
      expect(sn(lis[12])).to.equal('Saturday, November 25, 2023 at 5:56 AM <br>Anonymous');
      expect(lis[12].dataset.parent).to.equal('10-12');
    } finally {
      window.fetch = storedFetch;
    }
  });

  it('Render Versions Path not set', async () => {
    const dav = new DaVersions();
    const html = await dav.renderVersions();

    const div = document.createElement('div');
    render(html, div);
    const rendered = scn(div.innerHTML);

    expect(rendered).to.equal('');
  });

  it('Version selected view', async () => {
    const mockPM = {};
    const verSR = { querySelector: (q) => (q === '.ProseMirror' ? mockPM : undefined) };
    const mockVer = {
      style: {},
      shadowRoot: verSR,
    };

    const parentSR = { querySelector: (q) => (q === 'da-version' ? mockVer : undefined) };
    const parent = { shadowRoot: parentSR };

    const dav = new DaVersions();
    dav.path = 'https://admin.da.live/source/da-sites/da-status/tests/versions1.html';
    dav.parent = parent;

    const storedFetch = window.fetch;
    try {
      window.fetch = mockFetch;

      const html = await dav.renderVersions();

      const div = document.createElement('div');
      render(html, div);

      const lis = div.querySelectorAll('li');
      expect(lis.length).to.equal(13);

      // Select element 0 which has no resource and no collapsed children
      await dav.versionSelected({ target: lis[0] });
      expect(mockVer.style.display).to.equal('none');

      // Select element 1 which has a resource
      await dav.versionSelected({ target: lis[1] });
      expect(mockVer.style.display).to.equal('block');
      expect(mockPM.innerHTML).to.equal('<p>Hello there</p>');

      // Element 2 has hidden sub-elements
      expect([...lis[3].classList]).to.contain('auditlog-hidden');
      expect([...lis[4].classList]).to.contain('auditlog-hidden');
      expect([...lis[5].classList]).to.contain('auditlog-hidden');

      // Select it and the subelements should become visible
      await dav.versionSelected({ target: lis[2] });
      expect(mockVer.style.display).to.equal('none');
      expect([...lis[2].classList]).to.contain('auditlog-expanded');
      expect([...lis[3].classList]).to.not.contain('auditlog-hidden');
      expect([...lis[4].classList]).to.not.contain('auditlog-hidden');
      expect([...lis[5].classList]).to.not.contain('auditlog-hidden');
      expect([...lis[3].classList]).to.contain('auditlog-detail');
      expect([...lis[4].classList]).to.contain('auditlog-detail');
      expect([...lis[5].classList]).to.contain('auditlog-detail');

      // Select it again to hide the subelements
      await dav.versionSelected({ target: lis[2] });
      expect(mockVer.style.display).to.equal('none');
      expect([...lis[2].classList]).to.not.contain('auditlog-expanded');
      expect([...lis[3].classList]).to.contain('auditlog-hidden');
      expect([...lis[4].classList]).to.contain('auditlog-hidden');
      expect([...lis[5].classList]).to.contain('auditlog-hidden');
      expect([...lis[3].classList]).to.not.contain('auditlog-detail');
      expect([...lis[4].classList]).to.not.contain('auditlog-detail');
      expect([...lis[5].classList]).to.not.contain('auditlog-detail');
    } finally {
      window.fetch = storedFetch;
    }
  });

  it('Test rendering', async () => {
    const dav = new DaVersions();
    dav.path = 'https://admin.da.live/source/da-sites/da-status/tests/versions1.html';

    const storedFetch = window.fetch;
    try {
      window.fetch = mockFetch;

      const html = dav.render();
      const div = document.createElement('div');
      render(html, div);

      // allow the async rendering to happen on the div
      await wait(100);

      expect(div.innerHTML).to.contain('Melinda Vertex, Joe Bloggs, Eric Idle, Anonymous');
    } finally {
      window.fetch = storedFetch;
    }
  });

  it('Test Hide Versions panel', () => {
    const curVersion = document.createElement('da-version');

    const parent = document.createElement('div');
    parent.classList.add('show-versions');
    const shadowRoot = parent.attachShadow({ mode: 'open' });
    shadowRoot.appendChild(curVersion);

    const dav = new DaVersions();
    dav.path = 'https://admin.da.live/source/da-sites/da-status/tests/versions1.html';
    dav.parent = parent;
    dav.classList.add('show-versions');

    dav.hideVersions();
    expect(curVersion.style.display).to.equal('none');
    expect(dav.classList.length).to.equal(0);
    expect(parent.classList.length).to.equal(0);
  });
});
