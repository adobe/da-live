import { html, render } from 'da-lit';
import { breadcrumbItemTemplate, breadcrumbSeparatorTemplate } from '../templates/nav.js';

export default class FormBreadcrumb {
  constructor(generator) {
    this.generator = generator;
  }

  init(formEl) {
    const breadcrumb = document.createElement('div');
    breadcrumb.className = 'form-content-breadcrumb';
    const header = formEl.querySelector('.form-ui-header');
    header.appendChild(breadcrumb);
    return breadcrumb;
  }

  update(activeGroupId) {
    const bc = this.generator?.contentBreadcrumbEl;
    if (!bc) return;
    bc.innerHTML = '';
    const schemaPath = this.generator?.activeSchemaPath || '';
    const tokens = String(schemaPath).split('.').filter((t) => t && t !== 'root');
    let accPath = '';

    const addCrumb = (text, dataset) => {
      if (!text) return;
      const mount = document.createElement('span');
      render(breadcrumbItemTemplate({
        text,
        path: dataset?.path ?? null,
        groupId: dataset?.groupId ?? null,
        onClick: (e) => {
          e.preventDefault(); e.stopPropagation();
          const path = dataset?.path;
          const gid = dataset?.groupId;
          if (gid) {
            this.generator.navigation.navigateToGroup(gid);
            return;
          }
          if (path) {
            const target = this.generator.navigation.resolveFirstDescendantGroupPath(path) || path;
            const gid2 = this.generator.pathToGroupId(target);
            this.generator.navigation.navigateToGroup(gid2);
          }
        },
      }), mount);
      bc.appendChild(mount.firstElementChild);
    };

    tokens.forEach((tok, i) => {
      accPath = accPath ? `${accPath}.${tok}` : tok;
      addCrumb(tok, { path: accPath });
      if (i < tokens.length - 1) {
        const sep = document.createElement('span');
        render(breadcrumbSeparatorTemplate(), sep);
        bc.appendChild(sep.firstElementChild);
      }
    });
  }

  destroy() {}
}


