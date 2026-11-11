import sinon from 'sinon';

export const parseSubdomain = sinon.stub();
export const getCreateSiteHref = sinon.stub().returns('/start');
export const getSiteOptions = sinon.stub().returns([]);
