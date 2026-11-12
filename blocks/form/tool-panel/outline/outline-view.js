export const OUTLINE_VIEW_ID = 'outline';

/** The form's Outline view. Canvas has its own under the same name. */
export default function createOutlineView() {
  return {
    id: OUTLINE_VIEW_ID,
    label: 'Outline',
    section: 'Editor',
    firstParty: true,
    load: async () => {
      await import('./outline.js');
      return document.createElement('ew-form-outline');
    },
  };
}
