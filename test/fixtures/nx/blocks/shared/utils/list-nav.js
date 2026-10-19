// Stub: da-nx owns the navigation rules. Selects the first item so callers' wiring can be tested.
export function listKeydown(key, { items, setActive }) {
  if (key === 'ArrowDown' && items?.length) setActive(items[0].value);
  return false;
}
