import { getLibs } from '../../scripts/utils.js';

function setStorage() {
  localStorage.setItem('adobeid', 'hereiam');
  window.location.reload();
}

export default async function init(el) {
  const { createTag } = await import(`${getLibs()}/utils/utils.js`);
  const bg = createTag('img', { src: '/blocks/login/img/dark-alley.jpg', class: 'da-login-bg' });

  // Left Side
  const logo = createTag('img', { class: 'aec-logo', src: '/blocks/aec-shell/img/aec.svg#AdobeExperienceCloud'});
  const title = createTag('h1', { class: 'da-title' }, 'Project Dark Alley');
  const logoContainer = createTag('div', { class: 'da-title-container' }, [logo, title]);

  // Right Side
  const button = createTag('button', { class: 'da-login-button con-button blue button-l' }, 'Hello world');
  button.addEventListener('click', setStorage);

  // Container
  const container = createTag('div', { class: 'da-login-container' }, [logoContainer, button]);

  el.append(bg, container);
}
