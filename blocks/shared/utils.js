import { DA_ORIGIN } from '../shared/constants.js';

async function aemPreview(path, api) {
  const [owner, repo, ...parts] = path.slice(1).split('/');
  const name = parts.pop() || repo || owner;
  parts.push(name.replace('.html', ''));
  const aemUrl = `https://admin.hlx.page/${api}/${owner}/${repo}/main/${parts.join('/')}`;
  const resp = await fetch(aemUrl, { method: 'POST' });
  if (!resp.ok) return;
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

  const daResp = await fetch(`${DA_ORIGIN}/source${path}`, opts);
  if (!daResp.ok) return;
  if (!preview) return;
  return aemPreview(path, 'preview');
}

export const daFetch = async (url, opts = {}) => {
  const accessToken = window.adobeIMS?.getAccessToken();
  opts.headers = opts.headers || {}
  if (accessToken) {
    // opts.credentials = "include";
    opts.headers.Authorization = `Bearer ${accessToken.token}`;
  }
  const resp = await fetch(url, opts);
  if (resp.status === 401) {
    const main = document.body.querySelector('main');
    main.innerHTML = 'Are you lost?';
  }
  return resp;
}
