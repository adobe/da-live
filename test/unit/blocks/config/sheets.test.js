import { expect } from '@esm-bundle/chai';
import { getValue, applyValues, getRows, setRows, firstSheetName } from '../../../../blocks/config/sheets.js';

describe('config sheets', () => {
  describe('sheet values', () => {
    const counted = (data) => ({ total: data.length, limit: data.length, offset: 0, data });
    const single = (data) => ({ ...counted(data), ':sheetname': 'data', ':type': 'sheet' });
    const multi = (sheets) => ({
      ...Object.fromEntries(Object.entries(sheets).map(([n, data]) => [n, counted(data)])),
      ':names': Object.keys(sheets),
      ':version': 3,
      ':type': 'multi-sheet',
    });
    const PERMS = [{ path: 'CONFIG', groups: 'a@b.com', actions: 'write' }];

    it('reads from the data sheet', () => {
      expect(getValue(single([{ key: 'k', value: 'v' }]), 'k', 'data')).to.equal('v');
      expect(getValue(multi({ permissions: PERMS, data: [{ key: 'k', value: 'v' }] }), 'k', 'data')).to.equal('v');
      expect(getValue(multi({ flags: [{ key: 'k', value: 'f' }] }), 'k', 'data')).to.equal('');
      expect(getValue({ ...single([{ key: 'k', value: 'v' }]), ':sheetname': 'flags' }, 'k', 'data')).to.equal('');
      expect(getValue(null, 'k', 'data')).to.equal('');
    });

    it('creates a single data sheet when there is no config yet', () => {
      const { config, changed } = applyValues(null, { k: 'v' }, 'data');
      expect(changed).to.equal(true);
      expect(config).to.deep.equal({ ...single([{ key: 'k', value: 'v' }]), total: 1, limit: 1 });
    });

    it('updates in place, keeps other columns and order, and removes on empty', () => {
      const json = single([{ key: 'a', value: '1', note: 'x' }, { key: 'b', value: '2' }]);
      const { config } = applyValues(json, { a: '9', b: '' }, 'data');
      expect(config.data).to.deep.equal([{ key: 'a', value: '9', note: 'x' }]);
      expect([config.total, config.limit]).to.deep.equal([1, 1]);
      expect(json.data).to.have.length(2);
    });

    it('collapses duplicate rows for a key it writes', () => {
      const { config } = applyValues(single([{ key: 'a', value: '1' }, { key: 'a', value: '2' }]), { a: '3' }, 'data');
      expect(config.data).to.deep.equal([{ key: 'a', value: '3' }]);
    });

    it('reports no change when values already match', () => {
      const json = single([{ key: 'a', value: '1' }]);
      expect(applyValues(json, { a: '1', missing: '' }, 'data')).to.deep.equal({ config: json, changed: false });
    });

    it('writes to a key/value first sheet and leaves other sheets alone', () => {
      const { config } = applyValues(multi({ data: [], permissions: PERMS }), { k: 'v' }, 'data');
      expect(config.data.data).to.deep.equal([{ key: 'k', value: 'v' }]);
      expect(config.permissions.data).to.deep.equal(PERMS);
      expect(config[':names']).to.deep.equal(['data', 'permissions']);
    });

    it('writes to the data sheet and keeps the sheet order', () => {
      const flags = [{ key: 'ew.enabled', value: 'true' }];
      const { config } = applyValues(multi({ flags, data: [{ key: 'x', value: '1' }] }), { k: 'v' }, 'data');
      expect(config[':names']).to.deep.equal(['flags', 'data']);
      expect(config.data.data).to.deep.equal([{ key: 'x', value: '1' }, { key: 'k', value: 'v' }]);
      expect(config.flags.data).to.deep.equal(flags);
    });

    it('adds a missing data sheet first', () => {
      const { config } = applyValues(multi({ permissions: PERMS }), { k: 'v' }, 'data');
      expect(config[':names']).to.deep.equal(['data', 'permissions']);
      expect(config.data.data).to.deep.equal([{ key: 'k', value: 'v' }]);
    });

    it('reads and writes another named sheet, adding it after data', () => {
      const json = single([{ key: 'aem.repositoryId', value: 'x' }]);
      expect(getValue(json, 'ew.enabled', 'flags')).to.equal('');
      const { config } = applyValues(json, { 'ew.enabled': 'true' }, 'flags');
      expect(config[':names']).to.deep.equal(['data', 'flags']);
      expect(config.data.data).to.deep.equal([{ key: 'aem.repositoryId', value: 'x' }]);
      expect(getValue(config, 'ew.enabled', 'flags')).to.equal('true');
      expect(getValue(config, 'ew.enabled', 'data')).to.equal('');
    });

    it('creates a multi-sheet with a named flags sheet when there is no config yet', () => {
      const { config } = applyValues(null, { 'ew.enabled': 'true' }, 'flags');
      expect(config[':type']).to.equal('multi-sheet');
      expect(config[':names']).to.deep.equal(['flags']);
      expect(getValue(config, 'ew.enabled', 'flags')).to.equal('true');
    });

    it('replaces the rows of a named sheet, and reports no change for the same rows', () => {
      const rows = [{ title: 'Rollout', path: 'https://x.com/r.html' }];
      const { config, changed } = setRows(single([{ key: 'k', value: 'v' }]), rows, 'prepare');
      expect(changed).to.equal(true);
      expect(config[':names']).to.deep.equal(['data', 'prepare']);
      expect(getRows(config, 'prepare')).to.deep.equal(rows);
      expect([config.prepare.total, config.prepare.limit]).to.deep.equal([1, 1]);
      expect(setRows(config, rows, 'prepare')).to.deep.equal({ config, changed: false });
    });

    it('turns a single sheet that is not data into a multi-sheet with data first', () => {
      const json = { ...single(PERMS), ':sheetname': 'permissions' };
      const { config } = applyValues(json, { k: 'v' }, 'data');
      expect(config[':type']).to.equal('multi-sheet');
      expect(config[':names']).to.deep.equal(['data', 'permissions']);
      expect(config.permissions.data).to.deep.equal(PERMS);
      expect(getValue(config, 'k', 'data')).to.equal('v');
    });
  });

  describe('content files', () => {
    it('names the first sheet of a content file', () => {
      expect(firstSheetName({ ':type': 'multi-sheet', ':names': ['blocks', 'options'] })).to.equal('blocks');
      expect(firstSheetName({ ':type': 'sheet', ':sheetname': 'placeholders' })).to.equal('placeholders');
      expect(firstSheetName({ data: [] })).to.equal('data');
      expect(firstSheetName(null)).to.equal('data');
    });
  });
});
