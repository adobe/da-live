import { isItemSettled } from '../../edit/da-prepare/actions/preflight/providers/engine.js';
import { SEVERITY } from '../../edit/da-prepare/actions/preflight/views/result.js';

// Visual bucketing only - ERROR and WARN both surface under "failed" here, but the actual
// publish-gate pass/fail status (engine.js's computeOverallStatus) stays ERROR-only.
function bucketOf(result) {
  if (result === SEVERITY.NA) return 'na';
  if (result === SEVERITY.ERROR || result === SEVERITY.WARN) return 'failed';
  return 'passed';
}

// Items are live pf-result/pf-link elements (see views/result.js, providers/ootb/views/link.js)
// that render their own detail - never flatten them into plain data, or check-specific
// rendering (e.g. pf-link's clickable URL + AEM-details expando) is lost.
function toEntry(category, check, item) {
  return { category: category.title, title: check.title, item };
}

function collectBuckets(categories) {
  const buckets = { failed: [], passed: [], na: [] };
  categories.forEach((category) => {
    category.checks.forEach((check) => {
      check.items.forEach((item) => {
        if (!isItemSettled(item)) return;
        buckets[bucketOf(item.result)].push(toEntry(category, check, item));
      });
    });
  });
  return buckets;
}

const countLabel = (n, verb) => `${n} check${n === 1 ? '' : 's'} ${verb}`;

// Adapts provider-registry Category[] into the { summary, sections } shape consumed by
// <preflight-results>.
export function adaptPreflightResults(categories = []) {
  const { failed, passed, na } = collectBuckets(categories);

  return {
    summary: [
      { label: 'Failed', value: failed.length, severity: SEVERITY.ERROR },
      { label: 'Passed', value: passed.length, severity: SEVERITY.SUCCESS },
      { label: 'Not applicable', value: na.length, severity: SEVERITY.NA },
    ],
    sections: [
      {
        label: 'Failed checks',
        subLabel: countLabel(failed.length, 'failed'),
        severity: SEVERITY.ERROR,
        defaultOpen: failed.length > 0,
        entries: failed,
      },
      {
        label: 'Passed checks',
        subLabel: countLabel(passed.length, 'passed'),
        severity: SEVERITY.SUCCESS,
        defaultOpen: failed.length === 0,
        entries: passed,
      },
      {
        label: 'Not applicable',
        subLabel: countLabel(na.length, 'not executed'),
        severity: SEVERITY.NA,
        defaultOpen: false,
        entries: na,
      },
    ],
  };
}
