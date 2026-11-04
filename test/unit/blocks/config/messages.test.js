import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import {
  reason, failure, plural, SHELL, INHERITANCE, VALIDATION, IMPORT, ROWS,
} from '../../../../blocks/config/messages.js';

// Every string (or string-returning function) in a message group, flattened with its path.
const strings = (group, path = '') => Object.entries(group).flatMap(([key, value]) => {
  const at = `${path}${key}`;
  if (typeof value === 'string') return [[at, value]];
  if (typeof value === 'function') {
    // Sample arguments: a word, or a list where the message takes one.
    const out = value(/builtIns|names/.test(String(value)) ? ['X', 'Y'] : 'X', 1, 2);
    return typeof out === 'string' ? [[at, out]] : [];
  }
  return strings(value, `${at}.`);
});

describe('config messages', () => {
  it('explains a failure by HTTP status, then network error', () => {
    expect(reason({ status: 500 })).to.equal(500);
    expect(reason({ httpStatus: 404 })).to.equal(404);
    expect(reason({ status: 0, error: 'Failed to fetch' })).to.equal('Failed to fetch');
    expect(reason({ status: 'error', httpStatus: 503 })).to.equal(503);
    expect(reason({ status: 'error' })).to.equal('network error');
    expect(reason()).to.equal('network error');
  });

  it('words every failure the same way', () => {
    expect(failure('save changes', { status: 500 })).to.equal('Could not save changes (500).');
    expect(SHELL.saveFailed({ status: 0 })).to.equal('Could not save changes (network error).');
    expect(SHELL.loadFailed({ httpStatus: 403 })).to.equal('Could not load configuration (403).');
    expect(IMPORT.listFailed({ status: 0 })).to.equal('Could not update the blocks list (network error).');
    expect(IMPORT.readRepoFailed({ status: 404 })).to.equal('Could not read the repository (404).');
  });

  it('writes validation messages as full sentences that say what to do', () => {
    const bad = strings(VALIDATION).filter(([, text]) => !/^[A-Z].*\.$/.test(text));
    expect(bad).to.deep.equal([]);
  });

  it('picks a or an in the empty hint', () => {
    expect([ROWS.emptyHint('block'), ROWS.emptyHint('icon'), ROWS.emptyHint('app')])
      .to.deep.equal(['Add a block to get started.', 'Add an icon to get started.', 'Add an app to get started.']);
  });

  it('pluralizes counts', () => {
    expect([plural(1, 'change'), plural(0, 'change')]).to.deep.equal(['1 change', '0 changes']);
    expect([SHELL.unsavedCount(1), SHELL.unsavedCount(2)]).to.deep.equal(['1 unsaved change', '2 unsaved changes']);
  });

  it('words URL-or-path errors one way, with an optional example', () => {
    expect(VALIDATION.urlOrPath()).to.equal('Enter a URL or a site path.');
    expect(VALIDATION.urlOrPath('/tools/x.html')).to.equal('Enter a URL or a site path, e.g. /tools/x.html.');
  });

  it('reuses one sentence for created documents, with or without the list', () => {
    const text = (template) => {
      const el = document.createElement('div');
      render(template, el);
      return el.textContent.replace(/\s+/g, ' ').trim();
    };
    expect(text(IMPORT.created(1, '/b/', null))).to.equal('Created 1 block document in /b/.');
    expect(text(IMPORT.created(2, '/b/', '/b.json'))).to.equal('Created 2 block documents in /b/ and added them to /b.json.');
    expect(text(INHERITANCE.inheritedValue('x'))).to.equal(`${INHERITANCE.inheritedPill}: x`);
  });
});
