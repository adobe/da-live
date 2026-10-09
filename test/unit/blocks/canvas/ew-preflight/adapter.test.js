import { expect } from '@esm-bundle/chai';
import { adaptEvaluation } from '../../../../../blocks/canvas/ew-preflight/adapter.js';

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

const SITE_CODE_EVALUATION = {
  source: 'https://example.com/page',
  evaluations: [
    {
      check_title: 'Headings are in a valid accessibility order',
      alignment: 'NA',
      reasoning: 'No headings on the page.',
      suggestions: null,
      category: null,
    },
    {
      check_title: 'Baseline preflight check',
      alignment: 'YES',
      reasoning: 'Site preflight is wired up.',
      suggestions: null,
      category: null,
    },
    {
      check_title: 'Cards block has valid structure',
      alignment: 'NA',
      reasoning: 'No cards block on the page.',
      suggestions: null,
      category: null,
    },
    {
      check_title: 'Page has exactly one H1',
      alignment: 'NO',
      reasoning: 'Found 0 <h1> element(s) in main; expected exactly 1.',
      suggestions: 'Add a single H1 heading.',
      category: null,
    },
    {
      check_title: 'All images have alt text',
      alignment: 'NO',
      reasoning: 'One image is missing alt text.',
      suggestions: 'Provide descriptive alt text for every image.',
      category: null,
    },
  ],
};

