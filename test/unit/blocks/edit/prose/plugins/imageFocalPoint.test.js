import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

describe('imageFocalPoint Plugin', () => {
  let imageFocalPoint;
  let canSetFocalPoint;
  let openSelectedFocalPoint;
  let savedFetch;

  before(async () => {
    // Mock nx and location before importing the component
    const mockLocation = {
      hostname: 'example.com',
      pathname: '/edit',
      hash: '#/test-org/test-repo/document',
      search: '',
    };
    setNx('/test/fixtures/nx', mockLocation);

    // Override window.location properties for getPathDetails
    window.history.pushState({}, '', '/edit#/test-org/test-repo/document');

    // Mock fetch to return library and blocks data
    savedFetch = window.fetch;
    window.fetch = async (url) => {
      // Mock CSS file requests
      if (url.includes('.css') || url.includes('.svg')) {
        return {
          ok: true,
          text: async () => '/* mock css */',
        };
      }
      // Mock library list response (config API)
      if (url.includes('/config/test-org/test-repo') || url.includes('/config/')) {
        return {
          ok: true,
          json: async () => ({
            ':type': 'multi-sheet',
            library: {
              data: [
                { title: 'Blocks', path: '/blocks.json', ref: 'main' },
              ],
            },
          }),
        };
      }
      // Mock blocks data response
      if (url.includes('/blocks.json')) {
        return {
          ok: true,
          json: async () => ({
            data: [
              { name: 'hero', path: '/blocks/hero', 'focal-point': 'yes' },
              { name: 'card', path: '/blocks/card', 'focal-point': 'no' },
            ],
          }),
        };
      }
      // Fallback for any other requests (includes getNx2Api's isHlx6 ping preflight,
      // which needs a real Response for its headers.get() call)
      return new Response('', { status: 404 });
    };

    const mod = await import('../../../../../../blocks/edit/prose/plugins/imageFocalPoint.js');
    imageFocalPoint = mod.default;
    ({ canSetFocalPoint, openSelectedFocalPoint } = mod);
  });

  after(() => {
    if (savedFetch) window.fetch = savedFetch;
  });

  it('initializes correctly', () => {
    const plugin = imageFocalPoint();
    expect(plugin).to.exist;
    expect(plugin.props.nodeViews.image).to.be.a('function');
  });

  it('creates a node view for images inside table cells', async () => {
    const plugin = imageFocalPoint();
    const createNodeView = plugin.props.nodeViews.image;

    const mockNode = {
      type: { name: 'image' },
      attrs: { src: 'test.jpg', dataFocalX: '50', dataFocalY: '50' },
    };

    const mockState = {
      doc: {
        resolve: () => ({
          depth: 3,
          node: (d) => {
            if (d === 3) return { type: { name: 'table_cell' } };
            if (d === 2) return { childCount: 2 }; // row with 2 cells
            if (d === 1) {
              // table with first row
              return {
                child: () => ({ // first row
                  child: () => ({ textContent: 'hero' }), // first cell of first row
                }),
              };
            }
            return { type: { name: 'doc' } };
          },
          index: () => 0,
        }),
      },
    };

    const mockView = {
      state: mockState,
      dom: document.createElement('div'),
    };

    const getPos = () => 10;

    const nodeView = createNodeView(mockNode, mockView, getPos);

    expect(nodeView).to.exist;
    expect(nodeView.dom.classList.contains('focal-point-image-wrapper')).to.be.true;

    const img = nodeView.dom.querySelector('img');
    expect(img).to.exist;
    expect(img.getAttribute('data-focal-x')).to.equal('50');
    expect(img.getAttribute('data-focal-y')).to.equal('50');

    // Wait for async initialization
    await new Promise((resolve) => { setTimeout(resolve, 500); });

    const icon = nodeView.dom.querySelector('.focal-point-icon');
    expect(icon).to.exist;
    expect(icon.classList.contains('focal-point-icon-active')).to.be.true;
  });

  it('does not create node view for images outside table cells', () => {
    const plugin = imageFocalPoint();
    const createNodeView = plugin.props.nodeViews.image;

    const mockState = {
      doc: {
        resolve: () => ({
          depth: 1,
          node: () => ({ type: { name: 'paragraph' } }),
        }),
      },
    };

    const mockView = { state: mockState, dom: document.createElement('div') };
    const getPos = () => 10;

    const nodeView = createNodeView({}, mockView, getPos);
    expect(nodeView).to.be.null;
  });

  it('updates node view correctly', async () => {
    const plugin = imageFocalPoint();
    const createNodeView = plugin.props.nodeViews.image;

    const mockState = {
      doc: {
        resolve: () => ({
          depth: 3,
          node: (d) => {
            if (d === 3) return { type: { name: 'table_cell' } };
            if (d === 2) return { childCount: 2 }; // row with 2 cells
            if (d === 1) {
              // table with first row
              return {
                child: () => ({ // first row
                  child: () => ({ textContent: 'hero' }), // first cell of first row
                }),
              };
            }
            return { type: { name: 'doc' } };
          },
          index: () => 0,
        }),
      },
    };
    const mockView = { state: mockState, dom: document.createElement('div') };
    const getPos = () => 10;

    const nodeView = createNodeView({ type: { name: 'image' }, attrs: { src: 'a.jpg' } }, mockView, getPos);

    // Wait for async initialization
    await new Promise((resolve) => { setTimeout(resolve, 500); });

    const updated = nodeView.update({ type: { name: 'image' }, attrs: { src: 'b.jpg', dataFocalX: '10', dataFocalY: '20' } });

    expect(updated).to.be.true;
    const img = nodeView.dom.querySelector('img');
    expect(img.src).to.contain('b.jpg');
    expect(img.getAttribute('data-focal-x')).to.equal('10');

    const icon = nodeView.dom.querySelector('.focal-point-icon');
    expect(icon).to.exist;
    expect(icon.classList.contains('focal-point-icon-active')).to.be.true;
  });

  describe('canSetFocalPoint / openSelectedFocalPoint', () => {
    const tableDoc = (blockName) => ({
      resolve: () => ({
        depth: 3,
        node: (d) => {
          if (d === 3) return { type: { name: 'table_cell' } };
          if (d === 2) return { childCount: 2 };
          if (d === 1) return { child: () => ({ child: () => ({ textContent: blockName }) }) };
          return { type: { name: 'doc' } };
        },
        index: () => 0,
      }),
    });
    const imageNode = { type: { name: 'image' }, attrs: { src: 'test.jpg' } };
    const stateFor = (blockName, node = imageNode) => ({
      doc: tableDoc(blockName),
      selection: { from: 10, node },
    });

    it('is true for a selected image in a focal-point enabled block', async () => {
      canSetFocalPoint(stateFor('hero'));
      await new Promise((resolve) => { setTimeout(resolve, 100); });
      expect(canSetFocalPoint(stateFor('hero'))).to.be.true;
    });

    it('is false for blocks without focal-point support', () => {
      expect(canSetFocalPoint(stateFor('card'))).to.be.false;
    });

    it('is false when the selection is not an image', () => {
      expect(canSetFocalPoint(stateFor('hero', null))).to.be.false;
      expect(canSetFocalPoint(stateFor('hero', { type: { name: 'table' } }))).to.be.false;
    });

    it('is false for images outside a table cell', () => {
      const state = {
        doc: { resolve: () => ({ depth: 1, node: () => ({ type: { name: 'paragraph' } }) }) },
        selection: { from: 10, node: imageNode },
      };
      expect(canSetFocalPoint(state)).to.be.false;
    });

    it('opens the focal point dialog for the selected image', async () => {
      openSelectedFocalPoint({ state: stateFor('hero'), dispatch: () => {} });
      await new Promise((resolve) => { setTimeout(resolve, 100); });
      const dialog = document.querySelector('da-dialog.focal-point-dialog');
      expect(dialog).to.exist;
      expect(dialog.querySelector('img.focal-point-image').getAttribute('src')).to.equal('test.jpg');
      dialog.remove();
    });

    it('does not open a dialog when no image is selected', async () => {
      openSelectedFocalPoint({ state: stateFor('hero', null) });
      await new Promise((resolve) => { setTimeout(resolve, 50); });
      expect(document.querySelector('da-dialog.focal-point-dialog')).to.not.exist;
    });
  });
});
