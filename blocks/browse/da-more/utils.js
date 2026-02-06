import { AEM_ORIGIN, DA_ORIGIN } from '../../shared/constants.js';
import { daFetch, getDaConfig, getFirstSheet } from '../../shared/utils.js';
import getEditPath from '../shared.js';

const SKIP_TEMPLATE_PARAMS = [
  (url) => url.hostname === 'experience.adobe.com',
  (url) => url.pathname.startsWith('/edit'),
  (url) => url.searchParams.has('quick-edit'),
];

function getGroupError(group) {
  return {
    title: group.title,
    error: 'Error loading templates.',
  };
}

// https://main--block-collection--aem-sandbox.aem.live/docs/library/templates/customer-success-stories
// https://content.da.live/aem-sandbox/block-collection/docs/library/templates/customer-success-stories
// https://admin.da.live/source/aem-sandbox/block-collection/docs/library/templates/customer-success-stories.html
// /aem-sandbox/block-collection/docs/library/templates/customer-success-stories.html

function formatTemplatePath(path) {
  // Already a relative path
  if (path.startsWith('/')) {
    return path.endsWith('.html') ? path : `${path}.html`;
  }

  const url = new URL(path);

  // AEM Live URLs: https://main--site--org.aem.live/path
  if (url.hostname.includes('--')) {
    const [, site, org] = url.hostname.split('.')[0].split('--');
    return `/${org}/${site}${url.pathname}.html`;
  }

  // content.da.live URLs: https://content.da.live/org/site/path
  if (url.hostname === 'content.da.live') {
    return `${url.pathname}.html`;
  }

  // admin.da.live URLs: https://admin.da.live/source/org/site/path.html
  if (url.hostname === 'admin.da.live') {
    return url.pathname.replace('/source', '');
  }

  // Fallback
  return url.pathname.endsWith('.html') ? url.pathname : `${url.pathname}.html`;
}

async function aemPreview(destination) {
  const [, org, site, ...rest] = destination.split('/');
  const resp = await daFetch(`${AEM_ORIGIN}/preview/${org}/${site}/${rest.join('/')}`);
}

function formatGroupTemplates(rows) {
  return rows.map((row) => {
    const title = row.title || row.name || row.key;
    const path = formatTemplatePath(row.value || row.path);
    return { title, path };
  });
}

async function loadAndFormatGroup(group) {
  // Allow an empty doc if there's an editor path, but no templates
  if (group['editor path'] && !group.templates) {
    return {
      title: group.title,
      editorPath: group['editor path'],
      templates: [{ title: 'Blank document' }],
    };
  }

  try {
    // OOTB templates will use path, BYO Editors will use 'templates'
    const templateListPath = group.title === 'Templates' ? group.path : group.templates;
    const editorPath = group['editor path'];
    const resp = await daFetch(templateListPath);
    if (!resp.ok) return getGroupError(group);

    const json = await resp.json();

    // Directly from admin list API, it will be an array, otherwise first sheet
    const templates = Array.isArray(json)
      ? formatGroupTemplates(json)
      : formatGroupTemplates(getFirstSheet(json));

    return {
      title: group.title,
      editorPath,
      templates,
    };
  } catch {
    return getGroupError(group);
  }
}

async function loadGroupsList(groups) {
  const allGroups = await Promise.all(groups.map((group) => loadAndFormatGroup(group)));
  return allGroups.filter((group) => !group.error);
}

export const loadGroups = (() => {
  const cache = {};

  return async (org, site) => {
    let path = `/${org}`;
    if (site) path += `/${site}`;

    if (cache[path]) {
      console.log('cached');
      return cache[path];
    }

    const config = await getDaConfig({ path });
    if (config.error) {
      console.log(config.error, config.status);
      return null;
    }

    const { library, editors } = config;
    if (!(library || editors)) return null;

    const groups = [];

    const templateDetails = library?.data.find((row) => row.title === 'Templates');
    if (templateDetails) groups.push(templateDetails);

    const editorDetails = editors?.data;
    if (editorDetails) groups.push(...editorDetails);

    cache[path] = await loadGroupsList(groups);

    return cache[path];
  };
})();

async function copyTemplate(source, destination) {
  const body = new FormData();
  body.append('destination', destination);

  const opts = { method: 'POST', body };

  const sourceResp = await daFetch(`${DA_ORIGIN}/source${source}`);
  if (!sourceResp.ok) return { error: 'Template doesn\'t exist.' };

  const destResp = await daFetch(`${DA_ORIGIN}/source${destination}`);
  if (destResp.ok) return { error: 'Destination already exists.' };

  const resp = await daFetch(`${DA_ORIGIN}/copy${source}`, opts);
  if (!resp.ok) return { error: `Could not create template. (${resp.status})` };

  return resp;
}

function getEditUrl(editor, defaultEditorPath, templateTitle) {
  const rawPath = editor.editorPath || defaultEditorPath;
  const url = rawPath.startsWith('/') ? new URL(rawPath, window.location.origin) : new URL(rawPath);

  // Pass template hint to URLs we don't own
  const skipParams = SKIP_TEMPLATE_PARAMS.some((check) => check(url));
  if (!skipParams) url.searchParams.set('template', templateTitle);

  return url;
}

export async function navigateOrCreateNew(defaultEditorPath, selected, destination) {
  const { editor, template } = selected;
  const { title, path: source } = template;

  const editorUrl = getEditUrl(editor, defaultEditorPath, title);

  // Create the path that should be navigated to after creation
  const nav = getEditPath({ path: destination, ext: 'html', editor: editorUrl.href });

  // If provided source, copy it to the destination
  if (source) {
    let result;
    if (!nav.includes('/form')) {
      result = await copyTemplate(source, destination);
    }
    if (nav.includes('quick-edit')) {
      await aemPreview(destination);
    }
    if (result?.error) return result.error;
  }

  window.location = nav;

  return 'Success!';
}
