import { Plugin, TableMap } from 'da-y-wrapper';

// auto-fix table header colspan when columns are added
export default function tableHeaderFix() {
  return new Plugin({
    appendTransaction(transactions, oldState, newState) {
      if (!transactions.some((tr) => tr.docChanged)) return null;

      const tablesToCheck = new Map();
      newState.doc.descendants((node, pos) => {
        if (node.type.name === 'table') {
          const newMap = TableMap.get(node);
          const newColCount = newMap.width;

          try {
            const oldNode = oldState.doc.nodeAt(pos);
            if (oldNode && oldNode.type.name === 'table') {
              const oldMap = TableMap.get(oldNode);
              const oldColCount = oldMap.width;

              if (oldColCount < newColCount) {
                tablesToCheck.set(pos, node);
              }
            }
          } catch (e) {
            // no op
          }
        }
      });

      if (tablesToCheck.size === 0) return null;

      const { tr } = newState;
      tablesToCheck.forEach((table, tablePos) => {
        const firstRow = table.child(0);
        const map = TableMap.get(table);
        const totalCols = map.width;

        let blockName;
        for (let i = 0; i < firstRow.childCount && !blockName; i += 1) {
          const cell = firstRow.child(i);
          if (cell.textContent) {
            blockName = cell.textContent;
          }
        }

        if (blockName) {
          const cellType = firstRow.child(0).type;
          const para = newState.schema.nodes.paragraph.create(
            null,
            newState.schema.text(blockName),
          );
          const newCell = cellType.create({ colspan: totalCols, rowspan: 1 }, para);
          const newRow = newState.schema.nodes.table_row.create(null, newCell);

          // Map position through previous transaction steps
          const mappedTablePos = tr.mapping.map(tablePos);
          const firstCellPos = mappedTablePos + 1;
          const firstRowEnd = firstCellPos + firstRow.nodeSize - 1;
          tr.replaceWith(firstCellPos, firstRowEnd, newRow);
        }
      });

      return tr.docChanged ? tr : null;
    },
  });
}
