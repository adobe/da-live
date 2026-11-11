import initGreeting from '../shared/da-greeting/da-greeting.js';

export default function init(el) {
  const landing = el.closest('da-landing');
  if (!el.isConnected || !landing?.scope) {
    el.hidden = true;
    return;
  }
  initGreeting(el, { profile: landing.profile });
}
