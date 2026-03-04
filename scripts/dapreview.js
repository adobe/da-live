let port;

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

function handleScrollTo() {
  const cursorEl = window.document.getElementById('da-cursor-position');
  if (cursorEl) {
    // Calculate header height dynamically and set scroll-margin
    const header = document.querySelector('header');
    const headerHeight = header ? header.offsetHeight : 0;
    const additionalPadding = 20;

    // Set scroll-margin-top dynamically
    cursorEl.style.scrollMarginTop = `${headerHeight + additionalPadding}px`;

    // Use native scrollIntoView with the margin applied
    cursorEl.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  }
  port.postMessage({ updated: true });
}

export default async function daPreview(loadPage) {
  const { origin } = new URL(import.meta.url);
  await loadCSS(new URL('/styles/dapreview.css', origin).toString());

  async function onMessage(e) {
    if (e.data.set === 'body') {
      const doc = new DOMParser().parseFromString(e.data.body, 'text/html');
      document.body.className = 'da-preview';
      document.body.innerHTML = doc.body.innerHTML;
      await loadPage();
      handleScrollTo();
    }
  }

  function initPort(e) {
    if (e.origin !== 'https://da.live'
      && e.origin !== 'http://localhost:3000'
      && e.origin !== 'https://localhost'
      && !e.origin.match(/^https:\/\/[a-z0-9-]+--da-live--adobe\.aem\.(page|live)$/)
    ) {
      // eslint-disable-next-line no-console
      console.warn('DA Preview: Origin not allowed');
      return;
    }

    if (e.data?.ready) {
      [port] = e.ports;

      // Tell the other side we are ready
      port.postMessage({ ready: true });

      // Going forward, all messages will be sent via the port
      port.onmessage = onMessage;
      // watchHeight();
    }
  }

  window.addEventListener('message', initPort);
}
