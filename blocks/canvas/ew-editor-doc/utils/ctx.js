import { buildSourceUrl } from './source.js';

export function sourceUrlFromEditorCtx(ctx) {
  return buildSourceUrl(ctx?.path);
}

export function editorCtxHasOrgRepoPath(ctx) {
  const { org, repo, path } = ctx ?? {};
  return Boolean(org && repo && path);
}

export function editorDocCanLoad(ctx) {
  return editorCtxHasOrgRepoPath(ctx) && Boolean(sourceUrlFromEditorCtx(ctx));
}

export function controllerPathnameFromEditorCtx(ctx) {
  const docPath = ctx?.path;
  if (!docPath || typeof docPath !== 'string') return '/';
  const segments = docPath.replace(/^\//, '').split('/').filter(Boolean);
  const withoutOrgRepo = segments.slice(2).join('/');
  return withoutOrgRepo ? `/${withoutOrgRepo}` : '/';
}

export function editorDocRenderPhase(ctx, { error, hasEditorView }) {
  if (!editorDocCanLoad(ctx)) return 'incomplete';
  if (error) return 'error';
  if (!hasEditorView) return 'loading';
  return 'editor';
}
