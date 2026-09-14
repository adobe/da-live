import { expect } from '@esm-bundle/chai';
import {
  saveOffer,
  getOffer,
  deleteOffer,
  getAccessToken,
} from '../../../../../../../blocks/edit/da-prepare/actions/target/api.js';

describe('target/api', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  const config = { tenant: 'tenant', token: 'tok', clientId: 'cid' };

  describe('saveOffer', () => {
    it('POSTs to create and returns success/offerId', async () => {
      let captured;
      window.fetch = (url, opts) => {
        captured = { url, opts };
        return Promise.resolve(new Response('{"id":"new-id"}', { status: 200 }));
      };
      const result = await saveOffer(
        config,
        'My Offer',
        '<p>hello</p>',
        'https://main--repo--org.aem.page/path',
        'Joe',
      );
      expect(result.success).to.equal('Created!');
      expect(result.offerId).to.equal('new-id');
      expect(captured.opts.method).to.equal('POST');
      expect(captured.url).to.contain('/cors?url=');
      const body = JSON.parse(captured.opts.body);
      expect(body.name).to.equal('My Offer');
      expect(body.marketingCloudMetadata.editURL).to.equal(
        'https://da.live/edit#/org/repo/path',
      );
      expect(body.marketingCloudMetadata['aem.lastUpdatedBy']).to.equal('Joe');
    });

    it('PUTs to update when offerId is provided', async () => {
      let captured;
      window.fetch = (url, opts) => {
        captured = { url, opts };
        return Promise.resolve(new Response('{"id":"oid"}', { status: 200 }));
      };
      const result = await saveOffer(config, 'n', 'c', 'https://main--r--o.aem.page/p', 'd', 'oid');
      expect(captured.opts.method).to.equal('PUT');
      expect(result.success).to.equal('Updated!');
    });

    it('Returns the error text when not ok', async () => {
      window.fetch = () => Promise.resolve(new Response('boom', { status: 400 }));
      const result = await saveOffer(config, 'n', 'c', 'https://main--r--o.aem.page/p', 'd');
      expect(result.error).to.equal('boom');
    });
  });

  describe('getOffer', () => {
    it('Returns id and name on success', async () => {
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({ id: 'oid', name: 'Hi' }),
        { status: 200 },
      ));
      const result = await getOffer(config, 'oid');
      expect(result).to.deep.equal({ id: 'oid', name: 'Hi' });
    });

    it('Returns notFound on 404', async () => {
      window.fetch = () => Promise.resolve(new Response('{}', { status: 404 }));
      const result = await getOffer(config, 'oid');
      expect(result).to.deep.equal({ error: 'Offer not found.', notFound: true });
    });

    it('Surfaces a structured error message on other failures', async () => {
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({ errors: [{ message: 'bad' }] }),
        { status: 500 },
      ));
      const result = await getOffer(config, 'oid');
      expect(result.error).to.equal('bad');
    });

    it('Falls back to a generic message when the body has no errors', async () => {
      window.fetch = () => Promise.resolve(new Response('{}', { status: 500 }));
      const result = await getOffer(config, 'oid');
      expect(result.error).to.contain('Unknown error - 500');
    });
  });

  describe('deleteOffer', () => {
    it('Returns success on ok', async () => {
      window.fetch = () => Promise.resolve(new Response('{}', { status: 200 }));
      const result = await deleteOffer(config, 'oid');
      expect(result).to.deep.equal({ success: 'Deleted successfully.' });
    });

    it('Returns notFound on 404', async () => {
      window.fetch = () => Promise.resolve(new Response('{}', { status: 404 }));
      const result = await deleteOffer(config, 'oid');
      expect(result.notFound).to.be.true;
    });

    it('Surfaces a structured error message on failures', async () => {
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({ errors: [{ message: 'nope' }] }),
        { status: 500 },
      ));
      const result = await deleteOffer(config, 'oid');
      expect(result.error).to.equal('nope');
    });
  });

  describe('getAccessToken', () => {
    it('Returns token on success', async () => {
      let captured;
      window.fetch = (url, opts) => {
        captured = { url, opts };
        return Promise.resolve(new Response('{"access_token":"abc"}', { status: 200 }));
      };
      const result = await getAccessToken('cid', 'csecret');
      expect(result).to.deep.equal({ token: 'abc' });
      expect(captured.opts.method).to.equal('POST');
      const body = captured.opts.body.toString();
      expect(body).to.contain('client_id=cid');
      expect(body).to.contain('client_secret=csecret');
    });

    it('Returns an error on failure', async () => {
      window.fetch = () => Promise.resolve(new Response('boom', { status: 401 }));
      const result = await getAccessToken('cid', 'csecret');
      expect(result.error).to.contain('401');
      expect(result.error).to.contain('boom');
    });
  });
});
