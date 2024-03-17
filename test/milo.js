import { setNx, codeBase } from '../scripts/utils.js';

const nx = setNx('https://da.live/nx');
const { setConfig } = await import(`${nx}/scripts/nexter.js`);
setConfig({ codeBase });
