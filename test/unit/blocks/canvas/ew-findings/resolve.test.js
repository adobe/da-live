import { expect } from '@esm-bundle/chai';
import { getSchema } from 'da-parser';
import {
  normalizeText,
  fileNameOf,
  resolveEvidence,
  resolveFindings,
  elementSnapshot,
  resolveGroup,
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

  it('flags ambiguous matches and returns the first when no block equals the quote', () => {
    const doc = makeDoc(para(text('Buy now and save')), para(text('Buy now, today')));
    const range = resolveEvidence(doc, { anchorType: 'text', anchorText: 'Buy now' });
    expect(range.ambiguous).to.equal(true);
    expect(range.from).to.equal(1);
  });

  it('prefers the block whose whole text is the quote over an earlier substring match', () => {
    const doc = makeDoc(para(text('Buy now and save')), para(text('Buy now')));
    const range = resolveEvidence(doc, { anchorType: 'text', anchorText: 'Buy now' });
    expect(range.ambiguous).to.equal(true);
    expect(doc.nodeAt(range.blockPos).textContent).to.equal('Buy now');
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

// Same example as the Brand Governance Agent `TestHighlightOnlyEvidence`
// (tests/test_page_findings.py):
// "Test content update", "Test" and the same media file twice. Keep both in sync.
describe('resolveEvidence — occurrence', () => {
  const frescopa = () => makeDoc(
    para(text('Test content update')),
    para(text('Test')),
    para(img('./media_dup.png?width=750&format=png')),
    para(text('Lorem ipsum dolor sit amet')),
    para(img('./media_dup.png?width=900')),
    para(img('./media_solo.png')),
  );
  const textAt = (doc, range) => doc.nodeAt(range.blockPos).textContent;
  const find = (doc, evidence) => resolveEvidence(doc, { anchorType: 'text', anchorText: 'Test', ...evidence });

  it('honours occurrence: "Test" occurrence 2 is the paragraph "Test"', () => {
    const doc = frescopa();
    const range = find(doc, { occurrence: 2 });
    expect(textAt(doc, range)).to.equal('Test');
    expect(doc.textBetween(range.from, range.to)).to.equal('Test');
    expect(range.ambiguous).to.equal(true);
  });

  it('counts case-insensitive substrings: with "testing" before, the paragraph "Test" is occurrence 3', () => {
    // Real Frescopa page; the agent reports occurrence 3 for it (tests/test_page_findings.py).
    const doc = makeDoc(
      para(text('Markus did some testing ...')),
      para(text('Test content update')),
      para(text('Test')),
    );
    expect(textAt(doc, find(doc, { occurrence: 3 }))).to.equal('Test');
    expect(textAt(doc, find(doc, { occurrence: 2 }))).to.equal('Test content update');
    expect(textAt(doc, find(doc, { occurrence: 1 }))).to.equal('Markus did some testing ...');
  });

  it('occurrence 1 is the first match, in "Test content update"', () => {
    const doc = frescopa();
    expect(textAt(doc, find(doc, { occurrence: 1 }))).to.equal('Test content update');
  });

  it('without an occurrence prefers the block whose whole text is the quote', () => {
    const doc = frescopa();
    const range = find(doc, {});
    expect(textAt(doc, range)).to.equal('Test');
    expect(range.ambiguous).to.equal(true);
  });

  it('falls back to the whole-text block when the occurrence is out of range or invalid', () => {
    const doc = frescopa();
    [3, 0, -1, 1.5, '2', null].forEach((occurrence) => {
      expect(textAt(doc, find(doc, { occurrence })), String(occurrence)).to.equal('Test');
    });
  });

  it('falls back to the first match when no block equals the quote', () => {
    const doc = makeDoc(para(text('Buy now and save')), para(text('Now Buy now please')));
    const range = resolveEvidence(doc, { anchorType: 'text', anchorText: 'Buy now', occurrence: 9 });
    expect(textAt(doc, range)).to.equal('Buy now and save');
  });

  it('counts case-insensitively and without overlap, like the agent', () => {
    const doc = makeDoc(para(text('aaa test')), para(text('A TEST here')), para(text('test')));
    const at = (occurrence) => {
      const range = resolveEvidence(doc, { anchorType: 'text', anchorText: 'test', occurrence });
      return doc.textBetween(range.from, range.to);
    };
    expect(at(2)).to.equal('TEST');
    expect(at(3)).to.equal('test');
    const aa = makeDoc(para(text('aaaa')), para(text('aa')));
    const second = resolveEvidence(aa, { anchorType: 'text', anchorText: 'aa', occurrence: 2 });
    expect(aa.nodeAt(second.blockPos).textContent).to.equal('aaaa');
    expect(second.from).to.equal(3);
    const third = resolveEvidence(aa, { anchorType: 'text', anchorText: 'aa', occurrence: 3 });
    expect(aa.nodeAt(third.blockPos).textContent).to.equal('aa');
  });

  it('keeps matching case-sensitively when there is no usable occurrence', () => {
    const doc = makeDoc(para(text('TEST only')));
    expect(find(doc, {})).to.be.null;
    expect(find(doc, { occurrence: 1 })).to.not.be.null;
  });

  it('resolves a highlight-only prefix to the start of the long paragraph', () => {
    const doc = frescopa();
    const range = resolveEvidence(doc, { anchorType: 'text', anchorText: 'Lorem ipsum dolor', highlightOnly: true });
    expect(doc.textBetween(range.from, range.to)).to.equal('Lorem ipsum dolor');
  });

  it('honours the image occurrence by file name, document order', () => {
    const doc = frescopa();
    const first = resolveEvidence(doc, { anchorType: 'image', src: 'media_dup.png', occurrence: 1 });
    const src = 'https://x/media_dup.png?w=1';
    const second = resolveEvidence(doc, { anchorType: 'image', src, occurrence: 2 });
    expect(doc.nodeAt(first.from).attrs.src).to.include('width=750');
    expect(doc.nodeAt(second.from).attrs.src).to.include('width=900');
    expect(second.from).to.be.greaterThan(first.from);
    expect(second.ambiguous).to.equal(true);
  });

  it('falls back to the first image when the occurrence is missing or out of range', () => {
    const doc = frescopa();
    const firstFrom = resolveEvidence(doc, { anchorType: 'image', src: 'media_dup.png', occurrence: 1 }).from;
    [undefined, 3, 0, 'x'].forEach((occurrence) => {
      const range = resolveEvidence(doc, { anchorType: 'image', src: 'media_dup.png', occurrence });
      expect(range.from).to.equal(firstFrom);
    });
  });

  it('ignores the occurrence of a unique image', () => {
    const doc = frescopa();
    const range = resolveEvidence(doc, { anchorType: 'image', src: 'media_solo.png', occurrence: 2 });
    expect(doc.nodeAt(range.from).attrs.src).to.include('media_solo');
    expect(range.ambiguous).to.equal(false);
  });

  it('groups two findings of the same quote in different paragraphs separately', () => {
    const doc = frescopa();
    const [a, b] = resolveFindings(doc, [
      { id: 'a', evidence: [{ anchorType: 'text', anchorText: 'Test', occurrence: 1 }] },
      { id: 'b', evidence: [{ anchorType: 'text', anchorText: 'Test', occurrence: 2 }] },
    ]);
    expect(a.groupKey).to.not.equal(b.groupKey);
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

describe('elementSnapshot', () => {
  const link = (href) => [{ type: 'link', attrs: { href } }];
  const strong = [{ type: 'strong' }];
  const em = [{ type: 'em' }];

  const snap = (doc, anchorText, occurrence) => {
    const range = resolveEvidence(doc, { anchorType: 'text', anchorText, occurrence });
    return elementSnapshot(doc, range);
  };

  it('returns the full text, kind, word count and neighbours of a heading', () => {
    const doc = makeDoc(
      para(text('Eyebrow line')),
      h(1, text('  THE WORLD\u2019S  BEST   COFFEE!!! ')),
      para(text('Every bean hand-picked.')),
    );
    const s = snap(doc, 'WORLD');
    expect(s).to.deep.include({
      anchorType: 'text',
      kindLabel: 'Heading 1',
      text: 'THE WORLD\u2019S BEST COFFEE!!!',
      words: 4,
      links: [],
      formatting: [],
    });
    expect(s.neighbours).to.deep.equal({ prev: 'Paragraph "Eyebrow line"', next: 'Paragraph "Every bean hand-picked."' });
  });

  it('lists links as text -> href and bold/italic spans, whole or partial', () => {
    const doc = makeDoc(para(
      text('Read our '),
      text('story', [...strong, ...link('/story')]),
      text(' and '),
      text('more', em),
      text(' today'),
    ));
    const s = snap(doc, 'Read our');
    expect(s.kindLabel).to.equal('Paragraph');
    expect(s.links).to.deep.equal([{ text: 'story', href: '/story' }]);
    expect(s.formatting).to.deep.equal([
      { mark: 'bold', text: 'story', whole: false },
      { mark: 'italic', text: 'more', whole: false },
    ]);
    expect(s.words).to.equal(6);
  });

  it('calls a paragraph that is one link a Button, with the whole-text formatting', () => {
    const doc = makeDoc(
      para(text('Surprise your loved ones.')),
      para(text('Claim Rewards', [...em, ...link('https://example.com/signup')])),
    );
    const s = snap(doc, 'Claim Rewards');
    expect(s.kindLabel).to.equal('Button');
    expect(s.links).to.deep.equal([{ text: 'Claim Rewards', href: 'https://example.com/signup' }]);
    expect(s.formatting).to.deep.equal([{ mark: 'italic', text: 'Claim Rewards', whole: true }]);
    expect(s.neighbours).to.deep.equal({ prev: 'Paragraph "Surprise your loved ones."', next: '' });
  });

  it('describes a button neighbour with its link target', () => {
    const doc = makeDoc(
      para(text('Intro copy')),
      para(text('Shop beans', link('/shop'))),
    );
    expect(snap(doc, 'Intro copy').neighbours.next).to.equal('Button "Shop beans" \u2192 /shop');
  });

  it('knows list items, the size of their list and uses the sibling items as neighbours', () => {
    const doc = makeDoc({
      type: 'bullet_list',
      content: [
        { type: 'list_item', content: [para(text('first item'))] },
        { type: 'list_item', content: [para(text('second item'))] },
        { type: 'list_item', content: [para(text('third item'))] },
      ],
    });
    const s = snap(doc, 'second item');
    expect(s.kindLabel).to.equal('List item');
    expect(s.listSize).to.equal(3);
    expect(s.neighbours).to.deep.equal({ prev: 'List item "first item"', next: 'List item "third item"' });
  });

  it('describes an image by file name, alt and link', () => {
    const doc = makeDoc(
      para(text('Above')),
      para({ type: 'image', attrs: { src: `./${HERO}?width=750`, alt: 'Coffee Machines' } }),
    );
    const range = resolveEvidence(doc, { anchorType: 'image', src: `https://x.aem.live/${HERO}` });
    const s = elementSnapshot(doc, range);
    expect(s).to.deep.include({
      anchorType: 'image', kindLabel: 'Image', fileName: HERO, alt: 'Coffee Machines', words: 0, text: '',
    });
    expect(s.src).to.contain(HERO);
  });

  it('is null without a document or range', () => {
    expect(elementSnapshot(null, {})).to.equal(null);
    expect(elementSnapshot(makeDoc(para(text('x'))), null)).to.equal(null);
  });
});

describe('resolveGroup', () => {
  const doc = makeDoc(
    h(1, text('Hero title here')),
    para(text('Other paragraph')),
    para({ type: 'image', attrs: { src: `./${HERO}` } }),
  );
  const f = (id, evidence, extra = {}) => ({ id, title: id, evidence, ...extra });

  it('resolves the element from the first resolvable finding and keeps the findings that belong to it', () => {
    const r = resolveGroup(doc, [
      f('a', [{ anchorType: 'text', anchorText: 'Hero title' }]),
      f('b', [{ anchorType: 'text', anchorText: 'Hero title here' }]),
      f('c', [{ anchorType: 'text', anchorText: 'Other paragraph' }]),
      f('d', []),
      f('e', [], { assetType: 'image' }),
    ]);
    expect(r.snapshot.kindLabel).to.equal('Heading 1');
    expect(r.groupKey).to.match(/^text:\d+$/);
    expect(r.evidence.anchorText).to.equal('Hero title');
    expect(r.findings.map((x) => x.id)).to.deep.equal(['a', 'b', 'd']);
  });

  it('resolves an image group', () => {
    const r = resolveGroup(doc, [f('i', [{ anchorType: 'image', src: HERO }])]);
    expect(r.snapshot.anchorType).to.equal('image');
    expect(r.findings).to.have.length(1);
  });

  it('is null when nothing resolves', () => {
    expect(resolveGroup(doc, [f('x', [{ anchorType: 'text', anchorText: 'not here' }])])).to.equal(null);
    expect(resolveGroup(doc, [])).to.equal(null);
  });
});
