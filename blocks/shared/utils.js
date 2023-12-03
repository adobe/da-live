import { origin } from '../browse/state/index.js';

export default async function saveToDa({ path, blob, props, preview = false }) {
  const opts = { method: 'PUT' };

  if (blob || props) {
    const formData = new FormData();
    if (blob) formData.append('data', blob);
    if (props) formData.append('props', JSON.stringify(props));
    opts.body = formData;
  }
  const resp = await fetch(`${origin}/source${path}`, opts);
  if (!resp.ok) return;
}
