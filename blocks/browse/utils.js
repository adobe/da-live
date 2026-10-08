export function getBrowsePath({ search }) {
  return new URLSearchParams(search).get('browse') === '2' ? './v2' : './legacy';
}
