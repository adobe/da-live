import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../scripts/utils.js';

describe('imageFocalPoint Plugin', () => {
  let imageFocalPoint;

  before(async () => {
    // Mock nx before importing the component
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    const mod = await import('../../../../../../blocks/edit/prose/plugins/imageFocalPoint.js');
    imageFocalPoint = mod.default;
  });

  it('initializes correctly', () => {
    const plugin = imageFocalPoint();
    expect(plugin).to.exist;
    expect(plugin.props.nodeViews.image).to.be.a('function');
  });

  it('creates a node view for images inside table cells', () => {
    const plugin = imageFocalPoint();
    const createNodeView = plugin.props.nodeViews.image;

    const mockNode = {
      type: { name: 'image' },
      attrs: { src: 'test.jpg', dataFocalX: '50', dataFocalY: '50' },
    };

    const mockState = {
      doc: {
        resolve: () => ({
          depth: 1,
          node: () => ({ type: { name: 'table_cell' } }),
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

  it('updates node view correctly', () => {
    const plugin = imageFocalPoint();
    const createNodeView = plugin.props.nodeViews.image;

    const mockState = {
      doc: {
        resolve: () => ({
          depth: 1,
          node: () => ({ type: { name: 'table_cell' } }),
        }),
      },
    };
    const mockView = { state: mockState, dom: document.createElement('div') };
    const getPos = () => 10;

    const nodeView = createNodeView({ type: { name: 'image' }, attrs: { src: 'a.jpg' } }, mockView, getPos);

    const updated = nodeView.update({ type: { name: 'image' }, attrs: { src: 'b.jpg', dataFocalX: '10', dataFocalY: '20' } });

    expect(updated).to.be.true;
    const img = nodeView.dom.querySelector('img');
    expect(img.src).to.contain('b.jpg');
    expect(img.getAttribute('data-focal-x')).to.equal('10');

    const icon = nodeView.dom.querySelector('.focal-point-icon');
    expect(icon.classList.contains('focal-point-icon-active')).to.be.true;
  });
});
