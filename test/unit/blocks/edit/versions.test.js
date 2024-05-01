import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';

import { render } from '../../../../deps/lit/lit-all.min.js';
import DaVersions from '../../../../blocks/edit/da-versions/da-versions.js';

const fetchMap = {
  'https://admin.da.live/versionlist/da-sites/da-status/tests/versions1.html': './versions1.json',
  'https://admin.da.live/mock-versions/resources/72398245211/3.html': './version3.html',
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

      const vgs = div.querySelectorAll('div.version-group');
      expect(vgs.length).to.equal(6);
      expect([...vgs[0].children[0].classList]).to.deep.equal(['bullet', 'bullet-audit-first']);
      expect(vgs[0].children[1].innerText.trim().split('\n')[0]).to.equal('March 21st');
      const aes = vgs[0].querySelectorAll('div.audit-entry');
      expect(aes.length).to.equal(1);
      expect(aes[0].querySelector('.entry-time').innerText).to.equal('4:45:08 PM');
      expect(aes[0].querySelector('.user-list').innerText).to.equal('jbloggs@acme.com');

      /* TODO finish the detail of this test for the other entries
      expect(sn(vgs[0])).to.equal('Thursday, March 21, 2024 at 4:45 PM <br>jbloggs@acme.com');
      expect(sn(vgs[1])).to.equal('Thursday, March 21, 2024 at 4:11 PM <br>jbloggs@acme.com');
      expect(vgs[1].dataset.href).to.equal('https://admin.da.live/mock-versions/resources/72398245211/3.html');
      expect(sn(vgs[2])).to.equal('Thursday, March 21, 2024 at 4:06 PM - 4:10 PM <br>mvertex@acme.com, jbloggs@acme.com, ericidle@acme.com, anonymous ...');
      expect(vgs[2].id).to.equal('2-5');
      expect(sn(vgs[3])).to.equal('Thursday, March 21, 2024 at 4:10 PM <br>mvertex@acme.com, jbloggs@acme.com');
      expect(vgs[3].dataset.parent).to.equal('2-5');
      expect(sn(vgs[4])).to.equal('Thursday, March 21, 2024 at 4:10 PM <br>ericidle@acme.com');
      expect(vgs[4].dataset.parent).to.equal('2-5');
      expect(sn(vgs[5])).to.equal('Thursday, March 21, 2024 at 4:06 PM <br>mvertex@acme.com, anonymous');
      expect(vgs[5].dataset.parent).to.equal('2-5');
      expect(sn(vgs[6])).to.equal('Wednesday, March 20, 2024 at 5:25 AM - 5:33 AM <br>mvertex@acme.com ...');
      expect(vgs[6].id).to.equal('6-8');
      expect(sn(vgs[7])).to.equal('Wednesday, March 20, 2024 at 5:33 AM <br>mvertex@acme.com');
      expect(vgs[7].dataset.parent).to.equal('6-8');
      expect(sn(vgs[8])).to.equal('Wednesday, March 20, 2024 at 5:25 AM <br>mvertex@acme.com');
      expect(vgs[8].dataset.parent).to.equal('6-8');
      expect(sn(vgs[9])).to.equal('Wednesday, March 20, 2024 at 12:00 AM <br>lchl@acme.com');
      expect(vgs[9].dataset.href).to.equal('https://admin.da.live/mock-versions/resources/72398245211/1.html');
      expect(sn(vgs[10])).to.equal('Saturday, November 25, 2023 at 5:56 AM - 6:13 AM <br>anonymous ...');
      expect(vgs[10].id).to.equal('10-12');
      expect(sn(vgs[11])).to.equal('Saturday, November 25, 2023 at 6:13 AM <br>anonymous');
      expect(vgs[11].dataset.parent).to.equal('10-12');
      expect(sn(vgs[12])).to.equal('Saturday, November 25, 2023 at 5:56 AM <br>anonymous');
      expect(vgs[12].dataset.parent).to.equal('10-12');
      */
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

  /* TODO re-enable tests
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

      expect(div.innerHTML).to.contain('mvertex@acme.com, jbloggs@acme.com, ericidle@acme.com, anonymous');
    } finally {
      window.fetch = storedFetch;
    }
  }); */

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
