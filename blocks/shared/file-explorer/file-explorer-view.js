export const FILE_EXPLORER_VIEW_ID = 'files';
export const FILE_EXPLORER_TAG = 'da-file-explorer';

export default function createFileExplorerView() {
  return {
    id: FILE_EXPLORER_VIEW_ID,
    label: 'Content',
    section: 'Editor',
    firstParty: true,
    load: async () => {
      await import('./file-explorer.js');
      return document.createElement(FILE_EXPLORER_TAG);
    },
  };
}
