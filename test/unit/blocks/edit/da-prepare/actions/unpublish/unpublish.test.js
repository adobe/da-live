import { expect } from '@esm-bundle/chai';
import { setNx, getNx2Api } from '../../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: renderUnpublish } = await import('../../../../../../../blocks/edit/da-prepare/actions/unpublish/unpublish.js');

function makeUnpublish(details) {
  const el = renderUnpublish(details);
  // Avoid needing a real dialog ancestor for the close dispatch.
  el.dispatchEvent = () => {};
  return el;
}

describe('da-unpublish', () => {
  it('accepts yes in any case with surrounding whitespace and rejects other input', async () => {
    const el = makeUnpublish({ fullpath: '/org/site/page.html' });
    document.body.append(el);
    try {
      await el.updateComplete;
      const input = el.shadowRoot.querySelector('sl-input');
      const button = el.shadowRoot.querySelector('sl-button');
      expect(button.hasAttribute('disabled')).to.equal(true);
      for (const value of ['YES', 'yes', 'YeS', ' yes ', '', 'y', 'no', 'yes please']) {
        input.value = value;
        input.dispatchEvent(new Event('input'));
        await el.updateComplete;
        expect(button.hasAttribute('disabled'), value)
          .to.equal(!['YES', 'yes', 'YeS', ' yes '].includes(value));
      }
    } finally {
      el.remove();
    }
  });

  it('keeps unpublish disabled while working or showing errors even with valid confirmation', async () => {
    const el = makeUnpublish({ fullpath: '/org/site/page.html' });
    el._confirmText = 'yes';
    document.body.append(el);
    try {
      await el.updateComplete;
      const button = el.shadowRoot.querySelector('sl-button');
      expect(button.hasAttribute('disabled')).to.equal(false);
      el._statusText = 'Unpublishing';
      await el.updateComplete;
      expect(button.hasAttribute('disabled')).to.equal(true);
      el._statusText = undefined;
      el._results = ['Couldn\'t unpublish from production.'];
      await el.updateComplete;
      expect(button.hasAttribute('disabled')).to.equal(true);
    } finally {
      el.remove();
    }
  });

  it('Unpublishes HTML pages by their extensionless path', async () => {
    const { aem } = await getNx2Api();
    const origUnPreview = aem.unPreview;
    const origUnPublish = aem.unPublish;
    const unpublished = [];
    aem.unPreview = (path) => {
      unpublished.push(path);
      return { ok: true };
    };
    aem.unPublish = (path) => {
      unpublished.push(path);
      return { ok: true };
    };

    try {
      const el = makeUnpublish({ org: 'org', site: 'site', path: '/testpublishing.html', fullpath: '/org/site/testpublishing.html' });
      await el.handleUnpublish();

      expect(unpublished).to.deep.equal(['/org/site/testpublishing', '/org/site/testpublishing']);
      expect(el._results).to.deep.equal([]);
    } finally {
      aem.unPreview = origUnPreview;
      aem.unPublish = origUnPublish;
    }
  });

  it('Records an error when unpublish fails', async () => {
    const { aem } = await getNx2Api();
    const origUnPreview = aem.unPreview;
    const origUnPublish = aem.unPublish;
    aem.unPreview = () => ({ ok: true });
    aem.unPublish = () => ({ ok: false, status: 404 });

    try {
      const el = makeUnpublish({ org: 'org', site: 'site', path: '/testpublishing.html', fullpath: '/org/site/testpublishing.html' });
      await el.handleUnpublish();

      expect(el._results).to.deep.equal(['Couldn\'t unpublish from production.']);
      expect(el._statusText).to.equal('There was an error');
    } finally {
      aem.unPreview = origUnPreview;
      aem.unPublish = origUnPublish;
    }
  });
});
