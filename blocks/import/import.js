import getPathDetails from '../shared/pathDetails.js';

export default function init(el) {
  console.log('do import stuff');

  const { owner, repo } = getPathDetails();

  el.append(owner, repo);
}
