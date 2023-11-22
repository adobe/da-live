import loadPage from './scripts.js';

(function daPreview() {
  let port2;

  async function onMessage(e) {
    if (e.data.set === 'body') {
      document.body.outerHTML = e.data.body;
      await loadPage();
    }

    if (e.data.get === 'height') {
      const height = `${document.documentElement.offsetHeight}px`;
      port2.postMessage(height);
    }
  }

  function initPort(e) {
    port2 = e.ports[0];
    port2.onmessage = onMessage;
  }

  window.addEventListener('message', initPort);
}());
