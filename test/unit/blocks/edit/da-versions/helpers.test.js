import { expect } from '@esm-bundle/chai';
import { formatDate, formatVersions } from '../../../../../blocks/edit/da-versions/helpers.js';

const TIME_OPTS = { hour: 'numeric', minute: '2-digit' };

describe('Versions helper', () => {
  it('Format date', () => {
    const { date: d, time: t } = formatDate(1709205071123);
    expect(d).to.equal('February 29, 2024');
    expect(t).to.equal(new Date(1709205071123).toLocaleTimeString([], TIME_OPTS));
  });

  it('Format date of now', () => {
    let before = formatDate();
    let now = new Date();
    let after = formatDate();

    if (JSON.stringify(before) !== JSON.stringify(after)) {
      // We just hit a point where there is a changeover, so try again
      before = formatDate();
      now = new Date();
      after = formatDate();
    }

    expect(before).to.deep.equal(after);
    const expectedDate = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const expectedTime = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    expect(expectedDate).to.equal(after.date);
    expect(expectedTime).to.equal(after.time);
  });

  it('Format versions', () => {
    const versions = [{
      url: '/versionsource/joey/abc.html',
      users: [{ email: 'anonymous' }],
      timestamp: 1715594886177,
      path: 'da-aem-boilerplate/blah7.html',
    }, {
      users: [{ email: 'furb@acme.com' }, { email: 'anonymous' }],
      timestamp: 1715766906908,
      path: 'da-aem-boilerplate/blah7.html',
    }, {
      users: [{ email: 'anonymous' }],
      timestamp: 1715701875589,
      path: 'da-aem-boilerplate/blah7.html',
    }, {
      users: [{ email: 'joe@acme.com' }],
      timestamp: 1715766405165,
      path: 'da-aem-boilerplate/blah7.html',
    }, {
      url: '/versionsource/joey/ghi.html',
      users: [{ email: 'joe@acme.com' }],
      timestamp: 1715766894180,
      path: 'da-aem-boilerplate/blah7.html',
      label: 'hello',
    }, {
      url: '/versionsource/joey/def.html',
      users: [{ email: 'anonymous' }],
      timestamp: 1715594902707,
      path: 'da-aem-boilerplate/blah7.html',
    }];

    const formatted = formatVersions(versions);

    const expected = [{
      date: 'May 15, 2024',
      audits: [{
        date: 'May 15, 2024',
        time: new Date(1715766906908).toLocaleTimeString([], TIME_OPTS),
        users: [{ email: 'furb@acme.com' }, { email: 'anonymous' }],
        timestamp: 1715766906908,
        path: 'da-aem-boilerplate/blah7.html',
        isVersion: false,
      },
      {
        date: 'May 15, 2024',
        time: new Date(1715766405165).toLocaleTimeString([], TIME_OPTS),
        users: [{ email: 'joe@acme.com' }],
        timestamp: 1715766405165,
        path: 'da-aem-boilerplate/blah7.html',
        isVersion: false,
      }],
    }, {
      date: 'May 15, 2024',
      time: new Date(1715766894180).toLocaleTimeString([], TIME_OPTS),
      url: '/versionsource/joey/ghi.html',
      users: [{ email: 'joe@acme.com' }],
      timestamp: 1715766894180,
      path: 'da-aem-boilerplate/blah7.html',
      label: 'hello',
      isVersion: true,
    }, {
      date: 'May 14, 2024',
      audits: [{
        date: 'May 14, 2024',
        time: new Date(1715701875589).toLocaleTimeString([], TIME_OPTS),
        users: [{ email: 'anonymous' }],
        timestamp: 1715701875589,
        path: 'da-aem-boilerplate/blah7.html',
        isVersion: false,
      }],
    }, {
      date: 'May 13, 2024',
      time: new Date(1715594902707).toLocaleTimeString([], TIME_OPTS),
      url: '/versionsource/joey/def.html',
      users: [{ email: 'anonymous' }],
      timestamp: 1715594902707,
      path: 'da-aem-boilerplate/blah7.html',
      isVersion: true,
    }, {
      date: 'May 13, 2024',
      time: new Date(1715594886177).toLocaleTimeString([], TIME_OPTS),
      url: '/versionsource/joey/abc.html',
      users: [{ email: 'anonymous' }],
      timestamp: 1715594886177,
      path: 'da-aem-boilerplate/blah7.html',
      isVersion: true,
    }];

    expect(formatted).to.deep.equal(expected);
  });
});
