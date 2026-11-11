import './setup-nx.js';
import greeting from '../../blocks/greeting/greeting.js';
import landing from '../../blocks/landing/landing.js';
import recentFiles from '../../blocks/recent-files/recent-files.js';
import { getNx2 } from '../../scripts/utils.js';

const { setBlockMocks } = await import(`${getNx2()}/scripts/nx.js`);
setBlockMocks({ greeting, landing, 'recent-files': recentFiles });
