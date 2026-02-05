import { expect } from '@esm-bundle/chai';
import { Y } from 'da-y-wrapper';
import { jSheetToY } from '../../../../blocks/sheet/collab/convert.js';
import { updateCell, deleteRow, deleteColumn } from '../../../../blocks/sheet/collab/events.js';

describe('Sheet Collab', () => {
  it('converts simple jSheet to Y', () => {
    const ydoc = new Y.Doc();

    const sheets = [
      {
        sheetName: 'sheet1',
        data: [
          ['A', 'B', 'C'],
          ['D', 'E', 'F'],
          ['G', 'H', 'I'],
        ],
        columns: [
          { width: 100 },
        ],
      },
    ];

    jSheetToY(sheets, ydoc);

    const ysheets = ydoc.getArray('sheets');
    expect(ysheets.length).to.equal(1);
    expect(ysheets.get(0).get('sheetName')).to.equal('sheet1');
    for (let i = 0; i < sheets[0].data.length; i += 1) {
      for (let j = 0; j < sheets[0].data[i].length; j += 1) {
        expect(ysheets.get(0).get('data').get(i).get(j)
          .getAttribute('value')).to.equal(sheets[0].data[i][j]);
      }
    }
  });

  it('converts multi-sheet jSheet to Y', () => {
    const ydoc = new Y.Doc();

    const sheets = [
      {
        sheetName: 'sheet1',
        data: [
          ['A', 'B', 'C'],
          ['D', 'E', 'F'],
          ['G', 'H', 'I'],
        ],
        columns: [
          { width: 100 },
        ],
      },
      {
        sheetName: 'sheet2',
        data: [
          ['A', 'B', 'C'],
          ['D', 'E', 'F'],
          ['G', 'H', 'I'],
        ],
      },
    ];

    jSheetToY(sheets, ydoc);

    const ysheets = ydoc.getArray('sheets');
    expect(ysheets.length).to.equal(2);
    expect(ysheets.get(0).get('sheetName')).to.equal('sheet1');
    for (let i = 0; i < sheets[0].data.length; i += 1) {
      for (let j = 0; j < sheets[0].data[i].length; j += 1) {
        expect(ysheets.get(0).get('data').get(i).get(j)
          .getAttribute('value')).to.equal(sheets[0].data[i][j]);
      }
    }
    expect(ysheets.get(1).get('sheetName')).to.equal('sheet2');
    for (let i = 0; i < sheets[1].data.length; i += 1) {
      for (let j = 0; j < sheets[1].data[i].length; j += 1) {
        expect(ysheets.get(1).get('data').get(i).get(j)
          .getAttribute('value')).to.equal(sheets[1].data[i][j]);
      }
    }
  });

  it('inserts 20 rows and 20 columns on empty sheet', () => {
    const ydoc = new Y.Doc();

    const sheets = [
      {
        sheetName: 'sheet1',
        data: [],
        columns: [],
      },
    ];

    jSheetToY(sheets, ydoc);

    const ysheets = ydoc.getArray('sheets');
    expect(ysheets.length).to.equal(1);
    expect(ysheets.get(0).get('sheetName')).to.equal('sheet1');
    expect(ysheets.get(0).get('data').length).to.equal(20);
    expect(ysheets.get(0).get('data').get(0).length).to.equal(20);
    expect(ysheets.get(0).get('columns').length).to.equal(0);
  });

  it('removes existing data if passed as option', () => {
    const ydoc = new Y.Doc();

    const sheets1 = [
      {
        sheetName: 'sheet1',
        data: [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H', 'I']],
      },
    ];

    jSheetToY(sheets1, ydoc);

    const sheets2 = [
      {
        sheetName: 'sheet2',
        data: [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H', 'I']],
      },
    ];

    jSheetToY(sheets2, ydoc);

    expect(ydoc.getArray('sheets').length).to.equal(2);

    const sheets3 = [
      {
        sheetName: 'sheet3',
        data: [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H', 'I']],
      },
    ];

    jSheetToY(sheets3, ydoc, true);
    expect(ydoc.getArray('sheets').length).to.equal(1);
    expect(ydoc.getArray('sheets').get(0).get('sheetName')).to.equal('sheet3');
  });
});

describe('Sheet Collab Events', () => {
  it('updates cell values', () => {
    const ydoc = new Y.Doc();
    const sheets = [
      {
        sheetName: 'sheet1',
        data: [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H', 'I']],
      },
    ];

    jSheetToY(sheets, ydoc);

    const firstSheet = ydoc.getArray('sheets').get(0).get('data');

    updateCell(firstSheet, 0, 0, 'Test');
    expect(ydoc.getArray('sheets').get(0).get('data').get(0)
      .get(0)
      .getAttribute('value')).to.equal('Test');
  });

  it('restores min rows after deleting rows/columns', () => {
    const ydoc = new Y.Doc();
    const sheets = [
      {
        sheetName: 'sheet1',
        data: [['A', 'B', 'C'], ['D', 'E', 'F'], ['G', 'H', 'I']],
        columns: [],
      },
    ];

    jSheetToY(sheets, ydoc);

    const getFirstSheet = () => ydoc.getArray('sheets').get(0).get('data');
    const getFirstSheetColumns = () => ydoc.getArray('sheets').get(0).get('columns');
    expect(getFirstSheet().length).to.equal(20);
    expect(getFirstSheet().get(0).length).to.equal(20);
    deleteRow(getFirstSheet(), 0, 1);
    expect(getFirstSheet().length).to.equal(20);
    expect(getFirstSheet().get(0).length).to.equal(20);
    deleteColumn(getFirstSheet(), getFirstSheetColumns(), 0, 1);
    expect(getFirstSheet().length).to.equal(20);
    expect(getFirstSheet().get(0).length).to.equal(20);
  });
});
