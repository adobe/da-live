async function loadCSS(href) {
  return new Promise((resolve, reject) => {
    if (!document.querySelector(`head > link[href="${href}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      link.onload = resolve;
      link.onerror = reject;
      document.head.append(link);
    } else {
      resolve();
    }
  });
}

export default async function daPreview(loadPage) {
  const { origin } = new URL(import.meta.url);
  await loadCSS(new URL('/styles/dapreview.css', origin).toString());

  let port2;
  async function onMessage(e) {
    if (e.data.set === 'body') {
      document.body.outerHTML = e.data.body;
      await loadPage();
    }

    if (e.data.get === 'height') {
      const delay = e.data.set === 'body' ? 2000 : 0;

      setTimeout(() => {
        const height = `${document.documentElement.offsetHeight}px`;
        port2.postMessage(height);
      }, delay);
    }
  }

  function initPort(e) {
    if (e.data.init) {
      [port2] = e.ports;
      port2.onmessage = onMessage;
    }
  }

  window.addEventListener('message', initPort);
}
