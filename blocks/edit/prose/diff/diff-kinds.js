import { getDiffLabels } from '../../utils/helpers.js';

const KIND_SIDES = {
  incoming: ['upstream', 'added'],
  'removed-upstream': ['upstream', 'removed'],
  'local-removed': ['local', 'removed'],
  local: ['local', 'added'],
  'upstream-changed': ['upstream', 'changed'],
  'local-changed': ['local', 'changed'],
};

export function getDiffKind(node) {
  const kind = node?.attrs?.diffKind || node?.firstChild?.attrs?.diffKind;
  return kind === 'conflict' || KIND_SIDES[kind] ? kind : null;
}

export function getKindLabel(kind) {
  if (kind === 'conflict') return 'Both changed';
  if (!KIND_SIDES[kind]) return null;
  const [side, text] = KIND_SIDES[kind];
  return `${getDiffLabels()[side]} ${text}`;
}
