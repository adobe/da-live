import { setNx, codeBase } from '../../scripts/utils.js';

const nx = setNx('/nx');
const { setConfig } = await import(`${nx}/scripts/nexter.js`);
setConfig({ codeBase });
