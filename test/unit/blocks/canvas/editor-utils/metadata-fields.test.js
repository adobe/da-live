import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  buildMetadataFields,
  mergeMetadataFields,
} = await import('../../../../../blocks/canvas/editor-utils/metadata-fields.js');

describe('buildMetadataFields', () => {
  it('returns an empty array for no data', () => {
    expect(buildMetadataFields()).to.deep.equal([]);
    expect(buildMetadataFields([])).to.deep.equal([]);
  });

  it('filters out rows for other blocks', () => {
    const rows = [
      { blocks: 'cards', key: 'columns', values: '2|3' },
      { blocks: 'metadata', key: 'theme', values: 'Dark=dark|Light=light' },
    ];
    const fields = buildMetadataFields(rows);
    expect(fields.map((f) => f.key)).to.deep.equal(['theme']);
  });

  it('matches a comma-separated blocks column that includes metadata', () => {
    const rows = [{ blocks: 'cards, metadata', key: 'theme', values: 'Dark=dark' }];
    expect(buildMetadataFields(rows).map((f) => f.key)).to.deep.equal(['theme']);
  });

  it('falls back label to key when no label column is given', () => {
    const rows = [{ blocks: 'metadata', key: 'robots' }];
    expect(buildMetadataFields(rows)[0].label).to.equal('robots');
  });

  it('uses the label column when present', () => {
    const rows = [{ blocks: 'metadata', key: 'robots', label: 'Robots Directive' }];
    expect(buildMetadataFields(rows)[0].label).to.equal('Robots Directive');
  });

  it('exposes rawLabel as the explicit label only, undefined when none was given', () => {
    const rows = [
      { blocks: 'metadata', key: 'robots', label: 'Robots Directive' },
      { blocks: 'metadata', key: 'category' },
    ];
    const fields = buildMetadataFields(rows);
    expect(fields.find((f) => f.key === 'robots').rawLabel).to.equal('Robots Directive');
    expect(fields.find((f) => f.key === 'category').rawLabel).to.equal(undefined);
  });

  it('defaults type to single, honors type=multi', () => {
    const rows = [
      { blocks: 'metadata', key: 'category' },
      { blocks: 'metadata', key: 'tags', type: 'multi' },
    ];
    const fields = buildMetadataFields(rows);
    expect(fields.find((f) => f.key === 'category').type).to.equal('single');
    expect(fields.find((f) => f.key === 'tags').type).to.equal('multi');
  });

  it('leaves values null for a plain text field with no values column', () => {
    const rows = [{ blocks: 'metadata', key: 'title' }];
    expect(buildMetadataFields(rows)[0].values).to.equal(null);
  });

  it('parses pipe-delimited values, defaulting a bare value\'s title to itself', () => {
    const rows = [{ blocks: 'metadata', key: 'category', values: 'News|Blog' }];
    expect(buildMetadataFields(rows)[0].values).to.deep.equal([
      { title: 'News', value: 'News' },
      { title: 'Blog', value: 'Blog' },
    ]);
  });

  it('parses label=value pairs', () => {
    const rows = [{ blocks: 'metadata', key: 'theme', values: 'Dark Mode=dark|Light Mode=light' }];
    expect(buildMetadataFields(rows)[0].values).to.deep.equal([
      { title: 'Dark Mode', value: 'dark' },
      { title: 'Light Mode', value: 'light' },
    ]);
  });

  it('flags a hex-color value with colorValue', () => {
    const rows = [{ blocks: 'metadata', key: 'accent', values: 'Adobe Red=#FF0000|Sky=blue' }];
    const { values } = buildMetadataFields(rows)[0];
    expect(values.find((v) => v.title === 'Adobe Red').colorValue).to.equal('#FF0000');
    expect(values.find((v) => v.title === 'Sky').colorValue).to.equal(undefined);
  });
});

