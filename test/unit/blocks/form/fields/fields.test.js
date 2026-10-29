import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import '../../../../../blocks/form/fields/input.js';
import '../../../../../blocks/form/fields/textarea.js';
import '../../../../../blocks/form/fields/picker.js';
import '../../../../../blocks/form/fields/checkbox.js';
import '../../../../../blocks/form/fields/button.js';
import '../../../../../blocks/form/fields/number.js';
import '../../../../../blocks/form/fields/date.js';
import { localToUtc, utcToLocal } from '../../../../../blocks/form/fields/datetime-zone.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve); });

async function mount(html) {
  const wrap = document.createElement('div');
  wrap.innerHTML = html;
  const el = wrap.firstElementChild;
  document.body.append(el);
  await el.updateComplete;
  // Let any post-render slotchange (form-picker moves <option>s) settle.
  await tick();
  await el.updateComplete;
  return el;
}

describe('form-input', () => {
  it('reflects value onto the inner input', async () => {
    const el = await mount('<form-input></form-input>');
    el.value = 'hello';
    await el.updateComplete;
    const input = el.shadowRoot.querySelector('input');
    expect(input.value).to.equal('hello');
  });

  it('fires an input event and updates value on user input', async () => {
    const el = await mount('<form-input></form-input>');
    let fired;
    el.addEventListener('input', (e) => { fired = e.target.value; });
    const input = el.shadowRoot.querySelector('input');
    input.value = 'typed';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    expect(el.value).to.equal('typed');
    expect(fired).to.equal('typed');
  });

  it('renders the label and error message', async () => {
    const el = await mount('<form-input></form-input>');
    el.label = 'Title';
    el.error = 'Required';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('label').textContent).to.equal('Title');
    expect(el.shadowRoot.querySelector('.form-field-error').textContent).to.equal('Required');
    expect(el.shadowRoot.querySelector('.form-field').classList.contains('has-error')).to.be.true;
  });

  it('marks a required field with the red asterisk in its label', async () => {
    const el = await mount('<form-input></form-input>');
    el.label = 'Title';
    el.required = true;
    await el.updateComplete;
    const star = el.shadowRoot.querySelector('label .form-required');
    expect(star, 'required asterisk').to.exist;
    expect(star.textContent).to.equal('*');
    // .form-required is the class that colors it red (defaults.css).
    expect(star.classList.contains('form-required')).to.be.true;
  });

  it('omits the asterisk when the field is not required', async () => {
    const el = await mount('<form-input></form-input>');
    el.label = 'Title';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.form-required')).to.equal(null);
  });

  it('shows the description under the input when valid', async () => {
    const el = await mount('<form-input></form-input>');
    el.description = 'Lowercase and hyphens.';
    await el.updateComplete;
    const desc = el.shadowRoot.querySelector('.form-field-description');
    const wrap = el.shadowRoot.querySelector('.form-input-wrap');
    expect(desc.textContent).to.equal('Lowercase and hyphens.');
    // Spectrum: help text renders under the field.
    const order = [...el.shadowRoot.querySelector('.form-field').children];
    expect(order.indexOf(wrap)).to.be.lessThan(order.indexOf(desc));
  });

  it('replaces the description with the error when invalid (Spectrum)', async () => {
    const el = await mount('<form-input></form-input>');
    el.description = 'Lowercase and hyphens.';
    el.error = 'Invalid';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.form-field-error').textContent).to.equal('Invalid');
    // Error replaces the help text — description is not shown while invalid.
    expect(el.shadowRoot.querySelector('.form-field-description')).to.equal(null);
  });

  it('honors disabled', async () => {
    const el = await mount('<form-input disabled></form-input>');
    expect(el.shadowRoot.querySelector('input').disabled).to.be.true;
  });

  it('honors the type attribute', async () => {
    const el = await mount('<form-input type="number"></form-input>');
    expect(el.shadowRoot.querySelector('input').type).to.equal('number');
  });
});

