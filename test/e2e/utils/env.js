function getEnv() {
  const explicit =
    (typeof process.env.PLAYWRIGHT_BASE_URL === 'string' && process.env.PLAYWRIGHT_BASE_URL.trim())
    || (typeof process.env.E2E_BASE_URL === 'string' && process.env.E2E_BASE_URL.trim());
  if (explicit) {
    return explicit.replace(/\/$/, '');
  }

  let { GITHUB_HEAD_REF: branch } = process.env;
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
