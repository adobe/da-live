export const buildSmartCropsListUrl = (asset, dmOrigin) => `https://${dmOrigin}/${asset['repo:id']}/smartCrops`;
export const buildSmartCropUrl = (asset, dmOrigin, cropName) => `https://${dmOrigin}/${asset['repo:id']}/${cropName}`;

export function getDmApprovalStatus(asset) {
  // eslint-disable-next-line no-underscore-dangle
  const meta = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset'];
  return {
    status: meta?.['dam:assetStatus'],
    activationTarget: meta?.['dam:activationTarget'],
  };
}

export const getScene7PublishStatus = (asset) => asset?.['repo:scene7FileStatus'];
