export const ICONS = {
  folder: '/img/icons/s2-icon-folder-20-n.svg',
  file: '/img/icons/s2-icon-filetext-20-n.svg',
  html: '/img/icons/s2-icon-filehtml-20-n.svg',
  json: '/img/icons/s2-icon-data-20-n.svg',
  link: '/img/icons/s2-icon-link-20-n.svg',
  jpg: '/img/icons/s2-icon-image-20-n.svg',
  jpeg: '/img/icons/s2-icon-image-20-n.svg',
  png: '/img/icons/s2-icon-image-20-n.svg',
  svg: '/img/icons/s2-icon-image-20-n.svg',
  gif: '/img/icons/s2-icon-image-20-n.svg',
  avif: '/img/icons/s2-icon-image-20-n.svg',
  webp: '/img/icons/s2-icon-image-20-n.svg',
  mp4: '/img/icons/s2-icon-video-20-n.svg',
  media: '/img/icons/s2-icon-image-20-n.svg',
  pdf: '/img/icons/s2-icon-acrobatsolid-20-n.svg',
  folderClock: '/img/icons/s2-icon-folderclock-20-n.svg',
  favorite: '/img/icons/s2-icon-starfilled-20-n.svg',
};

export function iconPathForExt(ext) {
  const type = !ext ? 'folder' : ext;
  return ICONS[type] || ICONS.file;
}
