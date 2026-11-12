export const PREFLIGHT_VIEW_ID = 'preflight';
export const PREFLIGHT_TAG = 'da-preflight';

// Required. Tells Preflight which tool panel view is active, so it evaluates only
// while shown and frees a waiting publish once the panel closes.
const PAGE_MEMBERS = ['subscribeActiveView'];

// Required. Runs the checks on a page and returns the results to show, or the
// reason the author sees when the checks can't run.
const EVALUATOR_MEMBERS = ['evaluate'];

// Optional. Connects Preflight to publishing. It hands Preflight each publish
// request, including one made before the view opened, and tells the publish
// whether the checks passed, so it can go ahead or stop. Without it Preflight
// only shows results.
const PUBLISH_HOOK_MEMBERS = ['subscribeRunRequest', 'takePendingRunRequest', 'reportStatus'];

function assertPort(name, port, members) {
  const missing = members.filter((member) => typeof port?.[member] !== 'function');
  if (missing.length) {
    const names = missing.map((member) => `${name}.${member}`).join(', ');
    throw new TypeError(`createPreflightView needs ${names}`);
  }
}

export default function createPreflightView({ page, evaluator, publishHook } = {}) {
  assertPort('page', page, PAGE_MEMBERS);
  assertPort('evaluator', evaluator, EVALUATOR_MEMBERS);
  if (publishHook) {
    assertPort('publishHook', publishHook, PUBLISH_HOOK_MEMBERS);
  }

  return {
    id: PREFLIGHT_VIEW_ID,
    label: 'Preflight',
    section: 'Editor',
    firstParty: true,
    load: async () => {
      await import('./preflight.js');
      return Object.assign(document.createElement(PREFLIGHT_TAG), { page, evaluator, publishHook });
    },
  };
}
