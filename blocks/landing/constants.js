export const LIST_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'folder', label: 'Folder' },
  { key: 'modified', label: 'Modified at' },
  { key: 'modifiedBy', label: 'Modified by' },
  { key: 'actions', label: 'File information and Favorite', hideLabel: true },
];

export const LIST_COLUMN_KEYS = LIST_COLUMNS.map(({ key }) => key);
