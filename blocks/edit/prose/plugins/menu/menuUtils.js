export function markActive(state, type) {
  const { from, to, $from, $to, empty } = state.selection;
  if (empty) {
    return !!type.isInSet(state.storedMarks || $from.marksAcross($to) || []);
  }
  return state.doc.rangeHasMark(from, to, type);
}
