import { expect } from '@esm-bundle/chai';
import { getSchema } from 'da-parser';
import {
  normalizeText,
  fileNameOf,
  resolveEvidence,
  resolveFindings,
} from '../../../../../blocks/canvas/ew-findings/resolve.js';

const schema = getSchema();
const text = (t, marks) => ({ type: 'text', text: t, ...(marks ? { marks } : {}) });
const para = (...content) => ({ type: 'paragraph', content });
const h = (level, ...content) => ({ type: 'heading', attrs: { level }, content });
const img = (src) => ({ type: 'image', attrs: { src } });
const makeDoc = (...content) => schema.nodeFromJSON({ type: 'doc', content });

const HERO = 'media_179c2472c582176bc491cf55256cfd8e9635aa0f5.png';

function sample() {
  return makeDoc(
    h(3, text('Our Story')),
    h(1, text('Born from a passion for exceptional coffee.')),
    para(img(`./${HERO}?width=750&format=png`)),
    para(text('From sourcing the finest beans to engineering the perfect machine, Fréscopa is on a mission.')),
  );
}

describe('normalizeText', () => {
  it('turns NBSP into space, collapses whitespace and trims', () => {
    expect(normalizeText('  a\u00A0\u00A0b \n\t c  ')).to.equal('a b c');
  });

  it('maps typographic quotes to ASCII', () => {
    expect(normalizeText('\u2018hi\u2019 \u201Cthere\u201D')).to.equal('\'hi\' "there"');
  });

  it('handles empty values', () => {
    expect(normalizeText(undefined)).to.equal('');
    expect(normalizeText('   ')).to.equal('');
  });
});

describe('fileNameOf', () => {
  it('ignores origin, query, hash and ./', () => {
    expect(fileNameOf(`https://main--a--b.aem.live/${HERO}?width=2000#x`)).to.equal(HERO);
    expect(fileNameOf(`./${HERO}`)).to.equal(HERO);
    expect(fileNameOf('')).to.equal('');
  });
});

describe('resolveEvidence — text', () => {
  it('resolves an exact quote to PM positions', () => {
    const doc = sample();
    const quote = 'Born from a passion for exceptional coffee.';
    const range = resolveEvidence(doc, { anchorType: 'text', anchorText: quote });
    expect(range.anchorType).to.equal('text');
    expect(doc.textBetween(range.from, range.to)).to.equal(quote);
    expect(range.ambiguous).to.equal(false);
    expect(doc.nodeAt(range.blockPos).type.name).to.equal('heading');
  });

  it('matches a partial quote inside a paragraph', () => {
    const doc = sample();
    const range = resolveEvidence(doc, { anchorType: 'text', anchorText: 'finest beans' });
    expect(doc.textBetween(range.from, range.to)).to.equal('finest beans');
    expect(doc.nodeAt(range.blockPos).type.name).to.equal('paragraph');
  });

  it('is case-sensitive', () => {
    expect(resolveEvidence(sample(), { anchorType: 'text', anchorText: 'finest BEANS' })).to.be.null;
  });

  it('normalises whitespace, NBSP and typographic quotes on both sides', () => {
    const doc = makeDoc(para(text('It\u2019s  a\u00A0 \u201Cgreat\u201D   day')));
    const range = resolveEvidence(doc, { anchorType: 'text', anchorText: 'It\'s a "great" day' });
    expect(range).to.not.be.null;
    expect(doc.textBetween(range.from, range.to)).to.equal('It\u2019s  a\u00A0 \u201Cgreat\u201D   day');
    const range2 = resolveEvidence(doc, { anchorType: 'text', anchorText: 'a \u201Cgreat\u201D day' });
    expect(range2).to.not.be.null;
    expect(doc.textBetween(range2.from, range2.to)).to.equal('a\u00A0 \u201Cgreat\u201D   day');
  });

  it('resolves a quote spanning several text nodes and marks', () => {
    const doc = makeDoc(para(
      text('Start '),
      text('bold part', [{ type: 'strong' }]),
      text(' and '),
      text('linked', [{ type: 'link', attrs: { href: 'https://example.com' } }]),
      text(' end'),
    ));
    const range = resolveEvidence(doc, { anchorType: 'text', anchorText: 'bold part and linked' });
    expect(doc.textBetween(range.from, range.to)).to.equal('bold part and linked');
    // from points at the first char of the strong node (1 = inside paragraph, 6 chars before)
    expect(range.from).to.equal(1 + 'Start '.length);
    expect(range.to).to.equal(1 + 'Start bold part and linked'.length);
  });

  it('keeps positions exact past earlier blocks', () => {
    const doc = sample();
    const range = resolveEvidence(doc, { anchorType: 'text', anchorText: 'perfect machine' });
    expect(doc.textBetween(range.from, range.to)).to.equal('perfect machine');
    expect(range.to - range.from).to.equal('perfect machine'.length);
  });

  it('treats an inline image as a word separator', () => {
    const doc = makeDoc(para(text('before'), img('x.png'), text('after')));
    expect(resolveEvidence(doc, { anchorType: 'text', anchorText: 'before after' })).to.not.be.null;
    expect(resolveEvidence(doc, { anchorType: 'text', anchorText: 'beforeafter' })).to.be.null;
  });

  it('searches text inside block (table) cells', () => {
    const doc = schema.nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'table',
        content: [{
          type: 'table_row',
          content: [{ type: 'table_cell', content: [para(text('hero'))] }],
        }, {
          type: 'table_row',
          content: [{ type: 'table_cell', content: [para(text('Buy now'))] }],
        }],
      }],
    });
    const range = resolveEvidence(doc, { anchorType: 'text', anchorText: 'Buy now' });
    expect(doc.textBetween(range.from, range.to)).to.equal('Buy now');
  });

  it('returns null when not found, empty or unknown', () => {
    const doc = sample();
    expect(resolveEvidence(doc, { anchorType: 'text', anchorText: 'nope' })).to.be.null;
    expect(resolveEvidence(doc, { anchorType: 'text', anchorText: '  ' })).to.be.null;
    expect(resolveEvidence(doc, { anchorType: 'video' })).to.be.null;
    expect(resolveEvidence(doc, null)).to.be.null;
  });

  it('does not match across blocks', () => {
    const doc = sample();
    expect(resolveEvidence(doc, {
      anchorType: 'text',
      anchorText: 'exceptional coffee. From sourcing',
    })).to.be.null;
  });

  it('flags ambiguous matches and returns the first', () => {
    const doc = makeDoc(para(text('Buy now and save')), para(text('Buy now')));
    const range = resolveEvidence(doc, { anchorType: 'text', anchorText: 'Buy now' });
    expect(range.ambiguous).to.equal(true);
    expect(range.from).to.equal(1);
  });
});

