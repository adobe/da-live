import { canvasBus } from '../utils/canvas-bus.js';
import { proposalComparisonContext } from '../utils/proposal.js';
import { getNx2Api } from '../../../scripts/utils.js';

const ARTIFACT_ACTION_NAMES = ['editor.viewDiff', 'editor.resetPage', 'editor.acceptChanges'];
const states = new WeakMap();
const pendingPaths = new Set();
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function artifactState(artifact) {
  if (!states.has(artifact)) {
    states.set(artifact, {
      busy: false,
      completed: new Map(),
      saved: new Set(),
      controls: artifact.components.filter((record) => (
        ['Button', 'ActionButton'].includes(record.component)
        && ARTIFACT_ACTION_NAMES.includes(record.action?.event?.name)
      )).map((record) => ({ record, label: record.label, disabled: record.isDisabled === true })),
    });
  }
  return states.get(artifact);
}

function updateControls(artifact, state, onUpdate) {
  const paths = Object.values(artifact.dataModel.proposals);
  state.controls.forEach(({ record, label, disabled }) => {
    const { event } = record.action;
    const id = /^\/proposals\/([a-zA-Z0-9_-]+)$/.exec(event.context?.proposedPath?.path)?.[1];
    const path = id && artifact.dataModel.proposals[id];
    const completed = state.completed.get(path);
    if (event.name === 'editor.acceptChanges') {
      const done = paths.every((value) => state.completed.has(value));
      record.isDisabled = disabled || state.busy || done;
      record.label = label;
      if (done) {
        record.label = paths.some((value) => state.completed.get(value) === 'accepted')
          ? 'Changes accepted' : 'No changes to accept';
      }
    } else {
      record.isDisabled = disabled || state.busy || !!completed || state.saved.has(path);
      record.label = event.name === 'editor.resetPage' && completed
        ? { reset: 'Draft discarded', accepted: 'Accepted' }[completed] : label;
    }
  });
  onUpdate();
}

export async function handleArtifactAction({
  action, artifact, context, getContext = () => context, onUpdate = () => {}, api,
}) {
  if (!ARTIFACT_ACTION_NAMES.includes(action?.name)) return { ok: false, error: 'Unsupported artifact action.' };
  let state;
  let lockedPaths;
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
    const accept = action.name === 'editor.acceptChanges';
    const key = accept ? 'proposals' : 'proposedPath';
    const ref = action.context?.[key];
    const declared = event?.context?.[key];
    const match = typeof ref?.path === 'string' && /^\/proposals\/([a-zA-Z0-9_-]+)$/.exec(ref.path);
    if (!['Button', 'ActionButton'].includes(source?.component)
      || event?.name !== action.name || (accept ? ref?.path !== '/proposals' : !match)
      || !isRecord(action.context) || Object.keys(action.context).length !== 1
      || !isRecord(ref) || Object.keys(ref).length !== 1
      || !isRecord(event.context) || Object.keys(event.context).length !== 1
      || !isRecord(declared) || Object.keys(declared).length !== 1
      || declared.path !== ref.path) {
      throw new Error(accept ? 'Accept changes requires a proposals reference to /proposals.'
        : 'This action requires a proposedPath reference under /proposals/<id>.');
    }
    const model = artifact.dataModel;
    const proposals = model && Object.hasOwn(model, 'proposals') ? model.proposals : undefined;
    if (!isRecord(proposals) || (accept ? !Object.keys(proposals).length
      : !Object.hasOwn(proposals, match[1]))) {
      throw new Error('The artifact data model must contain the staged page path.');
    }
    const entries = accept ? Object.entries(proposals) : [[match[1], proposals[match[1]]]];
    const targets = entries.map(([id, proposedPath]) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(id) || typeof proposedPath !== 'string') {
        throw new Error('The artifact data model must contain the staged page path.');
      }
      return { proposedPath, ...proposalComparisonContext({ proposedPath, context }) };
    });
    if (new Set(targets.map((target) => target.proposedPath)).size !== targets.length) {
      throw new Error('Each proposal must identify a different staged page.');
    }
    state = artifactState(artifact);
    if (state.busy || targets.some(({ proposedPath }) => pendingPaths.has(proposedPath))) {
      throw new Error('A proposal action is already in progress. Try again when it finishes.');
    }
    if (action.name === 'editor.viewDiff') {
      const { proposedPath } = targets[0];
      if (state.completed.has(proposedPath) || state.saved.has(proposedPath)) {
        throw new Error('This proposal is no longer available for comparison.');
      }
      return await new Promise((resolve) => {
        canvasBus.comparisonRequest.emit({
          action: 'openComparison',
          details: { candidate: 'proposal', baseline: 'source', proposedPath },
          context: { ...context },
          resolve,
        });
      });
    }
    const current = () => {
      const next = getContext();
      if (!context?.org || !context?.site || typeof context?.path !== 'string'
        || next?.org !== context.org || next?.site !== context.site
        || next?.path !== context.path) {
        throw new Error('The page context changed. Retry from the current page.');
      }
    };
    current();
    lockedPaths = targets.map(({ proposedPath }) => proposedPath);
    lockedPaths.forEach((path) => pendingPaths.add(path));
    state.busy = true;
    updateControls(artifact, state, onUpdate);
    const { source: sourceApi } = api || await getNx2Api();
    // Finish cleanup against the captured path even if navigation occurs during the save.
    for (const target of targets) {
      const { proposedPath, org, site, path, proposalPath } = target;
      if (!state.completed.has(proposedPath)) {
        current();
        if (accept && !state.saved.has(proposedPath)) {
          // eslint-disable-next-line no-await-in-loop
          const draft = await sourceApi.get({ org, site, path: proposalPath, cachebust: true });
          current();
          if (draft.status === 404) {
            state.completed.set(proposedPath, 'reset');
          } else {
            if (!draft.ok) throw new Error(`Could not read draft ${proposalPath} (${draft.status}).`);
            // eslint-disable-next-line no-await-in-loop
            const body = await draft.text();
            current();
            // eslint-disable-next-line no-await-in-loop
            const saved = await sourceApi.save({ org, site, path: `/${path}.html`, body });
            if (!saved.ok) throw new Error(`Could not save /${path}.html (${saved.status}). Draft retained.`);
            state.saved.add(proposedPath);
          }
        }
        if (!state.completed.has(proposedPath)) {
          // eslint-disable-next-line no-await-in-loop
          const deleted = await sourceApi.delete({ org, site, path: proposalPath })
            .catch((error) => ({ ok: false, status: error.message }));
          if (!deleted.ok && deleted.status !== 404) {
            const prefix = state.saved.has(proposedPath) ? `Saved /${path}.html, but could` : 'Could';
            const retry = accept
              ? 'Accept changes to retry cleanup without saving again' : 'Reset page';
            throw new Error(`${prefix} not delete draft ${proposalPath} (${deleted.status}). Retry ${retry}.`);
          }
          state.completed.set(proposedPath, accept ? 'accepted' : 'reset');
        }
        canvasBus.comparisonRequest.emit({ action: 'closeComparison', context });
      }
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  } finally {
    if (lockedPaths) {
      lockedPaths.forEach((path) => pendingPaths.delete(path));
      state.busy = false;
      updateControls(artifact, state, onUpdate);
    }
  }
}
