import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

await import('../../../../blocks/permissions/da-permissions-cards/da-permissions-cards.js');

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
  const el = document.createElement('da-permissions-cards');
  Object.assign(el, {
    slots: [],
    org: 'myorg',
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

describe('da-permissions-cards', () => {
  afterEach(() => {
    document.querySelectorAll('da-permissions-cards').forEach((el) => el.remove());
  });

  it('groups slots into config and content sections in order (org view)', async () => {
    const configSlot = baseSlot({ path: 'CONFIG', kind: 'config', label: 'DA configurations' });
    const contentSlot = baseSlot({ path: '/ + **', kind: 'content', label: 'All sites' });
    const el = await mount({ slots: [configSlot, contentSlot] });

    const sections = [...el.shadowRoot.querySelectorAll('section.scope-section')];
    expect(sections.map((s) => s.dataset.section)).to.deep.equal(['config', 'content']);
    expect(sections[0].querySelector('h3').textContent.trim()).to.equal('Config permissions');
    expect(sections[1].querySelector('h3').textContent.trim()).to.equal('Content permissions');
    expect(sections[0].querySelector('.scope-card').dataset.path).to.equal('CONFIG');
    expect(sections[1].querySelector('.scope-card').dataset.path).to.equal('/ + **');
  });

  it('renders three sections in order for a site view with a folder slot', async () => {
    const configSlot = baseSlot({ path: '/myorg/site1/CONFIG', kind: 'config', label: 'Site configurations' });
    const contentSlot = baseSlot({ path: '/myorg/site1/ + **', kind: 'content', label: 'All site content' });
    const folderSlot = baseSlot({ path: '/myorg/site1/blog/ + **', kind: 'folder', label: 'blog/' });
    const el = await mount({ slots: [configSlot, contentSlot, folderSlot], org: 'myorg' });

    const sections = [...el.shadowRoot.querySelectorAll('section.scope-section')];
    expect(sections.map((s) => s.dataset.section)).to.deep.equal(['config', 'content', 'folders']);
    expect(sections[2].querySelector('h3').textContent.trim()).to.equal('Folders');
  });

  it('hides empty sections: only folder slots renders no config or content section', async () => {
    const folderSlot = baseSlot({ path: '/myorg/site1/blog/ + **', kind: 'folder', label: 'blog/' });
    const el = await mount({ slots: [folderSlot] });

    const sections = [...el.shadowRoot.querySelectorAll('section.scope-section')];
    expect(sections.map((s) => s.dataset.section)).to.deep.equal(['folders']);
  });

  it('caps a 20-member row at 6 pills + "+14 more", expands to 20 via card-toggle', async () => {
    const writers = Array.from({ length: 20 }, (_, i) => `user${i}@example.com`);
    const slot = baseSlot({ path: '/ + **', kind: 'content', label: 'All sites', write: writers });
    const el = await mount({ slots: [slot] });

    expect(allPillItems(el)).to.have.length(6);
    const more = el.shadowRoot.querySelector('.row-more');
    expect(more).to.not.equal(null);
    expect(more.textContent.trim()).to.equal('+14 more');

    const toggle = el.shadowRoot.querySelector('.card-toggle');
    expect(toggle).to.not.equal(null);
    expect(toggle.getAttribute('aria-expanded')).to.equal('false');
    expect(toggle.textContent.trim()).to.equal('Show all');

    el.expanded = new Set([slot.path]);
    await el.updateComplete;
    expect(allPillItems(el)).to.have.length(20);
    expect(el.shadowRoot.querySelector('.card-toggle').textContent.trim()).to.equal('Show less');
    expect(el.shadowRoot.querySelector('.row-more')).to.equal(null);
  });

  it('caps mixed direct and inherited at 6', async () => {
    const direct = ['a@x.com', 'b@x.com'];
    const inherited = Array.from({ length: 18 }, (_, i) => `inh${i}@example.com`);
    const slot = baseSlot({
      path: '/myorg/site1/CONFIG',
      kind: 'config',
      label: 'Site configurations',
      write: direct,
      inheritedWrite: inherited,
    });
    const el = await mount({ slots: [slot], org: 'myorg' });

    const row = el.shadowRoot.querySelector('.level-row[data-level="write"]');
    const directPills = row.querySelector('nx-pills.direct-pills');
    const inheritedPills = row.querySelector('nx-pills.inherited-pills');
    expect(directPills.items).to.have.length(2);
    expect(inheritedPills.items).to.have.length(4);
    expect(inheritedPills.items.every((i) => i.removable === false)).to.be.true;
    expect(row.querySelector('.from-label').textContent.trim()).to.equal('From myorg');
    expect(row.querySelector('.row-more').textContent.trim()).to.equal('+14 more');
  });

  it('renders no card-toggle when no row exceeds 6 members', async () => {
    const slot = baseSlot({ path: '/ + **', kind: 'content', label: 'All sites', write: ['a@x.com', 'b@x.com'] });
    const el = await mount({ slots: [slot] });

    expect(el.shadowRoot.querySelector('.card-toggle')).to.equal(null);
  });

  it('clicking .card-toggle or .row-more dispatches permissions-toggle {path}', async () => {
    const writers = Array.from({ length: 10 }, (_, i) => `user${i}@example.com`);
    const slot = baseSlot({ path: '/ + **', kind: 'content', label: 'All sites', write: writers });
    const el = await mount({ slots: [slot] });

    let events = [];
    el.addEventListener('permissions-toggle', (e) => events.push(e));

    el.shadowRoot.querySelector('.card-toggle').click();
    expect(events).to.have.length(1);
    expect(events[0].detail.path).to.equal(slot.path);

    events = [];
    el.shadowRoot.querySelector('.row-more').click();
    expect(events).to.have.length(1);
    expect(events[0].detail.path).to.equal(slot.path);
  });

  it('shows "No one" for an empty read row, and no row-add when not editable', async () => {
    const slot = baseSlot();
    const el = await mount({ slots: [slot], editable: false });

    const row = el.shadowRoot.querySelector('.level-row[data-level="read"]');
    expect(row.querySelector('.row-empty').textContent.trim()).to.equal('No one');
    expect(row.querySelector('.row-add')).to.equal(null);
  });

  it('shows the row-add button for an empty read row when editable', async () => {
    const slot = baseSlot();
    const el = await mount({ slots: [slot], editable: true });

    const row = el.shadowRoot.querySelector('.level-row[data-level="read"]');
    expect(row.querySelector('.row-add')).to.not.equal(null);
  });

  it('shows the row-add button when editable, disabled and pills non-removable while busy', async () => {
    const slot = baseSlot({ write: ['a@x.com'] });
    const el = await mount({ slots: [slot], editable: true, busy: true });

    const row = el.shadowRoot.querySelector('.level-row[data-level="write"]');
    const addBtn = row.querySelector('.row-add');
    expect(addBtn).to.not.equal(null);
    expect(addBtn.disabled).to.be.true;
    const directPills = row.querySelector('nx-pills.direct-pills');
    expect(directPills.items.every((i) => i.removable === false)).to.be.true;
  });

  it('hides the row-add button while that row has an open inline input', async () => {
    const slot = baseSlot({ write: ['a@x.com'] });
    const el = await mount({ slots: [slot], editable: true, adding: { path: slot.path, level: 'write' } });

    const row = el.shadowRoot.querySelector('.level-row[data-level="write"]');
    expect(row.querySelector('.row-add')).to.equal(null);
    expect(row.querySelector('.row-add-input')).to.not.equal(null);
  });

  it('renders a NONE row only when slot.none or slot.inheritedNone is non-empty', async () => {
    let slot = baseSlot({ none: ['blocked@example.com'] });
    let el = await mount({ slots: [slot] });
    expect(el.shadowRoot.querySelector('.level-row[data-level="none"]')).to.not.equal(null);
    el.remove();

    slot = baseSlot();
    el = await mount({ slots: [slot] });
    expect(el.shadowRoot.querySelector('.level-row[data-level="none"]')).to.equal(null);
  });

  it('renders inherited none row with non-removable pills and no row-add', async () => {
    const slot = baseSlot({
      path: '/myorg/site1/ + **',
      kind: 'content',
      label: 'All site content',
      inheritedNone: ['blocked@example.com'],
    });
    const el = await mount({ slots: [slot], org: 'myorg' });

    const row = el.shadowRoot.querySelector('.level-row[data-level="none"]');
    expect(row).to.not.equal(null);
    const inheritedPills = row.querySelector('nx-pills.inherited-pills');
    expect(inheritedPills.items.every((i) => i.removable === false)).to.be.true;
    expect(row.querySelector('.row-add')).to.equal(null);
  });

  it('renders a focused input for a matching `adding` row; Enter with a value emits permissions-add, Enter on empty emits nothing, Escape/blur emit permissions-add-cancel', async () => {
    const slot = baseSlot({ path: '/ + **', kind: 'content', label: 'All sites', write: ['a@x.com'] });
    const el = await mount({ slots: [slot], adding: { path: slot.path, level: 'write' } });

    const input = el.shadowRoot.querySelector('.row-add-input.nx-input');
    expect(input).to.not.equal(null);
    expect(input.getAttribute('aria-label')).to.equal('Add to All sites Write');
    expect(el.shadowRoot.activeElement).to.equal(input);

    let addEvent = null;
    el.addEventListener('permissions-add', (e) => { addEvent = e; });
    input.value = '  ';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(addEvent).to.equal(null);

    input.value = 'a@x.com';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(addEvent).to.not.equal(null);
    expect(addEvent.detail).to.deep.equal({ path: slot.path, level: 'write', value: 'a@x.com' });

    let cancelCount = 0;
    el.addEventListener('permissions-add-cancel', () => { cancelCount += 1; });
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cancelCount).to.equal(1);

    input.dispatchEvent(new Event('blur', { bubbles: true }));
    expect(cancelCount).to.equal(2);
  });

  it('suppresses card-toggle and row-more when filtering is true, even for an expanded 20-member slot', async () => {
    const writers = Array.from({ length: 20 }, (_, i) => `user${i}@example.com`);
    const slot = baseSlot({ path: '/ + **', kind: 'content', label: 'All sites', write: writers });
    const el = await mount({ slots: [slot], expanded: new Set([slot.path]), filtering: true });

    expect(el.shadowRoot.querySelector('.card-toggle')).to.equal(null);
    expect(el.shadowRoot.querySelector('.row-more')).to.equal(null);
  });

  it('sets nx-pills label for direct and inherited pills', async () => {
    const slot = baseSlot({
      path: '/myorg/site1/CONFIG',
      kind: 'config',
      label: 'Site configurations',
      write: ['a@x.com'],
      inheritedWrite: ['b@example.com'],
    });
    const el = await mount({ slots: [slot], org: 'myorg' });

    const row = el.shadowRoot.querySelector('.level-row[data-level="write"]');
    expect(row.querySelector('nx-pills.direct-pills').label).to.equal('Site configurations Write');
    expect(row.querySelector('nx-pills.inherited-pills').label).to.equal('Site configurations Write inherited from myorg');
  });

  it('renders inherited-only read row with .from-label, inherited pills, and no .direct-pills', async () => {
    const slot = baseSlot({
      path: '/myorg/site1/ + **',
      kind: 'content',
      label: 'All site content',
      inheritedRead: ['inherited@example.com'],
    });
    const el = await mount({ slots: [slot], org: 'myorg' });

    const row = el.shadowRoot.querySelector('.level-row[data-level="read"]');
    expect(row.querySelector('.direct-pills')).to.equal(null);
    expect(row.querySelector('.from-label').textContent.trim()).to.equal('From myorg');
    const inheritedPills = row.querySelector('nx-pills.inherited-pills');
    expect(inheritedPills.items.map((i) => i.id)).to.deep.equal(['inherited@example.com']);
  });

  it('still renders .direct-pills on a row with visible direct members', async () => {
    const slot = baseSlot({ path: '/ + **', kind: 'content', label: 'All sites', write: ['a@x.com'] });
    const el = await mount({ slots: [slot] });

    const row = el.shadowRoot.querySelector('.level-row[data-level="write"]');
    expect(row.querySelector('nx-pills.direct-pills')).to.not.equal(null);
  });

  it('sets aria-label on .row-more to "Show all members of {label}"', async () => {
    const writers = Array.from({ length: 10 }, (_, i) => `user${i}@example.com`);
    const slot = baseSlot({ path: '/ + **', kind: 'content', label: 'All sites', write: writers });
    const el = await mount({ slots: [slot] });

    const more = el.shadowRoot.querySelector('.row-more');
    expect(more.getAttribute('aria-label')).to.equal('Show all members of All sites');
  });

  it('nx-pill-remove on direct-pills emits permissions-remove with { path, level, who }', async () => {
    const slot = baseSlot({ path: '/ + **', kind: 'content', label: 'All sites', write: ['a@x.com'] });
    const el = await mount({ slots: [slot] });

    let removeEvent = null;
    el.addEventListener('permissions-remove', (e) => { removeEvent = e; });
    const directPills = el.shadowRoot.querySelector('.level-row[data-level="write"] nx-pills.direct-pills');
    directPills.dispatchEvent(new CustomEvent('nx-pill-remove', { detail: { id: 'a@x.com' }, bubbles: true }));

    expect(removeEvent).to.not.equal(null);
    expect(removeEvent.detail).to.deep.equal({ path: '/ + **', level: 'write', who: 'a@x.com' });
  });
});
