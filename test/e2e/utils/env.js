function getEnv() {
  const { GITHUB_HEAD_REF: branch = 'main' } = process.env;
  return branch === 'local' ? 'http://localhost:3000' : `https://${branch}--da-live--adobe.hlx.live`;
}

const ENV = (() => getEnv())();
export default ENV;
