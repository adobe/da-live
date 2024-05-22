function getEnv() {
  let { GITHUB_HEAD_REF: branch } = process.env;
  if (!branch) {
    branch = 'main';
  }
  return branch === 'local' ? 'http://localhost:3000' : `https://${branch}--da-live--adobe.hlx.live`;
}

const ENV = (() => getEnv())();
export default ENV;
