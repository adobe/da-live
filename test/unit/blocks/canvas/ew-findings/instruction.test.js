import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  buildApplyText,
  buildPillDescription,
  buildPillItem,
  applyFinding,
  addFindingToChat,
  buildSuggestTitle,
  buildSuggestText,
  requestSuggestions,
  DETAILS_MARKER,
  MAX_CURRENT_TEXT,
} = await import('../../../../../blocks/canvas/ew-findings/instruction.js');

const finding = {
  id: 'f1',
  title: 'Header copy',
  suggested: 'Use the brand voice',
  issue: 'Too generic',
};
const page = 'aem-showcase/frescopa/drafts/me/index';

describe('instruction text', () => {
  it('builds the full text with replacement', () => {
    const text = buildApplyText({
      finding,
      label: 'Heading 1',
      evidence: { anchorType: 'text', anchorText: 'Born from', replacement: 'Brewed with' },
      page,
    });
    expect(text.split('\n')).to.deep.equal([
      `Apply this brand governance fix to the page I have open (${page}).`,
      'Check: Header copy',
      'Element: Heading 1',
      'Current text: "Born from"',
      'Change it to: "Brewed with"',
      'Suggested change: Use the brand voice',
      'Reason: Too generic',
      'Only change this element; leave the rest of the page unchanged.',
    ]);
  });

  it('omits the replacement line and missing fields', () => {
    const text = buildApplyText({
      finding: { id: 'x', title: 'Only title' },
      label: '',
      evidence: { anchorType: 'text', anchorText: 'abc' },
      page,
    });
    expect(text.split('\n')).to.deep.equal([
      `Apply this brand governance fix to the page I have open (${page}).`,
      'Check: Only title',
      'Current text: "abc"',
      'Only change this element; leave the rest of the page unchanged.',
    ]);
  });

  it('describes highlight-only evidence as the start of the text, without a change', () => {
    const text = buildApplyText({
      finding,
      label: 'Paragraph',
      evidence: { anchorType: 'text', anchorText: 'Lorem ipsum dolor', replacement: 'x', highlightOnly: true },
      page,
    });
    expect(text).to.include('Text starts with: "Lorem ipsum dolor"');
    expect(text).to.not.include('Current text');
    expect(text).to.not.include('Change it to');
  });

  it('uses the image file name for image evidence', () => {
    const text = buildApplyText({
      finding,
      label: 'Image',
      evidence: { anchorType: 'image', src: 'https://x.aem.live/media_abc.png?w=2' },
      page,
    });
    expect(text).to.include('Image: media_abc.png');
    expect(text).to.not.include('Current text');
  });

  it('works without evidence or page', () => {
    const text = buildApplyText({ finding, label: '', evidence: null, page: '' });
    expect(text.split('\n')[0]).to.equal('Apply this brand governance fix to the page I have open.');
    expect(text).to.not.include('Element:');
  });

  it('pill description is the instruction without first and last line', () => {
    const args = {
      finding,
      label: 'Paragraph',
      evidence: { anchorType: 'text', anchorText: 'abc', replacement: 'xyz' },
      page,
    };
    const lines = buildApplyText(args).split('\n');
    expect(buildPillDescription(args)).to.equal(lines.slice(1, -1).join('\n'));
  });

  it('builds the pill item', () => {
    const item = buildPillItem({ finding, label: 'Paragraph', evidence: null, page });
    expect(item).to.deep.equal({
      key: 'eval-finding',
      id: 'eval-f1',
      type: 'evaluation-finding',
      name: 'Header copy',
      description: 'Check: Header copy\nElement: Paragraph\nSuggested change: Use the brand voice\nReason: Too generic',
    });
  });
});

describe('instruction dispatch', () => {
  let events;
  const record = (e) => events.push(e);
  beforeEach(() => {
    events = [];
    document.addEventListener('nx-panel-open', record);
    document.addEventListener('nx-add-to-chat', record);
  });
  afterEach(() => {
    document.removeEventListener('nx-panel-open', record);
    document.removeEventListener('nx-add-to-chat', record);
  });

  it('applyFinding opens chat with auto-send text', () => {
    const text = applyFinding({ finding, label: 'Paragraph', evidence: null, page });
    expect(events).to.have.lengthOf(1);
    expect(events[0].type).to.equal('nx-panel-open');
    expect(events[0].detail).to.deep.equal({ section: 'chat', options: { text, autoSend: true } });
  });

  it('addFindingToChat opens the chat panel and adds the pill', () => {
    addFindingToChat({ finding, label: 'Paragraph', evidence: null, page });
    expect(events.map((e) => e.type)).to.deep.equal(['nx-panel-open', 'nx-add-to-chat']);
    expect(events[0].detail).to.deep.equal({ section: 'chat' });
    expect(events[1].detail.key).to.equal('eval-finding');
    expect(events[1].detail.id).to.equal('eval-f1');
    expect(events[1].detail.type).to.equal('evaluation-finding');
  });
});