describe('form-textarea', () => {
  it('reflects value onto the inner textarea', async () => {
    const el = await mount('<form-textarea></form-textarea>');
    el.value = 'hello\nworld';
    await el.updateComplete;
    const textarea = el.shadowRoot.querySelector('textarea');
    expect(textarea.value).to.equal('hello\nworld');
  });

  it('fires an input event and updates value on user input', async () => {
    const el = await mount('<form-textarea></form-textarea>');
    let fired;
    el.addEventListener('input', (e) => { fired = e.target.value; });
    const textarea = el.shadowRoot.querySelector('textarea');
    textarea.value = 'typed';
    textarea.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    expect(el.value).to.equal('typed');
    expect(fired).to.equal('typed');
  });

  it('renders the label and error message', async () => {
    const el = await mount('<form-textarea></form-textarea>');
    el.label = 'Summary';
    el.error = 'Required';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('label').textContent).to.equal('Summary');
    expect(el.shadowRoot.querySelector('.form-field-error').textContent).to.equal('Required');
    expect(el.shadowRoot.querySelector('.form-field').classList.contains('has-error')).to.be.true;
  });

  it('honors disabled', async () => {
    const el = await mount('<form-textarea disabled></form-textarea>');
    expect(el.shadowRoot.querySelector('textarea').disabled).to.be.true;
  });
});

describe('form-number-field', () => {
  it('reflects value onto the inner input', async () => {
    const el = await mount('<form-number-field></form-number-field>');
    el.value = '5';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('input').value).to.equal('5');
  });

  it('fires an input event and updates value on user input', async () => {
    const el = await mount('<form-number-field></form-number-field>');
    let fired;
    el.addEventListener('input', (e) => { fired = e.target.value; });
    const input = el.shadowRoot.querySelector('input');
    input.value = '42';
    input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
    expect(el.value).to.equal('42');
    expect(fired).to.equal('42');
  });

  it('renders stacked stepper buttons', async () => {
    const el = await mount('<form-number-field></form-number-field>');
    const steps = el.shadowRoot.querySelectorAll('.form-number-step');
    expect(steps.length).to.equal(2);
  });

  it('increments by step on the up button and fires input', async () => {
    const el = await mount('<form-number-field></form-number-field>');
    el.value = '3';
    await el.updateComplete;
    let fired;
    el.addEventListener('input', (e) => { fired = e.target.value; });
    el.shadowRoot.querySelector('.form-number-step-up')
      .dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(el.value).to.equal('4');
    expect(fired).to.equal('4');
  });

  it('decrements on the down button', async () => {
    const el = await mount('<form-number-field></form-number-field>');
    el.value = '3';
    await el.updateComplete;
    el.shadowRoot.querySelector('.form-number-step-down')
      .dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(el.value).to.equal('2');
  });

  it('clamps to max and disables the up button at the limit', async () => {
    const el = await mount('<form-number-field></form-number-field>');
    el.max = 5;
    el.value = '5';
    await el.updateComplete;
    const up = el.shadowRoot.querySelector('.form-number-step-up');
    expect(up.disabled).to.be.true;
    up.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(el.value).to.equal('5');
  });

  it('clamps to min and disables the down button at the limit', async () => {
    const el = await mount('<form-number-field></form-number-field>');
    el.min = 0;
    el.value = '0';
    await el.updateComplete;
    const down = el.shadowRoot.querySelector('.form-number-step-down');
    expect(down.disabled).to.be.true;
    down.dispatchEvent(new PointerEvent('pointerdown', { button: 0, bubbles: true }));
    expect(el.value).to.equal('0');
  });

  it('steps with the arrow keys', async () => {
    const el = await mount('<form-number-field></form-number-field>');
    el.value = '7';
    await el.updateComplete;
    const input = el.shadowRoot.querySelector('input');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(el.value).to.equal('8');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(el.value).to.equal('7');
  });

  it('honors disabled', async () => {
    const el = await mount('<form-number-field disabled></form-number-field>');
    expect(el.shadowRoot.querySelector('input').disabled).to.be.true;
  });
});

