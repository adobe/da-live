import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  buildMetadataFields,
  resolveMetadataFields,
  formatJsonValue,
  compactJsonValue,
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

  it('defaults type to single, honors type=multi and type=json', () => {
    const rows = [
      { blocks: 'metadata', key: 'category' },
      { blocks: 'metadata', key: 'tags', type: 'multi' },
      { blocks: 'metadata', key: 'json-ld', type: 'JSON' },
    ];
    const fields = buildMetadataFields(rows);
    expect(fields.find((f) => f.key === 'category').type).to.equal('single');
    expect(fields.find((f) => f.key === 'tags').type).to.equal('multi');
    expect(fields.find((f) => f.key === 'json-ld').type).to.equal('json');
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

describe('resolveMetadataFields', () => {
  it('falls back to Title/Description text fields when no config is present', () => {
    const fields = resolveMetadataFields([], []);
    expect(fields.map((f) => f.key)).to.deep.equal(['Title', 'Description']);
    expect(fields.every((f) => f.type === 'single' && f.values === null)).to.equal(true);
  });

  it('pre-fills fallback fields from the current doc value, case-insensitively', () => {
    const docRows = [{ key: 'title', value: 'My Page' }];
    const fields = resolveMetadataFields(docRows, []);
    expect(fields.find((f) => f.key === 'Title').value).to.equal('My Page');
    expect(fields.find((f) => f.key === 'Description').value).to.equal('');
  });

  it('uses only configured fields when config is present', () => {
    const configured = [{ key: 'category', label: 'Category', type: 'single', values: null }];
    const fields = resolveMetadataFields([], configured);
    expect(fields.map((f) => f.key)).to.deep.equal(['category']);
  });

  it('pre-fills a configured field from the doc, case-insensitively', () => {
    const configured = [{ key: 'category', label: 'Category', type: 'single', values: null }];
    const docRows = [{ key: 'Category', value: 'News' }];
    expect(resolveMetadataFields(docRows, configured).find((f) => f.key === 'category').value).to.equal('News');
  });

  it('appends doc keys that are not present in the config as plain text fields', () => {
    const configured = [{ key: 'category', label: 'Category', type: 'single', values: null }];
    const docRows = [
      { key: 'Category', value: 'News' },
      { key: 'legacy-flag', value: 'yes' },
    ];
    const fields = resolveMetadataFields(docRows, configured);
    expect(fields.map((f) => f.key)).to.deep.equal(['category', 'legacy-flag']);
    expect(fields.find((f) => f.key === 'legacy-flag')).to.deep.equal({
      key: 'legacy-flag',
      label: 'legacy-flag',
      type: 'single',
      values: null,
      value: 'yes',
    });
  });

  it('uses configured Title/Description as-is when they are explicitly configured', () => {
    const configured = buildMetadataFields([
      { blocks: 'metadata', key: 'title', type: 'multi', values: 'A=a', label: 'Page Title' },
      { blocks: 'metadata', key: 'description', label: 'Summary' },
    ]);
    const fields = resolveMetadataFields([], configured);
    expect(fields.map((f) => f.key)).to.deep.equal(['title', 'description']);
    expect(fields.find((f) => f.key === 'title')).to.deep.include({ label: 'Page Title', type: 'multi' });
    expect(fields.find((f) => f.key === 'description').label).to.equal('Summary');
  });
});

describe('JSON value formatting', () => {
  it('pretty-prints valid JSON for editing', () => {
    expect(formatJsonValue('{"@type":"Article","name":"A"}'))
      .to.equal('{\n  "@type": "Article",\n  "name": "A"\n}');
  });

  it('leaves invalid or empty JSON untouched for editing', () => {
    expect(formatJsonValue('{broken')).to.equal('{broken');
    expect(formatJsonValue('')).to.equal('');
  });

  it('compacts valid JSON to a single line for storage', () => {
    expect(compactJsonValue('{\n  "@type": "Article",\n  "name": "A"\n}'))
      .to.equal('{"@type":"Article","name":"A"}');
  });

  it('keeps invalid JSON as typed, collapsing line breaks', () => {
    expect(compactJsonValue('{\n  broken\n}')).to.equal('{ broken }');
    expect(compactJsonValue('')).to.equal('');
  });
});
