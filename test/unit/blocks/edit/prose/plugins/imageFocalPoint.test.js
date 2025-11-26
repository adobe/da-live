import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

describe('imageFocalPoint Plugin', () => {
  let imageFocalPoint;
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
      // Fallback for any other requests
      return { ok: false };
    };

    const mod = await import('../../../../../../blocks/edit/prose/plugins/imageFocalPoint.js');
    imageFocalPoint = mod.default;
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
});