describe('form-picker', () => {
  it('defaults value to the first option', async () => {
    const el = await mount('<form-picker><option value="a">A</option><option value="b">B</option></form-picker>');
    await el.updateComplete;
    expect(el.value).to.equal('a');
    expect(el.shadowRoot.querySelector('select').value).to.equal('a');
  });

  it('updates value and fires change on selection', async () => {
    const el = await mount('<form-picker><option value="a">A</option><option value="b">B</option></form-picker>');
    await el.updateComplete;
    let fired;
    el.addEventListener('change', (e) => { fired = e.target.value; });
    const select = el.shadowRoot.querySelector('select');
    select.value = 'b';
    select.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(el.value).to.equal('b');
    expect(fired).to.equal('b');
  });

  it('renders a placeholder option selected when empty', async () => {
    const el = await mount('<form-picker placeholder="Pick one"><option value="a">A</option></form-picker>');
    await el.updateComplete;
    const first = el.shadowRoot.querySelector('select option');
    expect(first.textContent).to.equal('Pick one');
    expect(first.disabled).to.be.true;
    expect(el.value).to.equal('');
  });

  it('honors disabled', async () => {
    const el = await mount('<form-picker disabled><option value="a">A</option></form-picker>');
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('select').disabled).to.be.true;
  });
});

describe('form-checkbox', () => {
  it('toggles checked and fires change', async () => {
    const el = await mount('<form-checkbox>Enabled</form-checkbox>');
    let fired = 0;
    el.addEventListener('change', () => { fired += 1; });
    const input = el.shadowRoot.querySelector('input');
    input.checked = true;
    input.dispatchEvent(new Event('change'));
    expect(el.checked).to.be.true;
    expect(fired).to.equal(1);
  });

  it('renders the default-slot label', async () => {
    const el = await mount('<form-checkbox>My label</form-checkbox>');
    expect(el.textContent.trim()).to.equal('My label');
    expect(el.shadowRoot.querySelector('slot')).to.exist;
  });

  it('reflects the checked property to the input', async () => {
    const el = await mount('<form-checkbox checked>On</form-checkbox>');
    expect(el.shadowRoot.querySelector('input').checked).to.be.true;
  });

  it('honors disabled', async () => {
    const el = await mount('<form-checkbox disabled>Off</form-checkbox>');
    expect(el.shadowRoot.querySelector('input').disabled).to.be.true;
  });
});

describe('form-button', () => {
  it('renders the slotted label', async () => {
    const el = await mount('<form-button>Create</form-button>');
    expect(el.textContent.trim()).to.equal('Create');
    expect(el.shadowRoot.querySelector('button')).to.exist;
  });

  it('passes the click through to host listeners', async () => {
    const el = await mount('<form-button>Create</form-button>');
    let clicks = 0;
    el.addEventListener('click', () => { clicks += 1; });
    el.shadowRoot.querySelector('button').click();
    expect(clicks).to.equal(1);
  });

  it('blocks click when disabled', async () => {
    const el = await mount('<form-button disabled>Create</form-button>');
    let clicks = 0;
    el.addEventListener('click', () => { clicks += 1; });
    el.shadowRoot.querySelector('button').click();
    expect(clicks).to.equal(0);
  });

  it('reflects the variant so variant styling can target it', async () => {
    const el = await mount('<form-button>Create</form-button>');
    el.variant = 'accent';
    await el.updateComplete;
    expect(el.getAttribute('variant')).to.equal('accent');
  });
});

