import { isItemSettled } from '../../edit/da-prepare/actions/preflight/providers/engine.js';
import { SEVERITY } from '../../edit/da-prepare/actions/preflight/views/result.js';

// Visual bucketing only - ERROR and WARN both surface as "failed" here, but the actual
// publish-gate pass/fail status (engine.js's computeOverallStatus) stays ERROR-only.
function bucketOf(result) {
  if (result === SEVERITY.NA) return 'na';
  if (result === SEVERITY.ERROR || result === SEVERITY.WARN) return 'failed';
  return 'passed';
}

function toItem(category, check, item) {
  return {
    title: check.title,
    description: item.reason,
    category: category.title,
    check: {
      label: check.title,
      context: { category: category.title, description: item.reason },
    },
  };
}

function collectBuckets(categories) {
  const buckets = { failed: [], passed: [], na: [] };
  categories.forEach((category) => {
    category.checks.forEach((check) => {
      check.items.forEach((item) => {
        if (!isItemSettled(item)) return;
        buckets[bucketOf(item.result)].push(toItem(category, check, item));
      });
    });
  });
  return buckets;
}

const countLabel = (n, verb) => `${n} check${n === 1 ? '' : 's'} ${verb}`;

// Adapts provider-registry Category[] into the { title, summary, sections } shape consumed
// by da-nx's shared nx-page-eval renderer.
export function adaptPreflightResults(categories = []) {
  const { failed, passed, na } = collectBuckets(categories);

  return {
    title: 'Preflight',
    summary: [
      { label: 'Failed', value: failed.length, tone: 'negative' },
      { label: 'Passed', value: passed.length, tone: 'positive' },
      { label: 'Not applicable', value: na.length, tone: 'neutral' },
    ],
    sections: [
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
        subLabel: countLabel(na.length, 'not executed'),
        tone: 'neutral',
        defaultOpen: false,
        items: na,
      },
    ],
  };
}
