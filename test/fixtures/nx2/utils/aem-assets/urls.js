export const buildSmartCropsListUrl = (asset, dmOrigin) => `https://${dmOrigin}/${asset['repo:id']}/smartCrops`;
export const buildSmartCropUrl = (asset, dmOrigin, cropName) => `https://${dmOrigin}/${asset['repo:id']}/${cropName}`;