describe('form-date (native)', () => {
  const input = (el) => el.shadowRoot.querySelector('input');
  const setInput = (el, v) => {
    const i = input(el);
    i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  };

  it('renders a native date input by default', async () => {
    const el = await mount('<form-date></form-date>');
    expect(input(el).type).to.equal('date');
  });

  it('reflects an external date value into the input', async () => {
    const el = await mount('<form-date></form-date>');
    el.value = '2026-08-14';
    await el.updateComplete;
    expect(input(el).value).to.equal('2026-08-14');
  });

  it('lets the native input event cross and syncs the value on the host', async () => {
    const el = await mount('<form-date></form-date>');
    let inputs = 0;
    let changes = 0;
    let target;
    el.addEventListener('input', (e) => {
      inputs += 1;
      target = e.target;
    });
    el.addEventListener('change', () => { changes += 1; });
    setInput(el, '2026-08-14');
    expect(inputs).to.equal(1);
    expect(changes).to.equal(0);
    expect(target).to.equal(el);
    expect(el.value).to.equal('2026-08-14');
  });

  it('exposes the UTC value on the host for a datetime input event', async () => {
    const el = await mount('<form-date type="datetime"></form-date>');
    let value;
    el.addEventListener('input', (e) => { value = e.target.value; });
    setInput(el, '2026-08-14T13:00');
    const utc = localToUtc('2026-08-14T13:00');
    expect(el.value).to.equal(utc);
    expect(value).to.equal(utc);
  });

  it('renders a native time input for type=time', async () => {
    const el = await mount('<form-date type="time"></form-date>');
    expect(input(el).type).to.equal('time');
    setInput(el, '09:30');
    expect(el.value).to.equal('09:30');
  });

  it('renders a datetime-local input for type=datetime and stores UTC', async () => {
    const el = await mount('<form-date type="datetime"></form-date>');
    expect(input(el).type).to.equal('datetime-local');
    setInput(el, '2026-08-14T13:00');
    expect(el.value).to.equal(localToUtc('2026-08-14T13:00'));
    expect(el.value).to.match(/Z$/);
  });

  it('reflects a stored UTC datetime as local in the input', async () => {
    const el = await mount('<form-date type="datetime"></form-date>');
    const iso = localToUtc('2026-08-14T13:00');
    el.value = iso;
    await el.updateComplete;
    expect(input(el).value).to.equal(utcToLocal(iso));
  });

  // Ancient dates carry sub-minute offsets; the widget must still emit canonical `…:00Z`.
  it('stores a canonical minute-precision UTC value for an ancient datetime', async () => {
    const el = await mount('<form-date type="datetime"></form-date>');
    setInput(el, '0001-01-01T01:00');
    expect(el.value).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
  });

  it('leaves the value empty for a partial or cleared entry (no fabricated value)', async () => {
    const el = await mount('<form-date></form-date>');
    // A partial entry gives the native input no value; we do not invent one.
    el._onInput({ target: { value: '' } });
    expect(el.value).to.equal('');
  });

  it('surfaces the SDK error when the value is invalid', async () => {
    const el = await mount('<form-date></form-date>');
    el.error = 'Please enter a valid date.';
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('.form-field-error')?.textContent)
      .to.equal('Please enter a valid date.');
    expect(el.shadowRoot.querySelector('.form-field.has-error')).to.exist;
  });

  it('sets a 4-digit-year max on the date input', async () => {
    const el = await mount('<form-date></form-date>');
    expect(input(el).getAttribute('max')).to.equal('9999-12-31');
    expect(input(el).getAttribute('min')).to.equal('0001-01-01');
  });

  it('sets min/max on the datetime input but not on time', async () => {
    const dt = await mount('<form-date type="datetime"></form-date>');
    expect(input(dt).getAttribute('max')).to.equal('9999-12-31T23:59');
    const t = await mount('<form-date type="time"></form-date>');
    expect(input(t).getAttribute('max')).to.equal(null);
  });

  it('honors disabled', async () => {
    const el = await mount('<form-date disabled></form-date>');
    expect(input(el).disabled).to.be.true;
  });
});