describe('resolveEvidence — image', () => {
  it('matches the media file name regardless of origin and query', () => {
    const doc = sample();
    const range = resolveEvidence(doc, {
      anchorType: 'image',
      src: `https://main--frescopa-da--aem-showcase.aem.live/${HERO}`,
    });
    expect(range.anchorType).to.equal('image');
    expect(doc.nodeAt(range.from).type.name).to.equal('image');
    expect(range.to - range.from).to.equal(1);
    expect(range.blockPos).to.equal(range.from);
    expect(range.anchorText).to.equal('');
  });

  it('returns null for another file or missing src', () => {
    const doc = sample();
    expect(resolveEvidence(doc, { anchorType: 'image', src: 'https://x.com/media_other.png' })).to.be.null;
    expect(resolveEvidence(doc, { anchorType: 'image', src: '' })).to.be.null;
  });

  it('flags ambiguous duplicates', () => {
    const doc = makeDoc(para(img(`./${HERO}`)), para(img(`./${HERO}?a=1`)));
    const range = resolveEvidence(doc, { anchorType: 'image', src: HERO });
    expect(range.ambiguous).to.equal(true);
  });
});

describe('resolveFindings', () => {
  const f = (id, evidence, extra = {}) => ({ id, title: `T${id}`, evidence, ...extra });

  it('uses the first resolvable evidence and groups by containing element', () => {
    const doc = sample();
    const results = resolveFindings(doc, [
      f('a', [{ anchorType: 'text', anchorText: 'not on the page' }, { anchorType: 'text', anchorText: 'passion for' }]),
      f('b', [{ anchorType: 'text', anchorText: 'exceptional coffee' }]),
      f('c', [{ anchorType: 'text', anchorText: 'finest beans' }]),
      f('d', [{ anchorType: 'image', src: HERO }]),
    ]);
    expect(results.map((r) => r.finding.id)).to.deep.equal(['a', 'b', 'c', 'd']);
    expect(results[0].groupKey).to.equal(results[1].groupKey);
    expect(results[0].groupKey).to.match(/^text:\d+$/);
    expect(results[2].groupKey).to.not.equal(results[0].groupKey);
    expect(results[3].groupKey).to.match(/^image:\d+$/);
    expect(results[0].evidence.anchorText).to.equal('passion for');
    expect(results.map((r) => r.label)).to.deep.equal(['Heading 1', 'Heading 1', 'Paragraph', 'Image']);
  });

  it('returns null range/group for unresolvable findings and keeps text evidence', () => {
    const doc = sample();
    const [a, b] = resolveFindings(doc, [
      f('a', [{ anchorType: 'text', anchorText: 'ghost', replacement: 'boo' }]),
      f('b', undefined),
    ]);
    expect(a.range).to.be.null;
    expect(a.groupKey).to.be.null;
    expect(a.label).to.equal('');
    expect(a.evidence.replacement).to.equal('boo');
    expect(b.range).to.be.null;
    expect(b.evidence).to.be.null;
  });

  it('labels list items', () => {
    const doc = makeDoc({
      type: 'bullet_list',
      content: [{ type: 'list_item', content: [para(text('first item'))] }],
    });
    const [r] = resolveFindings(doc, [f('a', [{ anchorType: 'text', anchorText: 'first item' }])]);
    expect(r.label).to.equal('List item');
  });
});
