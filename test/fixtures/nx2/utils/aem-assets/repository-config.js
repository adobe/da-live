let config = null;
export const configCalls = [];
export const setRepositoryConfig = (value) => { config = value; };
export const getRepositoryConfig = async (...args) => {
  configCalls.push(args);
  return config;
};
export const getResponsiveImageConfig = async () => false;
