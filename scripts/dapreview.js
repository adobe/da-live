(function daPreview() {
  let port2;

  function onMessage(e) {
    if (e.data.get === 'height') {
      console.log(document.documentElement.offsetHeight);
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
