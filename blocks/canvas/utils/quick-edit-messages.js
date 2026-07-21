import { getNx } from '../../../scripts/utils.js';

// Quick-edit only exists under nx/ (never nx2/), regardless of the page's nxVer
// flag — force the base nx here so callers just import MessageTypes without
// having to know about nx-version resolution.
const nx = getNx();
const quickEditNx = nx.endsWith('/nx2') ? nx.slice(0, -1) : nx;

export const { MessageTypes } = await import(`${quickEditNx}/utils/message-types.js`);
