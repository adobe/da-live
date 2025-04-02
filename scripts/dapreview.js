let port2;

async function loadCSS(href) {
  return new Promise((resolve, reject) => {
    if (!document.head.querySelector(`link[href="${href}"]`)) {
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

function getHeight() {
  return document.documentElement.offsetHeight;
}

/**
 * Watch height is provided as a catch
 * all for slow or lazily loaded items.
 */
function watchHeight() {
  let prevHeight = getHeight();
  setInterval(() => {
    const currHeight = getHeight();
    if (currHeight !== prevHeight) {
      prevHeight = currHeight;
      port2.postMessage(`${currHeight}px`);
    }
  }, 3000);
}

export default async function daPreview(loadPage) {
  const { origin } = new URL(import.meta.url);
  await loadCSS(new URL('/styles/dapreview.css', origin).toString());

  async function onMessage(e) {
    if (e.data.set === 'body') {
      document.body.innerHTML = e.data.body;
      await loadPage();
    }

    if (e.data.get === 'height') {
      setTimeout(() => { port2.postMessage(`${getHeight()}px`); }, 500);
    }
  }

  function initPort(e) {
    if (e.data.init) {
      [port2] = e.ports;
      port2.onmessage = onMessage;
      watchHeight();
    }
  }

  window.addEventListener('message', initPort);
}
