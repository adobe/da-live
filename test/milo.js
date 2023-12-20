import { setLibs } from '../scripts/utils.js';

const miloLibs = setLibs('https://milo.adobe.com/libs');
const { setConfig } = await import(`${miloLibs}/utils/utils.js`);
setConfig({ miloLibs });
