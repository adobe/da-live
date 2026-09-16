// Maps our provider category shape ({ title, checks: [{ title, results }] }) into a
// single global summary + three tone-based sections (Failed/Passed/Not applicable) —
// matching the page-evaluation UX rather than grouping by category. `error`/`warn` both
// read as "Failed" (still something to look at), `success` is "Passed", `info` is
// "Not applicable" (no pass/fail judgment — see VALIDATION_SEVERITY.INFO).
const TONE_BY_BADGE = {
  error: 'negative',
  warn: 'negative',
  success: 'positive',
  info: 'neutral',
};

function toneOf(badge) {
  return TONE_BY_BADGE[badge] ?? 'neutral';
}

function flattenItems(categories) {
  return categories.flatMap((category) => category.checks.flatMap(
    (check) => check.results.map((result) => ({
      title: check.title,
      category: category.title,
      result,
      tone: toneOf(result.badge),
    })),
  ));
}

function countLabel(n, verb) {
  return `${n} check${n === 1 ? '' : 's'} ${verb}`;
}

export function buildRenderModel(categories) {
  const items = flattenItems(categories);
  const byTone = (tone) => items.filter((item) => item.tone === tone);

  const failed = byTone('negative');
  const passed = byTone('positive');
  const notApplicable = byTone('neutral');

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

  return { summary, sections };
}
