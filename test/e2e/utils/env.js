function getEnv() {
  return 'https://localhost';
  let { GITHUB_HEAD_REF: branch } = process.env;
  console.log('branch', branch);
  if (!branch) {
    branch = 'main';
  }
  let { GITHUB_REPOSITORY_OWNER: owner } = process.env;
  if (!owner) {
    owner = 'adobe';
  }
  if (branch === 'local') {
    return 'http://localhost:3000';
  }
  if (branch === 'local-https') {
    return 'https://localhost';
  }
  if (branch === 'main' && owner === 'adobe') {
    return 'https://da.live';
  }
  return `https://${branch}--da-live--${owner}.aem.live`;
}

const ENV = (() => getEnv())();
export default ENV;
