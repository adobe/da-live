import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import {
  isEmptyDocumentHtml,
  isStructuredContentHtml,
  loadFormContext as loadFormContextRaw,
} from '../../../../../blocks/form/utils/context.js';

// Default to non-Helix-6 so tests never hit the network probe.
const loadFormContext = (args) => loadFormContextRaw({ isHlx6: () => false, ...args });

// ─── Fixtures ──────────────────────────────────────────────────────────────

const emptyDocHtml = '<body><main><div></div></main></body>';
const docWithContentHtml = '<body><main><div><p>stuff</p></div></main></body>';

function scHtml({ schemaName = 'project', title = 'Hello', name = '<p>Alice</p>', blocks = '' } = {}) {
  return `
    <body>
      <main>
        <div>
          <div class="da-form">
            <div><div><p>x-schema-name</p></div><div><p>${schemaName}</p></div></div>
            <div><div><p>title</p></div><div><p>${title}</p></div></div>
          </div>
          <div class="${schemaName}">
            <div><div><p>name</p></div><div>${name}</div></div>
          </div>
          ${blocks}
        </div>
      </main>
    </body>
  `;
}

const validDetails = {
  owner: 'adobe',
  repo: 'demo',
  fullpath: '/adobe/demo/page.html',
  sourceUrl: 'https://content.example/page.html',
  name: 'page',
};

// ─── Pure detectors ────────────────────────────────────────────────────────

describe('isEmptyDocumentHtml', () => {
  it('returns true for an empty main > div', () => {
    expect(isEmptyDocumentHtml(emptyDocHtml)).to.equal(true);
  });

  it('returns false when the main > div has children', () => {
    expect(isEmptyDocumentHtml(docWithContentHtml)).to.equal(false);
  });

  it('returns false when main > div has only text content', () => {
    expect(isEmptyDocumentHtml('<body><main><div>some text</div></main></body>'))
      .to.equal(false);
  });

  it('returns false when there is no main > div', () => {
    expect(isEmptyDocumentHtml('<body><main></main></body>')).to.equal(false);
    expect(isEmptyDocumentHtml('<body></body>')).to.equal(false);
  });

  it('returns false for non-string input', () => {
    expect(isEmptyDocumentHtml(null)).to.equal(false);
    expect(isEmptyDocumentHtml(undefined)).to.equal(false);
    expect(isEmptyDocumentHtml(42)).to.equal(false);
  });
});

describe('isStructuredContentHtml', () => {
  it('returns true when da-form has title + x-schema-name rows', () => {
    expect(isStructuredContentHtml(scHtml())).to.equal(true);
  });

  it('returns false without a da-form block', () => {
    expect(isStructuredContentHtml(emptyDocHtml)).to.equal(false);
    expect(isStructuredContentHtml(docWithContentHtml)).to.equal(false);
  });

  it('returns false when da-form is missing the x-schema-name row', () => {
    const html = `
      <body><main><div>
        <div class="da-form">
          <div><div><p>title</p></div><div><p>Hello</p></div></div>
        </div>
      </div></main></body>
    `;
    expect(isStructuredContentHtml(html)).to.equal(false);
  });

  it('returns false when da-form is missing the title row', () => {
    const html = `
      <body><main><div>
        <div class="da-form">
          <div><div><p>x-schema-name</p></div><div><p>project</p></div></div>
        </div>
      </div></main></body>
    `;
    expect(isStructuredContentHtml(html)).to.equal(false);
  });

  it('returns false for null / empty / non-string input', () => {
    expect(isStructuredContentHtml(null)).to.equal(false);
    expect(isStructuredContentHtml('')).to.equal(false);
    expect(isStructuredContentHtml(undefined)).to.equal(false);
  });
});

// ─── loadFormContext — full state-machine coverage ─────────────────────────

// Helper: build a stubbed fetchHtml that returns a canned result.
const htmlOk = (html) => async () => ({ html });
const htmlFail = (status) => async () => ({ error: `HTTP ${status}`, status });
const htmlNoStatus = () => async () => ({ error: 'network down' });

// Helper: build a stubbed fetchSchemas. Schemas are returned as an object
// keyed by schemaName (matching production shape).
const schemasOk = (schemas = {}) => async () => schemas;

