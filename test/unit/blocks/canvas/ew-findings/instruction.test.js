import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  buildApplyText,
  buildPillDescription,
  buildPillItem,
  applyFinding,
  addFindingToChat,
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