describe('mergeMetadataFields', () => {
  it('falls back to Title/Description text fields when no config is present', () => {
    const fields = mergeMetadataFields([], []);
    expect(fields.map((f) => f.key)).to.deep.equal(['Title', 'Description']);
    expect(fields.every((f) => f.type === 'single' && f.values === null)).to.equal(true);
  });

  it('pre-fills default fields from the current doc value, case-insensitively', () => {
    const docRows = [{ key: 'title', value: 'My Page' }];
    const fields = mergeMetadataFields(docRows, []);
    expect(fields.find((f) => f.key === 'Title').value).to.equal('My Page');
    expect(fields.find((f) => f.key === 'Description').value).to.equal('');
  });

  it('always puts Title and Description first, ahead of configured fields', () => {
    const configured = [{ key: 'category', label: 'Category', type: 'single', values: null }];
    const fields = mergeMetadataFields([], configured);
    expect(fields.map((f) => f.key)).to.deep.equal(['Title', 'Description', 'category']);
  });

  it('pre-fills a configured field from the doc, case-insensitively', () => {
    const configured = [{ key: 'category', label: 'Category', type: 'single', values: null }];
    const docRows = [{ key: 'Category', value: 'News' }];
    expect(mergeMetadataFields(docRows, configured).find((f) => f.key === 'category').value).to.equal('News');
  });

  it('appends doc keys not present in Title/Description/config as plain text fields, preserving data', () => {
    const configured = [{ key: 'category', label: 'Category', type: 'single', values: null }];
    const docRows = [
      { key: 'Category', value: 'News' },
      { key: 'legacy-flag', value: 'yes' },
    ];
    const fields = mergeMetadataFields(docRows, configured);
    expect(fields.map((f) => f.key)).to.deep.equal(['Title', 'Description', 'category', 'legacy-flag']);
    const extra = fields.find((f) => f.key === 'legacy-flag');
    expect(extra).to.deep.equal({
      key: 'legacy-flag',
      label: 'legacy-flag',
      type: 'single',
      values: null,
      value: 'yes',
      configured: false,
      removable: true,
    });
  });

  it('marks Title/Description as not removable, and everything else as removable', () => {
    const configured = [{ key: 'category', label: 'Category', type: 'single', values: null }];
    const fields = mergeMetadataFields([{ key: 'extra', value: 'x' }], configured);
    expect(fields.find((f) => f.key === 'Title').removable).to.equal(false);
    expect(fields.find((f) => f.key === 'Description').removable).to.equal(false);
    expect(fields.find((f) => f.key === 'category').removable).to.equal(true);
    expect(fields.find((f) => f.key === 'extra').removable).to.equal(true);
  });

  it('marks Title/Description/configured fields as configured, and passthrough doc fields as not', () => {
    const fields = mergeMetadataFields([{ key: 'extra', value: 'x' }], []);
    expect(fields.find((f) => f.key === 'Title').configured).to.equal(true);
    expect(fields.find((f) => f.key === 'extra').configured).to.equal(false);
  });

  it('keeps Title/Description as plain text fields even if config gives them values/type', () => {
    const configured = buildMetadataFields([
      { blocks: 'metadata', key: 'title', type: 'multi', values: 'A=a' },
    ]);
    const fields = mergeMetadataFields([], configured);
    const title = fields.find((f) => f.key === 'Title');
    expect(title.type).to.equal('single');
    expect(title.values).to.equal(null);
  });

  it('uses the config row\'s explicit label for Title/Description when present', () => {
    const configured = buildMetadataFields([
      { blocks: 'metadata', key: 'title', label: 'Page Title' },
    ]);
    const fields = mergeMetadataFields([], configured);
    expect(fields.find((f) => f.key === 'Title').label).to.equal('Page Title');
    expect(fields.find((f) => f.key === 'Description').label).to.equal('Description');
  });

  it('keeps the default Title/Description label when the config row has no explicit label', () => {
    const configured = buildMetadataFields([{ blocks: 'metadata', key: 'title' }]);
    const fields = mergeMetadataFields([], configured);
    expect(fields.find((f) => f.key === 'Title').label).to.equal('Title');
  });
});