describe('suggestion request', () => {
  const group = { key: 'el-h5', label: 'Section 1 › cards (tiles) — Heading 5: “Bundles 123”', name: 'Cards (tiles) heading 5' };
  const textSnapshot = {
    anchorType: 'text',
    kindLabel: 'Heading 5',
    text: 'Bundles 123',
    words: 2,
    links: [],
    formatting: [],
    neighbours: { prev: 'Heading 5 "Coffee Pods"', next: '' },
  };
  const resolved = (extra = {}) => ({
    evidence: { anchorType: 'text', anchorText: 'Bundles 123', occurrence: 1 },
    snapshot: textSnapshot,
    findings: [
      { id: 'a', title: 'Brand Personality', issue: 'The stray number feels careless.', suggested: 'Curated Bundles', evidence: [] },
      {
        id: 'b',
        title: 'Brand Values',
        issue: 'Looks like test content',
        suggested: 'n/a',
        evidence: [{ anchorType: 'text', anchorText: 'Bundles 123', replacement: 'Bundles' }],
      },
    ],
    ...extra,
  });
  const args = (extra = {}) => ({
    group,
    resolved: resolved(),
    page: 'https://da.live/canvas#/o/s/drafts/me/index',
    evaluatedUrl: 'https://main--s--o.preview.da.live/drafts/me/index',
    ...extra,
  });

  it('titles the message "<short name> failure: Generate suggestion"', () => {
    expect(buildSuggestTitle(args())).to.equal('Cards (tiles) heading 5 failure: Generate suggestion');
    expect(buildSuggestTitle({ group: { label: 'Hero: “x”' }, snapshot: textSnapshot })).to.equal('Hero failure: Generate suggestion');
    expect(buildSuggestTitle({ group: {}, snapshot: textSnapshot })).to.equal('Heading 5 failure: Generate suggestion');
  });

  it('puts the marker on line 2 and the skill input format in the body', () => {
    const lines = buildSuggestText(args()).split('\n');
    expect(lines[0]).to.equal('Cards (tiles) heading 5 failure: Generate suggestion');
    expect(lines[1]).to.equal(DETAILS_MARKER);
    expect(DETAILS_MARKER).to.equal('<!--nx:details-->');
    expect(lines.slice(2)).to.deep.equal([
      '/aem-governance-element-suggestions',
      'Page: https://da.live/canvas#/o/s/drafts/me/index',
      'Evaluated URL: https://main--s--o.preview.da.live/drafts/me/index',
      'Element: Section 1 › cards (tiles) — Heading 5 (text)',
      'Locate: text "Bundles 123", occurrence 1',
      'Current text: "Bundles 123"',
      'Formatting: none · Links: none · Words: 2',
      'Nearby (context only, do not change): previous Heading 5 "Coffee Pods"',
      'Failing checks (2):',
      '1. Brand Personality — The stray number feels careless. Hint: "Curated Bundles"',
      '2. Brand Values — Looks like test content. Hint: "Bundles"',
      'Constraints: keep one Heading 5, 1–4 words; same language; keep names, prices, numbers and links.',
      'Give 3 options, each fixing ALL failing checks.',
    ]);
  });

  it('lists links and formatting, and a button gets the button constraints', () => {
    const snapshot = {
      ...textSnapshot,
      kindLabel: 'Button',
      text: 'Claim Rewards',
      words: 2,
      links: [{ text: 'Claim Rewards', href: 'https://x.example/signup' }],
      formatting: [{ mark: 'italic', text: 'Claim Rewards', whole: true }],
      neighbours: { prev: '', next: '' },
    };
    const text = buildSuggestText(args({
      resolved: resolved({ snapshot }),
      group: { label: 'Reward', name: 'Reward button' },
    }));
    expect(text).to.include('Element: Reward — Button (text)');
    expect(text).to.include('Formatting: italic (whole text) · Links: Claim Rewards → https://x.example/signup · Words: 2');
    expect(text).to.include('Constraints: keep one Button, 1–4 words;');
    expect(text).to.not.include('Nearby');
  });

  it('caps the current text at 1,500 characters and says to read the source', () => {
    const long = 'word '.repeat(400).trim();
    const snapshot = { ...textSnapshot, text: long, words: 400 };
    const text = buildSuggestText(args({ resolved: resolved({ snapshot }) }));
    const current = text.split('\n').find((l) => l.startsWith('Current text: '));
    expect(MAX_CURRENT_TEXT).to.equal(1500);
    const cut = long.slice(0, 1500);
    expect(current).to.equal(`Current text: "${cut} … (truncated, read the source)"`);
  });

  it('describes an image by file name and current alt', () => {
    const snapshot = {
      anchorType: 'image',
      kindLabel: 'Image',
      text: '',
      words: 0,
      fileName: 'media_abc.png',
      alt: 'Coffee Machines',
      links: [],
      formatting: [],
      neighbours: { prev: '', next: '' },
    };
    const text = buildSuggestText(args({
      group: { label: 'Section 1 › cards — Image', name: 'Cards image' },
      resolved: { evidence: { anchorType: 'image', src: 'x/media_abc.png', occurrence: 2 }, snapshot, findings: resolved().findings },
    }));
    expect(text).to.include('Element: Section 1 › cards — Image (image)');
    expect(text).to.include('Locate: image media_abc.png, occurrence 2');
    expect(text).to.include('Current alt: "Coffee Machines" · Image file: media_abc.png');
    expect(text).to.include('Constraints: alt text ≤ 125 chars;');
  });

  it('requestSuggestions opens the chat panel with the text, sent automatically', () => {
    const events = [];
    const record = (e) => events.push(e);
    document.addEventListener('nx-panel-open', record);
    const text = requestSuggestions(args());
    document.removeEventListener('nx-panel-open', record);
    expect(events).to.have.lengthOf(1);
    expect(events[0].detail).to.deep.equal({ section: 'chat', options: { text, autoSend: true } });
  });
});
