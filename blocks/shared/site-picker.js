import { getNx } from '../../scripts/utils.js';

await import(`${getNx()}/blocks/shared/picker/picker.js`);

export function updateSitePicker({ picker, sites, value }) {
  picker.items = [
    { section: 'Your Sites' },
    ...(sites || []),
    { divider: true },
    { value: 'add-site', label: 'Add site...', action: true },
  ];
  picker.value = value || '';
}

export function createSitePicker({ onSelect, onAdd }) {
  const picker = document.createElement('nx-picker');
  picker.setAttribute('aria-label', 'Workspace site');
  picker.placeholder = 'Choose a site';
  picker.size = 'm';
  picker.variant = 'field';
  picker.addEventListener('change', ({ detail: { value } }) => {
    if (value === 'add-site') onAdd();
    else onSelect(value);
  });
  return picker;
}
