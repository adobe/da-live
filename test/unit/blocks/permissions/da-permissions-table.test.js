import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../blocks/permissions/da-permissions-table/da-permissions-table.js');

function baseSlot(overrides = {}) {
  return {
    path: 'CONFIG',
    kind: 'config',
    label: 'DA configurations',
    read: [],
    write: [],
    none: [],
    inheritedRead: [],
    inheritedWrite: [],
    inheritedNone: [],
    ...overrides,
  };
}

async function mount(props) {
  const el = document.createElement('da-permissions-table');
  Object.assign(el, {
    slots: [],
    org: 'myorg',
    site: null,
    expanded: new Set(),
    editable: true,
    busy: false,
    adding: null,
    ...props,
  });
  document.body.append(el);
  await el.updateComplete;
  return el;
}

function allPillItems(el) {
  return [...el.shadowRoot.querySelectorAll('nx-pills')]
    .flatMap((pills) => pills.items ?? []);
}

describe('da-permissions-table', () => {
  afterEach(() => {
    document.querySelectorAll('da-permissions-table').forEach((el) => el.remove());
  });

  it('collapses a 20-member cell to 4 pills + a "+16 more" button, and expands to 20', async () => {
    const writers = Array.from({ length: 20 }, (_, i) => `user${i}@example.com`);
    const slot = baseSlot({ path: '/ + **', kind: 'content', label: 'All sites', write: writers });
    const el = await mount({ slots: [slot] });

    expect(allPillItems(el)).to.have.length(4);
    const moreBtn = [...el.shadowRoot.querySelectorAll('button')]
      .find((b) => b.textContent.trim() === '+16 more');
    expect(moreBtn).to.not.equal(undefined);

    el.expanded = new Set([slot.path]);
    await el.updateComplete;
    expect(allPillItems(el)).to.have.length(20);
  });

  it('shows inherited-only members in a second, non-removable nx-pills with a "From {org}" label', async () => {
    const slot = baseSlot({
      path: '/myorg/site1/CONFIG',
      kind: 'config',
      label: 'Site configurations',
      inheritedRead: ['admin@example.com', 'owner@example.com'],
    });
    const el = await mount({ slots: [slot], site: 'site1', org: 'myorg' });

    const pillsEls = [...el.shadowRoot.querySelectorAll('nx-pills')];
    const inheritedPills = pillsEls.find((p) => (p.items ?? []).some((i) => i.removable === false));
    expect(inheritedPills).to.not.equal(undefined);
    expect(inheritedPills.items.every((i) => i.removable === false)).to.be.true;
    expect(el.shadowRoot.textContent).to.contain('From myorg');
  });

  it('shows "No one" for an empty cell, and no "+" button when not editable', async () => {
    const slot = baseSlot();
    const el = await mount({ slots: [slot], editable: false });

    expect(el.shadowRoot.textContent).to.contain('No one');
    expect(el.shadowRoot.querySelector('.cell-add')).to.equal(null);
  });

  it('shows the "+" button for an empty cell when editable', async () => {
    const slot = baseSlot();
    const el = await mount({ slots: [slot], editable: true });

    expect(el.shadowRoot.querySelector('.cell-add')).to.not.equal(null);
  });

  it('renders the None list only when slot.none has members', async () => {
    const withNone = baseSlot({ none: ['blocked@example.com'] });
    let el = await mount({ slots: [withNone] });
    expect(el.shadowRoot.querySelector('.scope-none')).to.not.equal(null);
    el.remove();

    const withoutNone = baseSlot();
    el = await mount({ slots: [withoutNone] });
    expect(el.shadowRoot.querySelector('.scope-none')).to.equal(null);
  });

  it('groups slots into Config and Content section rows (org view)', async () => {
    const configSlot = baseSlot({ path: 'CONFIG', kind: 'config', label: 'DA configurations' });
    const contentSlot = baseSlot({ path: '/ + **', kind: 'content', label: 'All sites' });
    const el = await mount({ slots: [configSlot, contentSlot], site: null });

    const rows = [...el.shadowRoot.querySelectorAll('tr')];
    const textRows = rows.map((r) => r.textContent.trim());
    const configSectionIdx = textRows.findIndex((t) => t === 'Config');
    const contentSectionIdx = textRows.findIndex((t) => t === 'Content');
    expect(configSectionIdx).to.be.greaterThan(-1);
    expect(contentSectionIdx).to.be.greaterThan(configSectionIdx);
    expect(textRows[configSectionIdx + 1]).to.contain('DA configurations');
    expect(textRows[contentSectionIdx + 1]).to.contain('All sites');
  });
});
