import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

before(async () => {
  await import('../../../../../blocks/shared/popup-menu/popup-menu.js');
});

/**
 * Waits one task, so pending promise callbacks and slot changes run first.
 *
 * @returns {Promise<void>} Resolves on the next task.
 */
const nextTask = () => new Promise((resolve) => { setTimeout(resolve); });

/**
 * Creates and attaches a menu with a trigger, two rows with a pin toggle
 * each, and a plain item.
 *
 * @returns {Promise<HTMLElement>} The rendered menu.
 */
async function createMenu() {
  const menu = document.createElement('da-popup-menu');
  menu.label = 'Panels';
  menu.innerHTML = `
    <button slot="trigger" class="trigger">Open</button>
    <div role="none"><button role="menuitem" class="first">First</button><button role="menuitemcheckbox" class="pin" data-menu-secondary data-menu-keep-open>Pin</button></div>
    <div role="none"><button role="menuitem" class="second" aria-current="true">Second</button><button role="menuitemcheckbox" class="pin-second" data-menu-secondary data-menu-keep-open>Pin</button></div>
    <button role="menuitem" class="third" aria-disabled="true">Third</button>
  `;
  document.body.append(menu);
  await menu.updateComplete;
  return menu;
}

/**
 * Presses a key on an element.
 *
 * @param {Element} element - The element that has focus.
 * @param {string} key - The key to press.
 * @returns {KeyboardEvent} The dispatched event.
 */
function press(element, key) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true });
  element.dispatchEvent(event);
  return event;
}

describe('da-popup-menu', () => {
  let menu;

  beforeEach(async () => {
    menu = await createMenu();
  });

  afterEach(() => {
    menu.remove();
  });

  it('marks its trigger as a closed menu button', () => {
    const { trigger } = menu;
    expect(trigger.getAttribute('aria-haspopup')).to.equal('menu');
    expect(trigger.getAttribute('aria-expanded')).to.equal('false');
    expect(menu.shadowRoot.querySelector('nx-popover').getAttribute('aria-label')).to.equal('Panels');
  });

  it('opens from its trigger and focuses the current item', async () => {
    menu.trigger.click();
    await nextTask();

    expect(menu.open).to.be.true;
    expect(menu.trigger.getAttribute('aria-expanded')).to.equal('true');
    expect(menu.shadowRoot.querySelector('nx-popover').open).to.be.true;
    expect(document.activeElement === menu.querySelector('.second')).to.be.true;
  });

  it('closes when its trigger is clicked again', async () => {
    await menu.show();
    menu.trigger.click();
    await nextTask();

    expect(menu.open).to.be.false;
    expect(menu.trigger.getAttribute('aria-expanded')).to.equal('false');
    expect(menu.shadowRoot.querySelector('nx-popover').open).to.be.false;
  });

  it('closes once an item is picked and focuses the trigger', async () => {
    await menu.show();
    menu.querySelector('.first').focus();
    menu.querySelector('.first').click();

    expect(menu.open).to.be.false;
    expect(document.activeElement === menu.trigger).to.be.true;
  });

  it('stays open for keep open and disabled items', async () => {
    await menu.show();
    menu.querySelector('.pin').click();
    menu.querySelector('.third').click();

    expect(menu.open).to.be.true;
  });

  it('opens with Arrow Down on the trigger', async () => {
    const event = press(menu.trigger, 'ArrowDown');
    await nextTask();

    expect(event.defaultPrevented).to.be.true;
    expect(menu.open).to.be.true;
  });

  it('moves focus between items with wrapping arrow keys, Home and End', async () => {
    await menu.show();
    const [first, second, third] = ['.first', '.second', '.third'].map((selector) => menu.querySelector(selector));

    press(second, 'ArrowDown');
    expect(document.activeElement === third).to.be.true;
    press(third, 'ArrowDown');
    expect(document.activeElement === first).to.be.true;
    press(first, 'ArrowUp');
    expect(document.activeElement === third).to.be.true;
    press(third, 'Home');
    expect(document.activeElement === first).to.be.true;
    press(first, 'End');
    expect(document.activeElement === third).to.be.true;
  });

  it('reaches a row secondary item with Arrow Right and leaves it with Arrow Left', async () => {
    await menu.show();
    const first = menu.querySelector('.first');
    const pin = menu.querySelector('.pin');
    first.focus();

    press(first, 'ArrowRight');
    expect(document.activeElement === pin).to.be.true;
    press(pin, 'ArrowLeft');
    expect(document.activeElement === first).to.be.true;
    press(first, 'ArrowRight');
    press(pin, 'ArrowDown');
    expect(document.activeElement === menu.querySelector('.second')).to.be.true;
  });

  it('closes on Escape, keeps the key inside and focuses the trigger', async () => {
    await menu.show();
    let escaped = false;
    const onKeyDown = () => { escaped = true; };
    document.body.addEventListener('keydown', onKeyDown);
    press(menu.querySelector('.second'), 'Escape');
    document.body.removeEventListener('keydown', onKeyDown);

    expect(escaped).to.be.false;
    expect(menu.open).to.be.false;
    expect(document.activeElement === menu.trigger).to.be.true;
  });

  it('resets its state when the popover closes itself and keeps the event inside', async () => {
    await menu.show();
    let leaked = false;
    const onClose = () => { leaked = true; };
    document.body.addEventListener('close', onClose);
    menu.shadowRoot.querySelector('nx-popover')
      .dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
    document.body.removeEventListener('close', onClose);

    expect(leaked).to.be.false;
    expect(menu.open).to.be.false;
    expect(menu.trigger.getAttribute('aria-expanded')).to.equal('false');
  });

  it('marks a replaced trigger', async () => {
    const replacement = document.createElement('button');
    replacement.slot = 'trigger';
    menu.trigger.replaceWith(replacement);
    await nextTask();

    expect(replacement.getAttribute('aria-haspopup')).to.equal('menu');
    expect(replacement.getAttribute('aria-expanded')).to.equal('false');
  });
});
