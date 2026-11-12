import { getPreviewOrigin } from '../constants.js';
import { evaluatePage } from './api.js';
import { adaptEvaluation } from './evaluation.js';

/**
 * Creates the evaluator that runs the Experience Context checks on the preview of a page.
 *
 * @param {object} options
 * @param {Function} options.resolveBranch - Resolves the page's preview branch from
 *   { org, site, path }, or a falsy value when the editor can't determine it.
 */
export default function createExperienceContextEvaluator({ resolveBranch } = {}) {
  if (typeof resolveBranch !== 'function') {
    throw new TypeError('createExperienceContextEvaluator needs a resolveBranch function');
  }

  async function resolvePageUrl({ org, site, path }) {
    const relPath = path ? path.replace(/^\//, '') : '';
    // The panel can evaluate before the editor finishes resolving this page's branch.
    const branch = await resolveBranch({ org, site, path: relPath || undefined });
    if (!branch) {
      const error = new Error('Branch not resolved');
      error.detail = 'Could not determine the preview branch for this page. Try again.';
      throw error;
    }

    const origin = getPreviewOrigin(org, site, branch);
    return relPath ? `${origin}/${relPath}` : origin;
  }

  return {
    async evaluate(target) {
      const response = await evaluatePage(await resolvePageUrl(target));
      return adaptEvaluation(response);
    },
  };
}