describe('loadFormContext', () => {
  describe('not a document (non-html path)', () => {
    it('blocks with not-document when fullpath does not end in .html', async () => {
      const result = await loadFormContext({
        details: { ...validDetails, fullpath: '/adobe/demo/folder', sourceUrl: '' },
        fetchHtml: htmlOk(''), // never called
        fetchSchemas: schemasOk({ project: '<schema-html/>' }),
      });
      expect(result.status).to.equal('blocked');
      expect(result.blocker.type).to.equal('not-document');
      // Still surfaces the loaded schemas in withBase for the UI.
      expect(result.schemas).to.deep.equal({ project: '<schema-html/>' });
    });
  });

  describe('load failures', () => {
    it('blocks with no-access on 401 from the source fetch', async () => {
      const result = await loadFormContext({
        details: validDetails,
        fetchHtml: htmlFail(401),
        fetchSchemas: schemasOk(),
      });
      expect(result.status).to.equal('blocked');
      expect(result.blocker.type).to.equal('no-access');
    });

    it('blocks with no-access on 403', async () => {
      const result = await loadFormContext({
        details: validDetails,
        fetchHtml: htmlFail(403),
        fetchSchemas: schemasOk(),
      });
      expect(result.blocker.type).to.equal('no-access');
    });

    it('blocks with not-document on 404', async () => {
      const result = await loadFormContext({
        details: validDetails,
        fetchHtml: htmlFail(404),
        fetchSchemas: schemasOk(),
      });
      expect(result.blocker.type).to.equal('not-document');
    });

    it('blocks with load-failed on 5xx (status carried through)', async () => {
      const result = await loadFormContext({
        details: validDetails,
        fetchHtml: htmlFail(500),
        fetchSchemas: schemasOk(),
      });
      expect(result.blocker.type).to.equal('load-failed');
      expect(result.blocker.status).to.equal(500);
    });

    it('blocks with load-failed (no status) when fetch returns a generic error', async () => {
      const result = await loadFormContext({
        details: validDetails,
        fetchHtml: htmlNoStatus(),
        fetchSchemas: schemasOk(),
      });
      expect(result.blocker.type).to.equal('load-failed');
      expect(result.blocker.status).to.equal(undefined);
    });
  });

  describe('empty document — schema selection routing', () => {
    it('routes to select-schema when the document is empty AND schemas exist', async () => {
      const result = await loadFormContext({
        details: validDetails,
        fetchHtml: htmlOk(emptyDocHtml),
        fetchSchemas: schemasOk({ project: '<schema-html/>' }),
      });
      expect(result.status).to.equal('select-schema');
      expect(Object.keys(result.schemas)).to.deep.equal(['project']);
    });

    it('routes to no-schemas when the document is empty AND no schemas exist', async () => {
      const result = await loadFormContext({
        details: validDetails,
        fetchHtml: htmlOk(emptyDocHtml),
        fetchSchemas: schemasOk({}),
      });
      expect(result.status).to.equal('no-schemas');
    });
  });

  describe('non-form content', () => {
    it('blocks with not-form-content when HTML lacks a da-form block', async () => {
      const result = await loadFormContext({
        details: validDetails,
        fetchHtml: htmlOk(docWithContentHtml),
        fetchSchemas: schemasOk({ project: '<schema-html/>' }),
      });
      expect(result.status).to.equal('blocked');
      expect(result.blocker.type).to.equal('not-form-content');
    });
  });

  describe('schema-name mismatches', () => {
    it('blocks with missing-schema when the document references a schema that is not in the registry', async () => {
      const result = await loadFormContext({
        details: validDetails,
        fetchHtml: htmlOk(scHtml({ schemaName: 'unknown-schema' })),
        fetchSchemas: schemasOk({ project: '<schema-html/>' }), // 'unknown-schema' not present
      });
      expect(result.status).to.equal('blocked');
      expect(result.blocker.type).to.equal('missing-schema');
      expect(result.blocker.schemaName).to.equal('unknown-schema');
      // The parsed JSON is still surfaced so the UI can render diagnostics.
      expect(result.json?.metadata?.schemaName).to.equal('unknown-schema');
    });
  });

  describe('happy path', () => {
    it("returns status='ready' with the loaded schema + json when everything resolves", async () => {
      const schemaHtml = '<schema-html/>';
      const result = await loadFormContext({
        details: validDetails,
        fetchHtml: htmlOk(scHtml({ schemaName: 'project' })),
        fetchSchemas: schemasOk({ project: schemaHtml }),
      });
      expect(result.status).to.equal('ready');
      expect(result.schemaName).to.equal('project');
      expect(result.schema).to.equal(schemaHtml);
      expect(result.json?.metadata?.schemaName).to.equal('project');
      expect(result.json?.data?.name).to.equal('Alice');
    });
  });

  describe('rich text', () => {
    it('reads the markup from its own block without the schema', async () => {
      const html = scHtml({
        name: '<p>self://rich-text#name-1</p>',
        blocks: '<div class="name name-1"><div><div><p>Hi <strong>Alice</strong></p></div></div></div>',
      });
      const result = await loadFormContext({
        details: validDetails,
        fetchHtml: htmlOk(html),
        fetchSchemas: schemasOk({ project: { type: 'object' } }),
      });
      expect(result.status).to.equal('ready');
      expect(result.json?.data?.name).to.equal('<p>Hi <strong>Alice</strong></p>');
    });
  });

  describe('displayPath normalization', () => {
    it('strips a trailing .html from the display path on every result shape', async () => {
      const result = await loadFormContext({
        details: validDetails,
        fetchHtml: htmlOk(scHtml()),
        fetchSchemas: schemasOk({ project: '<schema-html/>' }),
      });
      expect(result.displayPath).to.equal('/adobe/demo/page');
    });
  });
});

