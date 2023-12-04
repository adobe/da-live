import { origin } from '../browse/state/index.js';

async function aemPreview(path, api) {
  const [ owner, repo, ...parts] = path.slice(1).split('/');
  const name = parts.pop() || repo || owner;
  parts.push(name.replace('.html', ''));
  const aemUrl = `https://admin.hlx.page/${api}/${owner}/${repo}/main/${parts.join('/')}`;
  const resp = await fetch(aemUrl, { method: 'POST' });
  if (!resp.ok) return;
  return resp.json();
}

export default async function saveToDa({ path, blob, props, preview = false }) {
  const opts = { method: 'PUT' };

  if (blob || props) {
    const formData = new FormData();
    if (blob) formData.append('data', blob);
    if (props) formData.append('props', JSON.stringify(props));
    opts.body = formData;
  }
  const daResp = await fetch(`${origin}/source${path}`, opts);
  if (!daResp.ok) return;
  if (!preview) return;
  return aemPreview(path, 'preview');
}
