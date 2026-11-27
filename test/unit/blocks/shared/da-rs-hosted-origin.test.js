import { expect } from '@esm-bundle/chai';
import { getDaAdmin, getDaAdminEnvironment, isAllowedDaAdminOrigin } from '../../../../blocks/shared/constants.js';

const BACKEND = 'https://da-rs-ns-team-aem-cm-prd-n147252.corp.ethos14-prod-gbr9.ethos.adobe.net';

describe('hosted demo backend trust', () => {
  let href;
  let previous;
  beforeEach(() => {
    href = window.location.href;
    previous = localStorage.getItem('da-admin');
  });
  afterEach(() => {
    window.history.replaceState(null, '', href);
    if (previous === null) localStorage.removeItem('da-admin');
    else localStorage.setItem('da-admin', previous);
  });

  it('uses the trusted service for the exact preview and loopback when explicitly selected', () => {
    const preview = new URL('https://rspoc--da-live--adobe.aem.page/?da-source=da-rs&da-admin=rspoc');
    const local = new URL('http://localhost:3001/?da-source=da-rs&da-admin=rspoc');
    expect(getDaAdmin(preview)).to.equal(BACKEND);
    expect(getDaAdmin(local)).to.equal(BACKEND);
    expect(getDaAdminEnvironment(BACKEND)).to.equal('rspoc');
    window.history.replaceState(null, '', '/?da-source=da-rs');
    expect(isAllowedDaAdminOrigin(BACKEND)).to.equal(true);
  });

  it('pins the selected hosted preview to the trusted service even with an explicit stale env', () => {
    const preview = new URL('https://rspoc--da-live--adobe.aem.page/?da-source=da-rs&da-admin=local');
    expect(getDaAdmin(preview)).to.equal(BACKEND);
  });

  it('preserves the existing local backend selection', () => {
    const local = new URL('http://localhost:3001/?da-source=da-rs&da-admin=local');
    expect(getDaAdmin(local)).to.equal('http://localhost:8787');
  });

  it('does not trust or persist the service selection on other hosted origins', () => {
    localStorage.removeItem('da-admin');
    const other = new URL('https://da.live/?da-source=da-rs&da-admin=rspoc');
    expect(getDaAdmin(other)).to.equal(undefined);
    expect(localStorage.getItem('da-admin')).to.equal(null);
    window.history.replaceState(null, '', '/?da-source=hosted');
    expect(isAllowedDaAdminOrigin(BACKEND)).to.equal(false);
  });
});