// ─── Helix 6 (native JSON) ─────────────────────────────────────────────────

describe('loadFormContext (Helix 6)', () => {
  const schemas = { project: { type: 'object' } };
  const htmlDetails = { ...validDetails, fullpath: '/adobe/demo/page.html', sourceUrl: '/adobe/demo/page.html' };
  const hlx6 = () => true;
  const scJson = { metadata: { schemaName: 'project', title: 'T' }, data: { a: 1 } };
  const run = ({ files, schemaSet = schemas, details = htmlDetails }) => {
    const calls = [];
    const fetchHtml = async ({ sourceUrl }) => {
      calls.push(sourceUrl);
      return files[sourceUrl] ?? { error: 'x', status: 404 };
    };
    return loadFormContext({
      details,
      fetchHtml,
      fetchSchemas: async () => schemaSet,
      isHlx6: hlx6,
    }).then((r) => ({ r, calls }));
  };

  it('reads <path>.json and uses it directly', async () => {
    const { r, calls } = await run({ files: { '/adobe/demo/page.json': { html: JSON.stringify(scJson) } } });
    expect(calls).to.deep.equal(['/adobe/demo/page.json']);
    expect(r.status).to.equal('ready');
    expect(r.storage).to.equal('json');
    expect(r.json).to.deep.equal(scJson);
    expect(r.details.fullpath).to.equal('/adobe/demo/page.json');
    expect(r.displayPath).to.equal('/adobe/demo/page');
  });

  it('accepts array data and strips a .json ctx path', async () => {
    const json = { metadata: { schemaName: 'project' }, data: [] };
    const { r } = await run({
      details: { ...htmlDetails, fullpath: '/adobe/demo/page.json' },
      files: { '/adobe/demo/page.json': { html: JSON.stringify(json) } },
    });
    expect(r.status).to.equal('ready');
  });

  it('blocks load-failed on invalid JSON', async () => {
    const { r } = await run({ files: { '/adobe/demo/page.json': { html: '{nope' } } });
    expect(r.blocker.type).to.equal('load-failed');
  });

  it('blocks not-form-content on non-SC JSON', async () => {
    const { r } = await run({ files: { '/adobe/demo/page.json': { html: '{":type":"sheet","data":[]}' } } });
    expect(r.blocker.type).to.equal('not-form-content');
  });

  it('blocks missing-schema for unknown schemaName', async () => {
    const { r } = await run({ schemaSet: {}, files: { '/adobe/demo/page.json': { html: JSON.stringify(scJson) } } });
    expect(r.blocker.type).to.equal('missing-schema');
  });

  it('treats empty body or {} as new', async () => {
    expect((await run({ files: { '/adobe/demo/page.json': { html: '' } } })).r.status).to.equal('select-schema');
    expect((await run({ files: { '/adobe/demo/page.json': { html: '{}' } } })).r.status).to.equal('select-schema');
    expect((await run({ schemaSet: {}, files: { '/adobe/demo/page.json': { html: '{}' } } })).r.status).to.equal('no-schemas');
  });

  it('maps 403 to no-access', async () => {
    const { r } = await run({ files: { '/adobe/demo/page.json': { error: 'x', status: 403 } } });
    expect(r.blocker.type).to.equal('no-access');
  });

  it('falls back to legacy .html on json 404 and converts it', async () => {
    const { r, calls } = await run({ files: { '/adobe/demo/page.html': { html: scHtml() } } });
    expect(calls).to.deep.equal(['/adobe/demo/page.json', '/adobe/demo/page.html']);
    expect(r.status).to.equal('ready');
    expect(r.storage).to.equal('json');
    expect(r.details.fullpath).to.equal('/adobe/demo/page.json');
    expect(r.json.metadata.schemaName).to.equal('project');
  });

  it('treats empty legacy html as new', async () => {
    const { r } = await run({ files: { '/adobe/demo/page.html': { html: emptyDocHtml } } });
    expect(r.status).to.equal('select-schema');
  });

  it('treats 404 on both as new, not not-document', async () => {
    const { r } = await run({ files: {} });
    expect(r.status).to.equal('select-schema');
    expect(r.storage).to.equal('json');
  });

  it('non-Helix-6 keeps the html flow', async () => {
    const calls = [];
    const r = await loadFormContext({
      details: htmlDetails,
      fetchHtml: async ({ sourceUrl }) => {
        calls.push(sourceUrl);
        return { html: scHtml() };
      },
      fetchSchemas: async () => schemas,
      isHlx6: () => false,
    });
    expect(calls).to.deep.equal(['/adobe/demo/page.html']);
    expect(r.status).to.equal('ready');
    expect(r.storage).to.equal(undefined);
  });
});
