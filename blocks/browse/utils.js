export function readLandingBlocks(area) {
  return [...(area?.querySelectorAll('.greeting, .recent-files, .landing') ?? [])]
    .filter((block) => !block.closest('.browse'));
}

export function takeLandingSections(el) {
  const own = el.closest('.section');
  if (!own) return [];
  const sections = [...own.parentElement.children];
  return sections.slice(sections.indexOf(own) + 1).flatMap((section) => {
    const blocks = readLandingBlocks(section);
    if (!blocks.length) return [];

    section.blocks = [];
    section.autoBlocks = [];
    section.linkBlocks = [];
    section.replaceChildren();
    section.remove();
    return blocks;
  });
}

export function getBrowseComponent({ search, pathDetails, hasLanding }) {
  if (pathDetails) return 'da-browse';
  const landing = new URLSearchParams(search).get('landing');
  if (landing === 'false') return 'da-sites';
  return hasLanding || landing === 'true' ? 'da-landing' : 'da-sites';
}

export async function resolveBrowsePath({ search, org, site, fetchConfigs }) {
  const override = new URLSearchParams(search).get('browse');
  if (override === '1') return './legacy';
  if (override === '2' || !org) return './v2';

  try {
    const configs = await Promise.all(fetchConfigs({ org, site }));
    let legacy = false;
    configs.forEach((config) => {
      const row = config?.flags?.data?.find(({ key }) => key === 'browseV1');
      if (row) legacy = row.value === 'true';
    });
    return legacy ? './legacy' : './v2';
  } catch {
    return './v2';
  }
}
