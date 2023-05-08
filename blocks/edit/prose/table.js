import { Fragment } from 'prosemirror-model';

function getHeading(schema) {
  const { paragraph, table_row, table_cell } = schema.nodes;
  const para = paragraph.create(null, schema.text('columns'));
  return table_row.create(null, Fragment.from(table_cell.create({ colspan: 2 }, para)));
}

function getContent(schema) {
  return schema.nodes.table_row.create(null, Fragment.fromArray([
    schema.nodes.table_cell.createAndFill(),
    schema.nodes.table_cell.createAndFill(),
  ]));
}

export default function insertTable(state, dispatch) {
  const heading = getHeading(state.schema);
  const content = getContent(state.schema);

  const tr = state.tr.replaceSelectionWith(
    state.schema.nodes.table.create(null, Fragment.fromArray([heading, content]))
  );

  if (dispatch) dispatch(tr);
  return true;
}
