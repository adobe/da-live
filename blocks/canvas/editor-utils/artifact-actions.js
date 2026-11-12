import { canvasBus } from '../utils/canvas-bus.js';
import { proposalComparisonContext } from '../utils/proposal.js';

export async function handleArtifactAction({ action, artifact, context }) {
  if (action?.name !== 'editor.viewDiff') return { ok: false, error: 'Unsupported artifact action.' };
  try {
    if (!artifact || artifact.id !== action.artifactId || !Array.isArray(artifact.components)) {
      throw new Error('The action does not belong to this artifact.');
    }
    const records = new Map();
    artifact.components.forEach((record) => {
      if (!record || typeof record.id !== 'string' || records.has(record.id)) {
        throw new Error('The artifact contains missing or duplicate component IDs.');
      }
      records.set(record.id, record);
    });
    const source = records.get(action.componentId);
    const event = source?.action?.event;
    const ref = action.context?.proposedPath;
    const match = typeof ref?.path === 'string' && /^\/components\/([a-zA-Z0-9_-]+)\/text$/.exec(ref.path);
    if (!['Button', 'ActionButton'].includes(source?.component)
      || event?.name !== action.name || !match
      || Object.keys(action.context).length !== 1 || Object.keys(ref).length !== 1
      || event.context?.proposedPath?.path !== ref.path) {
      throw new Error('View diff requires a proposedPath reference to a Text component.');
    }
    const record = records.get(match[1]);
    if (record?.component !== 'Text' || typeof record.text !== 'string') {
      throw new Error('The staged page reference must contain literal Text.');
    }
    const proposedPath = record.text;
    proposalComparisonContext({ proposedPath, context });
    return await new Promise((resolve) => {
      canvasBus.comparisonRequest.emit({
        action: 'openComparison',
        details: { candidate: 'proposal', baseline: 'source', proposedPath },
        context: { ...context },
        resolve,
      });
    });
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
