function getEditUrl(aemUrl) {
  const parsed = new URL(aemUrl);
  const hostParts = parsed.hostname.split('.')[0].split('--');
  const repo = hostParts[1];
  const org = hostParts[2];
  return `https://da.live/edit#/${org}/${repo}${parsed.pathname}`;
}

export function corsFetch(href, options) {
  const url = `https://da-etc.adobeaem.workers.dev/cors?url=${encodeURIComponent(href)}`;
  const opts = options || {};
  return fetch(url, opts);
}

export async function saveOffer(config, name, content, aemUrl, displayName, offerId) {
  const isUpdate = Boolean(offerId);
  const url = isUpdate
    ? `https://mc.adobe.io/${config.tenant}/target/offers/content/${offerId}?includeMarketingCloudMetadata=true`
    : `https://mc.adobe.io/${config.tenant}/target/offers/content?includeMarketingCloudMetadata=true`;

  const body = {
    name,
    content,
    marketingCloudMetadata: {
      editURL: getEditUrl(aemUrl),
      'aem.lastUpdatedTime': new Date().toISOString(),
      'aem.offerType': 'xf',
      'aem.offerURL': aemUrl,
      sourceProductName: 'Adobe Experience Manager',
      'aem.lastUpdatedBy': displayName,
    },
  };

  const resp = await corsFetch(url, {
    method: isUpdate ? 'PUT' : 'POST',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'x-api-key': config.clientId,
      'Content-Type': 'application/vnd.adobe.target.v1+json',
      Accept: 'application/vnd.adobe.target.v1+json',
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const error = await resp.text();
    return { error };
  }

  const data = await resp.json();
  return { success: isUpdate ? 'Updated!' : 'Created!', offerId: data.id };
}

export async function getOffer(config, offerId) {
  const url = `https://mc.adobe.io/${config.tenant}/target/offers/content/${offerId}`;

  const resp = await corsFetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'x-api-key': config.clientId,
      Accept: 'application/vnd.adobe.target.v1+json',
    },
  });

  if (!resp.ok) {
    if (resp.status === 404) {
      return { error: 'Offer not found.', notFound: true };
    }
    const json = await resp.json();
    const message = json.errors?.[0]?.message || `Unknown error - ${resp.status}`;
    return { error: message };
  }

  const data = await resp.json();
  return { id: data.id, name: data.name };
}

export async function deleteOffer(config, offerId) {
  const url = `https://mc.adobe.io/${config.tenant}/target/offers/content/${offerId}`;

  const resp = await corsFetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${config.token}`,
      'x-api-key': config.clientId,
      Accept: 'application/vnd.adobe.target.v1+json',
    },
  });

  if (!resp.ok) {
    if (resp.status === 404) {
      return { error: 'Offer not found.', notFound: true };
    }
    const json = await resp.json();
    const message = json.errors?.[0]?.message || `Unknown error - ${resp.status}`;
    return { error: message };
  }

  return { success: 'Deleted successfully.' };
}

export async function getAccessToken(clientId, clientSecret) {
  const href = 'https://ims-na1.adobelogin.com/ims/token/v3';
  const opts = {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      scope: 'openid,AdobeID,target_sdk,additional_info.projectedProductContext,read_organizations,additional_info.roles',
    }),
  };
  const resp = await corsFetch(href, opts);
  if (!resp.ok) {
    const error = await resp.text();
    return { error: `Failed to get access token: ${resp.status} - ${error}` };
  }

  const data = await resp.json();
  return { token: data.access_token };
}
