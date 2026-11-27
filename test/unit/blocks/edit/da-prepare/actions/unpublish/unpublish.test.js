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
  it('requires exact YES and shows inline feedback until input is corrected or cleared', async () => {
    const el = makeUnpublish({ fullpath: '/org/site/testpublishing.html' });
    document.body.appendChild(el);

    try {
      await el.updateComplete;
      const input = el.shadowRoot.querySelector('input.nx-input');
      const error = el.shadowRoot.querySelector('#confirm-error');
      const button = el.shadowRoot.querySelector('sl-button');
      const typeInto = async (value) => {
        input.value = value;
        input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
        await el.updateComplete;
      };

      expect(button.hasAttribute('disabled')).to.equal(true);
      expect(error.textContent).to.equal('');
      expect(input.getAttribute('aria-invalid')).to.equal('false');

      await typeInto('yes');
      expect(input.value).to.equal('yes');
      expect(button.hasAttribute('disabled')).to.equal(true);
      expect(input.getAttribute('aria-invalid')).to.equal('true');
      expect(error.textContent).to.equal('Type YES in uppercase.');
      expect(input.getAttribute('aria-describedby')).to.equal(error.id);
      expect(input.closest('.nx-field-error')).to.not.equal(null);

      await typeInto('YE');
      expect(button.hasAttribute('disabled')).to.equal(true);
      expect(input.getAttribute('aria-invalid')).to.equal('false');
      expect(input.hasAttribute('aria-describedby')).to.equal(false);
      expect(error.textContent).to.equal('');

      await typeInto('YES');
      expect(button.hasAttribute('disabled')).to.equal(false);
      expect(input.getAttribute('aria-invalid')).to.equal('false');
      expect(input.hasAttribute('aria-describedby')).to.equal(false);
      expect(error.textContent).to.equal('');
      expect(input.closest('.nx-field-error')).to.equal(null);

      await typeInto('');
      expect(button.hasAttribute('disabled')).to.equal(true);
      expect(input.getAttribute('aria-invalid')).to.equal('false');
      expect(error.textContent).to.equal('');
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
