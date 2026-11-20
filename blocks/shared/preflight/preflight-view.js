export const PREFLIGHT_VIEW_ID = 'preflight';
export const PREFLIGHT_TAG = 'da-preflight';

export default function createPreflightView() {
  return {
    id: PREFLIGHT_VIEW_ID,
    label: 'Preflight',
    section: 'Editor',
    firstParty: true,
    load: async () => {
      await import('./preflight.js');
      return document.createElement(PREFLIGHT_TAG);
    },
  };
}
