export const VERSION_HISTORY_VIEW_ID = 'versions';
export const VERSION_HISTORY_TAG = 'da-version-history';

// Gives Version history access to the open document. It tells whether the author can
// write and when that changes, loads a version and the current content in the same
// HTML shape so they can be compared, restores a version, and names the elements a
// comparison covers.
const EDITOR_MEMBERS = [
  'canWrite',
  'subscribe',
  'fetchVersion',
  'getCurrentHtml',
  'restore',
  'getCompareArea',
];

export default function createVersionHistoryView({ editor } = {}) {
  const missing = EDITOR_MEMBERS.filter((member) => typeof editor?.[member] !== 'function');
  if (missing.length) {
    const names = missing.map((member) => `editor.${member}`).join(', ');
    throw new TypeError(`createVersionHistoryView needs ${names}`);
  }

  return {
    id: VERSION_HISTORY_VIEW_ID,
    label: 'Versions',
    section: 'Editor',
    firstParty: true,
    load: async () => {
      await import('./version-history.js');
      return Object.assign(document.createElement(VERSION_HISTORY_TAG), { editor });
    },
  };
}
