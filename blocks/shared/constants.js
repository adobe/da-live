export const CON_ORIGIN = 'https://content.da.live';
export const AEM_ORIGIN = 'https://admin.hlx.page';

export const DA_ORIGIN = (() => {
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

export const COLLAB_ORIGIN = (() => {
  const collabUrls = {
    local: 'ws://localhost:4711',
    prod: 'wss://collab.da.live',
  };

  let collabOriginResult = collabUrls.prod;

  const storage = localStorage.getItem('daCollab');
  if (storage) collabOriginResult = collabUrls[storage];

  const query = new URL(window.location.href).searchParams.get('da-collab');
  if (query) {
    if (query === 'reset') {
      localStorage.removeItem('daCollab');
    } else {
      localStorage.setItem('daCollab', query);
      collabOriginResult = collabUrls[query] || collabUrls.prod;
    }
  }

  return collabOriginResult;
})();
