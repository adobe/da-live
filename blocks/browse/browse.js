import { getLibs } from '../../scripts/utils.js';
import Browser from './browser/view.js';

export default async function init(el) {
  const { html, render } = await import(`${getLibs()}/deps/htm-preact.js`);
  render(html`<${Browser} />`, el);
}