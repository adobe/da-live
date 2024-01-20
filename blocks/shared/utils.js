import { origin, ADMIN_BLOCKS } from './constants.js';

async function aemPreview(path, api) {
  const [owner, repo, ...parts] = path.slice(1).split('/');
  const name = parts.pop() || repo || owner;
  parts.push(name.replace('.html', ''));
  const aemUrl = `https://admin.hlx.page/${api}/${owner}/${repo}/main/${parts.join('/')}`;
  const resp = await fetch(aemUrl, { method: 'POST' });
  if (!resp.ok) return {};
  return resp.json();
}

export async function saveToDa({ path, formData, blob, props, preview = false }) {
  const opts = { method: 'PUT' };

  const form = formData || new FormData();
  if (blob || props) {
    if (blob) form.append('data', blob);
    if (props) form.append('props', JSON.stringify(props));
  }
  if ([...form.keys()].length) opts.body = form;

  const daResp = await fetch(`${origin}/source${path}`, opts);
  if (!daResp.ok) return {};
  if (!preview) return {};
  return aemPreview(path, 'preview');
}

let accessToken;
function getAccessToken() {
  accessToken = accessToken || new Promise((resolve) => {
    accessToken = window.adobeIMS?.getAccessToken();
    resolve(accessToken);
  });
  return accessToken;
}

export const daFetch = async (url, opts = {}) => {
  const at = await getAccessToken();
  if (at) {
    opts.headers = {
      ...opts.headers,
      Authorization: `Bearer ${at.token}`,
    };
  }
  const resp = await fetch(url, opts);
  if (resp.status === 401) {
    const main = document.body.querySelector('main');
    main.innerHTML = 'Are you lost?';
  }
  return resp;
};

export const daData = (
  () => new Promise((resolve) => {
    const block = document.body.querySelector('div[class]');
    const name = block.classList[0];
    const isAdmin = ADMIN_BLOCKS.some((aBlock) => aBlock === name);
    if (!isAdmin) return;
    if (name === 'browse') {
      daFetch(`${origin}/list`).then((resp) => {
        if (!resp.ok) return;
        resp.json().then((json) => {
          resolve(json);
        });
      });
    }
  }))();
