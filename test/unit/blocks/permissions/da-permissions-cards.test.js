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
    const el = await mount({ slots: [configSlot, contentSlot], scopeName: 'myorg' });

    const sections = [...el.shadowRoot.querySelectorAll('section.scope-section')];
    expect(sections.map((s) => s.dataset.section)).to.deep.equal(['config', 'content']);
    expect(sections[0].querySelector('h3').textContent.trim()).to.equal('Configuration Permissions for: myorg');
    expect(sections[1].querySelector('h3').textContent.trim()).to.equal('Content Permissions for: myorg');
    expect(sections[0].querySelector('.scope-card').dataset.path).to.equal('CONFIG');
    expect(sections[1].querySelector('.scope-card').dataset.path).to.equal('/ + **');
  });

  it('renders three sections in order for a site view with a folder slot', async () => {
    const configSlot = baseSlot({ path: '/myorg/site1/CONFIG', kind: 'config', label: 'Site configurations' });
    const contentSlot = baseSlot({ path: '/myorg/site1/ + **', kind: 'content', label: 'All site content' });
    const folderSlot = baseSlot({ path: '/myorg/site1/blog/ + **', kind: 'folder', label: 'blog/' });
    const el = await mount({ slots: [configSlot, contentSlot, folderSlot], org: 'myorg', scopeName: 'site1' });

    const sections = [...el.shadowRoot.querySelectorAll('section.scope-section')];
    expect(sections.map((s) => s.dataset.section)).to.deep.equal(['config', 'content', 'folders']);
    expect(sections[0].querySelector('h3').textContent.trim()).to.equal('Configuration Permissions for: site1');
    expect(sections[1].querySelector('h3').textContent.trim()).to.equal('Content Permissions for: site1');
    expect(sections[2].querySelector('h3').textContent.trim()).to.equal('Folder Permissions');
  });

  it('shows card titles only for folder and other rules, and names every card', async () => {
    const configSlot = baseSlot({ path: '/myorg/site1/CONFIG', kind: 'config', label: 'Site configurations' });
    const contentSlot = baseSlot({ path: '/myorg/site1/ + **', kind: 'content', label: 'All site content' });
    const otherSlot = baseSlot({ path: '/myorg/site1/doc.html', kind: 'other', label: '/myorg/site1/doc.html' });
    const folderSlot = baseSlot({ path: '/myorg/site1/blog/ + **', kind: 'folder', label: 'blog/' });
    const el = await mount({ slots: [configSlot, contentSlot, otherSlot, folderSlot], scopeName: 'site1' });

    const card = (path) => el.shadowRoot.querySelector(`article.scope-card[data-path="${path}"]`);
    const title = (path) => card(path).querySelector('.card-title')?.textContent.trim() ?? null;
    expect(title(configSlot.path)).to.equal(null);
    expect(title(contentSlot.path)).to.equal(null);
    expect(title(otherSlot.path)).to.equal('/myorg/site1/doc.html');
    expect(title(folderSlot.path)).to.equal('blog/');
    [configSlot, contentSlot, otherSlot, folderSlot].forEach((slot) => {
      expect(card(slot.path).getAttribute('aria-label')).to.equal(slot.label);
    });
  });

  it('hides empty sections: only folder slots renders no config or content section', async () => {
    const folderSlot = baseSlot({ path: '/myorg/site1/blog/ + **', kind: 'folder', label: 'blog/' });
    const el = await mount({ slots: [folderSlot] });

    const sections = [...el.shadowRoot.querySelectorAll('section.scope-section')];
    expect(sections.map((s) => s.dataset.section)).to.deep.equal(['folders']);
  });

  it('renders all 20 pills for a 20-member row with no .card-toggle / .row-more', async () => {
    const writers = Array.from({ length: 20 }, (_, i) => `user${i}@example.com`);
    const slot = baseSlot({ path: '/ + **', kind: 'content', label: 'All sites', write: writers });
    const el = await mount({ slots: [slot] });

    expect(allPillItems(el)).to.have.length(20);
    expect(el.shadowRoot.querySelector('.row-more')).to.equal(null);
    expect(el.shadowRoot.querySelector('.card-toggle')).to.equal(null);
  });

  it('renders all direct and inherited members together, uncapped', async () => {
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
    expect(inheritedPills.items).to.have.length(18);
    expect(inheritedPills.items.every((i) => i.removable === false)).to.be.true;
    expect(row.querySelector('.from-label').textContent.trim()).to.equal('Inherited from myorg:');
    expect(row.querySelector('.row-more')).to.equal(null);
  });

  it('puts inherited members on their own line only when the row also has site members', async () => {
    const mixed = baseSlot({ write: ['a@x.com'], inheritedWrite: ['b@x.com'] });
    let el = await mount({ slots: [mixed], org: 'myorg' });
    let members = el.shadowRoot.querySelector('.level-row[data-level="write"] .row-members');
    expect(members.classList.contains('stacked')).to.be.true;
    expect(members.querySelector('.inherited-group .from-label')).to.not.equal(null);
    expect(members.querySelector('.inherited-group nx-pills.inherited-pills')).to.not.equal(null);
    el.remove();

    const inheritedOnly = baseSlot({ write: [], inheritedWrite: ['b@x.com'] });
    el = await mount({ slots: [inheritedOnly], org: 'myorg' });
    members = el.shadowRoot.querySelector('.level-row[data-level="write"] .row-members');
    expect(members.classList.contains('stacked')).to.be.false;
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

  it('uses a secondary "+ Add" button that stays in place (disabled) while the field is open', async () => {
    const slot = baseSlot({ label: 'All sites', write: ['a@x.com'] });
    let el = await mount({ slots: [slot], editable: true });
    let btn = el.shadowRoot.querySelector('.level-row[data-level="write"] .row-add');
    expect(btn?.textContent.trim()).to.equal('+ Add');
    expect(btn?.classList.contains('nx-form-btn-secondary')).to.equal(true);
    expect(btn?.disabled).to.equal(false);
    el.remove();

    el = await mount({ slots: [slot], editable: true, adding: { path: slot.path, level: 'write' } });
    btn = el.shadowRoot.querySelector('.level-row[data-level="write"] .row-add');
    expect(btn?.textContent.trim()).to.equal('+ Add');
    expect(btn?.disabled).to.equal(true);
  });

  it('opens the field below the members with an X right after it that cancels', async () => {
    const slot = baseSlot({ label: 'All sites', write: ['a@x.com'], inheritedWrite: ['b@x.com'] });
    const el = await mount({ slots: [slot], editable: true, adding: { path: slot.path, level: 'write' } });

    const members = el.shadowRoot.querySelector('.level-row[data-level="write"] .row-members');
    // The field is the last thing in the members column, after every pill list.
    expect(members?.lastElementChild?.classList.contains('row-add-field')).to.equal(true);
    const field = members.lastElementChild;
    expect(field.firstElementChild?.classList.contains('row-add-input')).to.equal(true);
    const cancel = field.querySelector('.row-add-input + .row-add-cancel');
    expect(cancel?.classList.contains('nx-action-btn-icon')).to.equal(true);
    expect(cancel?.getAttribute('aria-label')).to.equal('Cancel adding to All sites Write');

    let cancelCount = 0;
    el.addEventListener('permissions-add-cancel', () => { cancelCount += 1; });
    // mousedown must not steal focus from the input (blur would cancel before the click lands).
    const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    cancel.dispatchEvent(down);
    expect(down.defaultPrevented).to.equal(true);
    cancel.click();
    expect(cancelCount).to.equal(1);
  });

  it('opens the field under "No one" for an empty row', async () => {
    const slot = baseSlot();
    const el = await mount({ slots: [slot], editable: true, adding: { path: slot.path, level: 'read' } });
    const members = el.shadowRoot.querySelector('.level-row[data-level="read"] .row-members');
    expect(members?.querySelector('.row-empty')?.textContent.trim()).to.equal('No one');
    expect(members?.lastElementChild?.classList.contains('row-add-field')).to.equal(true);
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

  it('renders every pill list at nx-pills size m', async () => {
    const slot = baseSlot({
      write: ['a@x.com'],
      inheritedWrite: ['b@example.com'],
      none: ['c@x.com'],
    });
    const el = await mount({ slots: [slot], org: 'myorg' });
    const lists = [...el.shadowRoot.querySelectorAll('nx-pills')];
    expect(lists.length).to.equal(3);
    lists.forEach((list) => expect(list.getAttribute('size')).to.equal('m'));
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
    expect(row.querySelector('.from-label').textContent.trim()).to.equal('Inherited from myorg:');
    const inheritedPills = row.querySelector('nx-pills.inherited-pills');
    expect(inheritedPills.items.map((i) => i.id)).to.deep.equal(['inherited@example.com']);
  });

  it('still renders .direct-pills on a row with visible direct members', async () => {
    const slot = baseSlot({ path: '/ + **', kind: 'content', label: 'All sites', write: ['a@x.com'] });
    const el = await mount({ slots: [slot] });

    const row = el.shadowRoot.querySelector('.level-row[data-level="write"]');
    expect(row.querySelector('nx-pills.direct-pills')).to.not.equal(null);
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
