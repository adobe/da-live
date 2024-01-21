export const origin = (() => {
  const adminUrls = {
    local: 'http://localhost:8787',
    stage: 'https://stage-admin.da.live',
    prod: 'https://admin.da.live',
  };

  let daOrigin = adminUrls.prod;

  const storage = localStorage.getItem('daAdmin');
  if (storage) daOrigin = adminUrls[storage];

  const query = new URL(window.location.href).searchParams.get('da-admin');
  if (query) {
    if (query === 'reset') {
      localStorage.removeItem('daAdmin');
    } else {
      localStorage.setItem('daAdmin', query);
      daOrigin = adminUrls[query] || adminUrls.prod;
    }
  }

  return daOrigin;
})();

export const conOrigin = 'https://content.da.live';
export const hlxOrigin = 'https://admin.hlx.page';
