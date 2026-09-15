// Adapts an Experience Governance "evaluate page" REST response
// (POST https://enterprise-context.adobe.io/api/v0/evaluate/page) into the
// { title, summary, sections } shape consumed by the shared page-evaluation
// renderer (nx-page-eval / artifact type PageEvaluationWithIcons in da-nx).

const TONE_BY_ALIGNMENT = { YES: 'positive', NO: 'negative' };

const toneOf = (alignment) => TONE_BY_ALIGNMENT[alignment] ?? 'neutral';

function basename(source = '') {
  const last = source.split('?')[0].split('#')[0].split('/').pop();
  return last || source;
}

function toItem(check, assetLabel) {
  const { check_title: title, alignment, reasoning, suggestions, category } = check;
  const context = { category, description: reasoning };
  const label = assetLabel ?? title;

  if (alignment === 'NO' && suggestions) {
    return {
      title,
      description: reasoning,
      suggestion: { label, issue: reasoning, suggested: suggestions, context },
    };
  }
  return { title, description: reasoning, check: { label, context } };
}

function collectChecks(response) {
  const textChecks = (response.text_evaluation?.evaluations ?? [])
    .map((check) => ({ check }));
  const imageChecks = (response.image_evaluations ?? [])
    .flatMap((image) => (image.evaluations ?? [])
      .map((check) => ({ check, assetLabel: basename(image.source) })));
  return [...textChecks, ...imageChecks];
}

export function adaptEvaluation(response = {}) {
  const entries = collectChecks(response).map(({ check, assetLabel }) => ({
    tone: toneOf(check.alignment),
    item: toItem(check, assetLabel),
  }));

  const itemsByTone = (tone) => entries
    .filter((entry) => entry.tone === tone)
    .map((entry) => entry.item);
  const failed = itemsByTone('negative');
  const passed = itemsByTone('positive');
  const notApplicable = itemsByTone('neutral');

  const countLabel = (n, verb) => `${n} check${n === 1 ? '' : 's'} ${verb}`;

  const summary = [
    { label: 'Failed', value: failed.length, tone: 'negative' },
    { label: 'Passed', value: passed.length, tone: 'positive' },
    { label: 'Not applicable', value: notApplicable.length, tone: 'neutral' },
  ];

  const sections = [
    {
      label: 'Failed checks',
      subLabel: countLabel(failed.length, 'failed'),
      tone: 'negative',
      defaultOpen: failed.length > 0,
      items: failed,
    },
    {
      label: 'Passed checks',
      subLabel: countLabel(passed.length, 'passed'),
      tone: 'positive',
      defaultOpen: failed.length === 0,
      items: passed,
    },
    {
      label: 'Not applicable',
      subLabel: countLabel(notApplicable.length, 'not executed'),
      tone: 'neutral',
      defaultOpen: false,
      items: notApplicable,
    },
  ];

  return {
    title: response.brand_name || 'Governance',
    summary,
    sections,
  };
}
