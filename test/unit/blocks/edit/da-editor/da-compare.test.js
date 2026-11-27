import { expect } from '@esm-bundle/chai';
import { render } from 'da-lit';
import { baseSchema, DOMParser as PMDOMParser, EditorState, EditorView } from 'da-y-wrapper';
import { compare, renderModal } from '../../../../../blocks/edit/da-editor/da-compare.js';

describe('classic editor version comparison', () => {
  let host;
  let view;
  let savedView;
  let cleanup;

  beforeEach(() => {
    savedView = window.view;
    const currentDom = new DOMParser().parseFromString('<p>Introduction</p><h2>Added chapter</h2>', 'text/html').body;
    view = new EditorView(document.body, {
      state: EditorState.create({
        schema: baseSchema,
        doc: PMDOMParser.fromSchema(baseSchema).parse(currentDom),
      }),
    });
    window.view = view;
    host = document.createElement('div');
    host.attachShadow({ mode: 'open' });
    document.body.append(host);
  });

  afterEach(async () => {
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    cleanup?.();
    cleanup = null;
    host.remove();
    view.destroy();
    window.view = savedView;
  });

  it('compares earlier content against current content without editing either version', async () => {
    const versionDom = new DOMParser().parseFromString('<p>Introduction</p><h2>Removed chapter</h2>', 'text/html').body;
    const originalVersion = versionDom.innerHTML;
    const originalDoc = view.state.doc;
    let closed = false;
    const onClose = () => {
      closed = true;
      cleanup();
    };
    await compare({
      shadowRoot: host.shadowRoot,
      versionDom,
      onClose,
      onResult: (dom, closeCleanup) => {
        cleanup = closeCleanup;
        render(renderModal('Last previewed', dom, onClose), host.shadowRoot);
      },
    });
    expect(host.shadowRoot.querySelector('del.diffdel')?.textContent).to.equal('Version: Last previewed');
    expect(host.shadowRoot.querySelector('ins.diffins')?.textContent).to.equal('Current Document');
    const changes = (selector) => [...host.shadowRoot.querySelectorAll(selector)]
      .map((node) => node.textContent).join(' ');
    expect(changes('.da-compare-body del')).to.include('Removed').and.not.include('Added');
    expect(changes('.da-compare-body ins')).to.include('Added').and.not.include('Removed');
    expect(view.state.doc === originalDoc).to.be.true;
    expect(versionDom.innerHTML).to.equal(originalVersion);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    host.shadowRoot.querySelector('.da-compare-close').click();
    expect(closed).to.be.true;
    expect(view.state.doc === originalDoc).to.be.true;
    expect(versionDom.innerHTML).to.equal(originalVersion);
  });

  it('treats current content as additions when the earlier version is empty', async () => {
    let diff;
    await compare({
      shadowRoot: host.shadowRoot,
      versionDom: null,
      onClose: () => {},
      onResult: (dom, closeCleanup) => { diff = dom; cleanup = closeCleanup; },
    });
    expect(diff.querySelector('del')).to.be.null;
    expect([...diff.querySelectorAll('ins')].map((node) => node.textContent).join(' '))
      .to.include('Added chapter');
  });
});