describe('ew-preflight adapter', () => {
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

  it('exposes the failed count for the publish gate', () => {
    expect(adaptEvaluation(RESPONSE).failed).to.equal(2);
    expect(adaptEvaluation({
      text_evaluation: {
        evaluations: [
          { check_title: 'ok', alignment: 'YES', reasoning: 'r', suggestions: null, category: 'c' },
        ],
      },
    }).failed).to.equal(0);
  });

  it('tolerates an empty response', () => {
    const { summary, sections, failed } = adaptEvaluation();
    expect(summary.every((t) => t.value === 0)).to.equal(true);
    expect(sections.every((s) => s.items.length === 0)).to.equal(true);
    expect(failed).to.equal(0);
  });

  it('includes site-code checks in the existing groups, before text and image checks', () => {
    const { sections, summary, failed } = adaptEvaluation({
      ...RESPONSE,
      site_code_evaluation: SITE_CODE_EVALUATION,
    });

    expect(sections[0].items.map((item) => item.title)).to.deep.equal([
      'Page has exactly one H1',
      'All images have alt text',
      'Failing with a suggested fix',
      'Failing without a fix',
    ]);
    expect(sections[1].items.map((item) => item.title)).to.deep.equal([
      'Baseline preflight check',
      'Passing check',
      'Passing image check',
    ]);
    expect(sections[2].items.map((item) => item.title)).to.deep.equal([
      'Headings are in a valid accessibility order',
      'Cards block has valid structure',
      'Not applicable check',
    ]);
    expect(summary.map((tile) => tile.value)).to.deep.equal([4, 3, 3]);
    expect(failed).to.equal(4);
    expect(sections.map((section) => section.defaultOpen)).to.deep.equal([true, false, false]);
  });

  it('matches the live response shape with three failures, three passes, and two NA checks', () => {
    const { sections, summary, failed } = adaptEvaluation({
      text_evaluation: { evaluations: [RESPONSE.text_evaluation.evaluations[0]] },
      image_evaluations: [
        ...RESPONSE.image_evaluations,
        { ...RESPONSE.image_evaluations[0], source: 'https://example.com/assets/another-image.jpg' },
      ],
      site_code_evaluation: SITE_CODE_EVALUATION,
    });

    expect(summary.map((tile) => [tile.label, tile.value])).to.deep.equal([
      ['Failed', 3],
      ['Passed', 3],
      ['Not applicable', 2],
    ]);
    expect(sections.map((section) => section.items.length)).to.deep.equal([3, 3, 2]);
    expect(sections.map((section) => section.subLabel)).to.deep.equal([
      '3 checks failed',
      '3 checks passed',
      '2 checks not executed',
    ]);
    expect(failed).to.equal(3);
  });

  it('adapts a site-code-only response and preserves suggestions and null categories', () => {
    const response = { site_code_evaluation: SITE_CODE_EVALUATION };
    const { sections, summary, failed } = adaptEvaluation(response);
    const [headingOrder, baseline, , singleH1] = SITE_CODE_EVALUATION.evaluations;

    expect(summary.map((tile) => tile.value)).to.deep.equal([2, 1, 2]);
    expect(failed).to.equal(2);
    expect(sections[0].items[0]).to.deep.equal({
      title: singleH1.check_title,
      description: singleH1.reasoning,
      suggestion: {
        label: singleH1.check_title,
        issue: singleH1.reasoning,
        suggested: singleH1.suggestions,
        context: { category: null, description: singleH1.reasoning },
      },
    });
    expect(sections[1].items[0]).to.deep.equal({
      title: baseline.check_title,
      description: baseline.reasoning,
      check: {
        label: baseline.check_title,
        context: { category: null, description: baseline.reasoning },
      },
    });
    expect(sections[2].items[0]).to.deep.equal({
      title: headingOrder.check_title,
      description: headingOrder.reasoning,
      check: {
        label: headingOrder.check_title,
        context: { category: null, description: headingOrder.reasoning },
      },
    });
  });

  it('keeps a failed site-code check without suggestions as a check item', () => {
    const check = { ...SITE_CODE_EVALUATION.evaluations[3], suggestions: null };
    const siteCode = { evaluations: [check] };
    const { sections, failed } = adaptEvaluation({ site_code_evaluation: siteCode });

    expect(failed).to.equal(1);
    expect(sections[0].items[0]).to.deep.equal({
      title: check.check_title,
      description: check.reasoning,
      check: {
        label: check.check_title,
        context: { category: null, description: check.reasoning },
      },
    });
  });

  it('opens passed checks when site-code checks pass or are not applicable', () => {
    const siteCode = { evaluations: SITE_CODE_EVALUATION.evaluations.slice(0, 3) };
    const { sections, summary, failed } = adaptEvaluation({ site_code_evaluation: siteCode });

    expect(summary.map((tile) => tile.value)).to.deep.equal([0, 1, 2]);
    expect(failed).to.equal(0);
    expect(sections.map((section) => section.defaultOpen)).to.deep.equal([false, true, false]);
  });

  [undefined, null, {}, { evaluations: null }, { evaluations: [] }].forEach((siteCode) => {
    it(`preserves text/image results with absent or empty site-code data: ${JSON.stringify(siteCode)}`, () => {
      expect(adaptEvaluation({
        ...RESPONSE,
        site_code_evaluation: siteCode,
      })).to.deep.equal(adaptEvaluation(RESPONSE));
      expect(adaptEvaluation({ site_code_evaluation: siteCode })).to.deep.equal(adaptEvaluation());
    });
  });

  describe('built-in checks', () => {
    // Synthetic slice of built_in_evaluation (DA out-of-the-box preflight checks).
    const BUILT_IN_EVALUATION = {
      source: 'https://example.com/page',
      status: 'complete',
      evaluations: [
        {
          check_id: 'h1-count',
          check_title: 'H1 count',
          alignment: 'NO',
          reasoning: 'No H1 found.',
          suggestions: 'Add a single H1 heading.',
          category_id: 'content',
          category: 'Content',
        },
        {
          check_id: 'links:abc',
          check_title: 'Links: https://example.com/broken',
          alignment: 'NO',
          reasoning: 'Could not validate link.',
          suggestions: null,
          category_id: 'references',
          category: 'References',
        },
        {
          check_id: 'seo-description',
          check_title: 'Description',
          alignment: 'YES',
          reasoning: 'Description found.',
          suggestions: null,
          category_id: 'seo',
          category: 'SEO',
        },
        {
          check_id: 'fragments',
          check_title: 'Fragments',
          alignment: 'NA',
          reasoning: 'No fragments on the page.',
          suggestions: null,
          category_id: 'references',
          category: 'References',
        },
        {
          check_id: '__built_in__',
          check_title: 'Built-in checks',
          alignment: 'Error',
          reasoning: 'Could not fetch the page source.',
          suggestions: null,
          category: null,
        },
      ],
    };

    it('lists built-in checks first in each group', () => {
      const { sections, summary, failed } = adaptEvaluation({
        ...RESPONSE,
        site_code_evaluation: SITE_CODE_EVALUATION,
        built_in_evaluation: BUILT_IN_EVALUATION,
      });

      expect(sections[0].items.map((item) => item.title)).to.deep.equal([
        'H1 count',
        'Links: https://example.com/broken',
        'Page has exactly one H1',
        'All images have alt text',
        'Failing with a suggested fix',
        'Failing without a fix',
      ]);
      expect(sections[1].items.map((item) => item.title)).to.deep.equal([
        'Description',
        'Baseline preflight check',
        'Passing check',
        'Passing image check',
      ]);
      expect(sections[2].items.map((item) => item.title)).to.deep.equal([
        'Fragments',
        'Built-in checks',
        'Headings are in a valid accessibility order',
        'Cards block has valid structure',
        'Not applicable check',
      ]);
      expect(summary.map((tile) => tile.value)).to.deep.equal([6, 4, 5]);
      expect(failed).to.equal(6);
    });

    it('builds suggestion and check items for failing built-in checks', () => {
      const { sections } = adaptEvaluation({ built_in_evaluation: BUILT_IN_EVALUATION });
      const [h1, link] = sections[0].items;

      expect(h1.suggestion).to.deep.equal({
        label: 'H1 count',
        issue: 'No H1 found.',
        suggested: 'Add a single H1 heading.',
        context: { category: 'Content', description: 'No H1 found.' },
      });
      expect(link.check.label).to.equal('Links: https://example.com/broken');
      expect(link.suggestion).to.be.undefined;
    });

    it('treats an Error row as not applicable so it does not block publish', () => {
      const evaluations = [BUILT_IN_EVALUATION.evaluations[4]];
      const { sections, failed } = adaptEvaluation({ built_in_evaluation: { evaluations } });
      expect(failed).to.equal(0);
      expect(sections[2].items.map((item) => item.title)).to.deep.equal(['Built-in checks']);
    });

    it('adapts a built-in-only response', () => {
      const { summary, failed } = adaptEvaluation({ built_in_evaluation: BUILT_IN_EVALUATION });
      expect(summary.map((tile) => tile.value)).to.deep.equal([2, 1, 2]);
      expect(failed).to.equal(2);
    });

    [undefined, null, {}, { evaluations: null }, { evaluations: [] }, { evaluations: 'oops' }]
      .forEach((builtIn) => {
        it(`keeps other checks without built-in data: ${JSON.stringify(builtIn)}`, () => {
          expect(adaptEvaluation({
            ...RESPONSE,
            built_in_evaluation: builtIn,
          })).to.deep.equal(adaptEvaluation(RESPONSE));
          const onlyBuiltIn = adaptEvaluation({ built_in_evaluation: builtIn });
          expect(onlyBuiltIn).to.deep.equal(adaptEvaluation());
        });
      });
  });
});
