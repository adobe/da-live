import { expect } from '@esm-bundle/chai';
import { adaptEvaluation } from '../../../../../blocks/canvas/ew-governance/adapter.js';

// Synthetic slice of a POST /api/v0/evaluate/page response. All values are made
// up for the test — never use real customer data here.
const RESPONSE = {
  brand_name: 'Example Brand',
  text_evaluation: {
    evaluations: [
      {
        check_title: 'Failing with a suggested fix',
        alignment: 'NO',
        reasoning: 'This check did not pass.',
        suggestions: 'Apply the recommended change.',
        category: 'Category A',
      },
      {
        check_title: 'Passing check',
        alignment: 'YES',
        reasoning: 'This check passed.',
        suggestions: null,
        category: 'Category B',
      },
      {
        check_title: 'Not applicable check',
        alignment: 'NOT_APPLICABLE',
        reasoning: 'Not applicable to this page.',
        suggestions: null,
        category: 'Category C',
      },
      {
        // A failing check with no suggestions must NOT become a suggestion item.
        check_title: 'Failing without a fix',
        alignment: 'NO',
        reasoning: 'It failed but no fix was offered.',
        suggestions: null,
        category: 'Category A',
      },
    ],
  },
  image_evaluations: [
    {
      source: 'https://example.com/assets/sample-image.jpg',
      evaluations: [
        {
          check_title: 'Passing image check',
          alignment: 'YES',
          reasoning: 'The image passed.',
          suggestions: null,
          category: 'Category D',
        },
      ],
    },
  ],
};

describe('ew-governance adapter', () => {
  it('uses brand_name as the title', () => {
    expect(adaptEvaluation(RESPONSE).title).to.equal('Example Brand');
  });

  it('falls back to a default title when brand_name is missing', () => {
    expect(adaptEvaluation({}).title).to.equal('Governance');
  });

  it('groups checks into failed / passed / not-applicable sections', () => {
    const { sections } = adaptEvaluation(RESPONSE);
    const [failed, passed, notApplicable] = sections;

    expect(failed.tone).to.equal('negative');
    expect(failed.items).to.have.lengthOf(2); // one text NO + failing-without-fix
    expect(passed.tone).to.equal('positive');
    expect(passed.items).to.have.lengthOf(2); // text YES + image YES
    expect(notApplicable.tone).to.equal('neutral');
    expect(notApplicable.items).to.have.lengthOf(1);
  });

  it('opens the failed section by default when there are failures', () => {
    const { sections } = adaptEvaluation(RESPONSE);
    expect(sections[0].defaultOpen).to.equal(true);
    expect(sections[1].defaultOpen).to.equal(false);
  });

  it('opens the passed section by default when nothing failed', () => {
    const { sections } = adaptEvaluation({
      text_evaluation: {
        evaluations: [
          { check_title: 'ok', alignment: 'YES', reasoning: 'r', suggestions: null, category: 'c' },
        ],
      },
    });
    expect(sections[0].defaultOpen).to.equal(false);
    expect(sections[1].defaultOpen).to.equal(true);
  });

  it('builds a suggestion item for a NO check that has suggestions', () => {
    const { sections } = adaptEvaluation(RESPONSE);
    const item = sections[0].items.find((it) => it.title === 'Failing with a suggested fix');
    expect(item.suggestion).to.exist;
    expect(item.suggestion.suggested).to.equal('Apply the recommended change.');
    expect(item.suggestion.issue).to.equal(item.description);
    expect(item.suggestion.context.category).to.equal('Category A');
    expect(item.check).to.be.undefined;
  });

  it('builds a check item (not a suggestion) for a NO check without suggestions', () => {
    const { sections } = adaptEvaluation(RESPONSE);
    const item = sections[0].items.find((it) => it.title === 'Failing without a fix');
    expect(item.check).to.exist;
    expect(item.suggestion).to.be.undefined;
  });

  it('labels image checks with the asset basename', () => {
    const { sections } = adaptEvaluation(RESPONSE);
    const item = sections[1].items.find((it) => it.title === 'Passing image check');
    expect(item.check.label).to.equal('sample-image.jpg');
  });

  it('produces summary tiles matching the section counts', () => {
    const { summary } = adaptEvaluation(RESPONSE);
    expect(summary.map((t) => [t.label, t.value])).to.deep.equal([
      ['Failed', 2],
      ['Passed', 2],
      ['Not applicable', 1],
    ]);
  });

  it('tolerates an empty response', () => {
    const { summary, sections } = adaptEvaluation();
    expect(summary.every((t) => t.value === 0)).to.equal(true);
    expect(sections.every((s) => s.items.length === 0)).to.equal(true);
  });
});
