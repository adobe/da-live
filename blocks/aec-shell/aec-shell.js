export default async function init(el) {
    const { getLibs } = await import('../../../scripts/utils.js');
    const { createTag } = await import(`${getLibs()}/utils/utils.js`);

    const img = createTag('img', { class: 'aec-logo', src: './blocks/aec-shell/img/aec.svg#AdobeExperienceCloud'});

    const logo = createTag('button', { class: 'aec-button' }, [ img, 'Adobe Experience Cloud' ]);

    logo.addEventListener('click', () => {
        window.location.href = '/';
    });

    el.append(logo);
}