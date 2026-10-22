import { getNx2 } from '../../../scripts/utils.js';

const { loadStyle } = await import(`${getNx2()}/utils/utils.js`);

// Default field chrome stylesheet, adopted alongside each field's own styles.
export default await loadStyle(import.meta.url);
