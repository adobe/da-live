const EVALUATE_URL = 'https://enterprise-context.adobe.io/api/v0/evaluate/page';

export function buildPreviewUrl({ org, site, path }) {
  return `https://main--${site}--${org}.preview.da.live${path}`;
}

export async function evaluatePage({ org, site, path, token }) {
  const url = buildPreviewUrl({ org, site, path });

  try {
    const resp = await fetch(EVALUATE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        // x-api-key is the IMS client id that obtained the token
        // (scripts/scripts.js CONFIG.imsClientId = 'darkalley').
        'x-api-key': 'darkalley',
      },
      body: JSON.stringify({ url }),
    });
    if (!resp.ok) return { error: 'Page evaluation failed.', status: resp.status };
    return { json: await resp.json() };
  } catch {
    return { error: 'Page evaluation failed.' };
  }
}
