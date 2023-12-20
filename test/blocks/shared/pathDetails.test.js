import { expect } from '@esm-bundle/chai';
import '../../milo.js';

// Dynamic import because Milo need
const { default: getPathDetails } = await import('../../../blocks/shared/pathDetails.js');

describe('Path details', () => {
  describe('Full path details', () => {
    describe('HTML path details', () => {
      const loc = { pathname: '/edit', hash: '#/adobe/aem-boilerplate/cool/page' };
      const details = getPathDetails(loc);
      expect(details.origin).to.equal('http://localhost:8787');
      expect(details.owner).to.equal('adobe');
      expect(details.repo).to.equal('aem-boilerplate');
      expect(details.fullpath).to.equal('/adobe/aem-boilerplate/cool/page');
      expect(details.sourceUrl).to.equal('http://localhost:8787/source/adobe/aem-boilerplate/cool/page.html');
      expect(details.contentUrl).to.equal('https://content.da.live/adobe/aem-boilerplate/cool/page');
      expect(details.previewUrl).to.equal('https://main--aem-boilerplate--adobe.hlx.page/cool/page');
    });

    describe('JSON path details', () => {
      const loc = { pathname: '/sheet', hash: '#/adobe/aem-boilerplate/cool/data' };
      const details = getPathDetails(loc);
      expect(details.sourceUrl).to.equal('http://localhost:8787/source/adobe/aem-boilerplate/cool/data.json');
      expect(details.contentUrl).to.equal('https://content.da.live/adobe/aem-boilerplate/cool/data.json');
    });

    describe('JPG path details', () => {
      const loc = { pathname: '/view', hash: '#/adobe/aem-boilerplate/cool/pic.jpg' };
      const details = getPathDetails(loc);
      expect(details.sourceUrl).to.equal('http://localhost:8787/source/adobe/aem-boilerplate/cool/pic.jpg');
    });

    describe('Top level path details', () => {
      const loc = { pathname: '/view', hash: '#/adobe/aem-boilerplate/pic.jpg' };
      const details = getPathDetails(loc);
      expect(details.parentName).to.equal('aem-boilerplate');
      expect(details.previewUrl).to.equal('https://main--aem-boilerplate--adobe.hlx.page/pic.jpg');
    });
  });

  describe('Repo only path details', () => {
    describe('Path details', () => {
      const loc = { hash: '#/adobe/aem-boilerplate' };
      const details = getPathDetails(loc);
      expect(details.previewUrl).to.equal('https://main--aem-boilerplate--adobe.hlx.page');
    });
  });

  describe('Owner only path details', () => {
    describe('Path details', () => {
      const loc = { hash: '#/adobe' };
      const details = getPathDetails(loc);
      expect(details.previewUrl).to.not.exist;
    });
  });

  describe('IMS callback path details', () => {
    describe('Path details', () => {
      const loc = { hash: '#old_hash' };
      const details = getPathDetails(loc);
      expect(details).to.be.null;
    });
  });

  describe('IMS callback path details', () => {
    describe('Path details', () => {
      const details = getPathDetails();
      expect(details).to.be.null;
    });
  });
});
