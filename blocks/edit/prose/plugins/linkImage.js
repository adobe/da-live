export function isEditableLinkImage(node) {
  return node?.type?.name === 'image' && node.attrs.editAs === 'image';
}
