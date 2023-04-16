export default async function init(el) {
    const { getLibs } = await import('../../../scripts/utils.js');
    const { createTag } = await import(`${getLibs()}/utils/utils.js`);

    el.append(createTag('h2', { class: 'da-edit-title' }, 'This does\'t exist yet.'));
}