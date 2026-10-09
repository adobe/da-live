export const buildAssetSelectorProps = (props) => props;

export const rememberedFolders = [];

export const rememberAssetFolder = (repoConfig, assetPath) => {
  rememberedFolders.push({ repoConfig, assetPath });
};
