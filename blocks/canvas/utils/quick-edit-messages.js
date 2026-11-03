import { getNx1 } from '../../../scripts/utils.js';

// Quick-edit only exists under nx/ (never nx2/), regardless of the page's nxVer
// flag — force the base nx here so callers just import MESSAGE_TYPES without
// having to know about nx-version resolution.
const quickEditNx = getNx1();

export const { MESSAGE_TYPES } = await import(`${quickEditNx}/utils/message-types.js`);
