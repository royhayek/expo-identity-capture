import { holdsDocumentText, rowsOf } from '../src/core/DocumentTextRecognizer';

const line = (text: string, x: number, y: number, width = 0.4, height = 0.03) => ({ text, x, y, width, height, confidence: 0.9 });

describe('rowsOf', () => {
  it('joins pieces of an MRZ line read apart, left to right, and keeps printed lines as they are', () => {
    expect(
      rowsOf([
        line('LR40535566LBN9805275M3505193', 0.03, 0.905, 0.6),
        line('Republic of Lebanon', 0.1, 0.05),
        line('P<LBNEL<HAYEK<<ROY<<<<<', 0.03, 0.85, 0.5),
        line('<<<<<<<<<<<<<<<<<<<<<', 0.55, 0.851, 0.42),
        line('1001480283<<<<92', 0.64, 0.906, 0.33),
        line('EL HAYEK', 0.4, 0.3),
        line('ROY', 0.4, 0.301),
      ])
    ).toEqual(['Republic of Lebanon', 'EL HAYEK', 'ROY', 'P<LBNEL<HAYEK<<ROY<<<<<<<<<<<<<<<<<<<<<<<<<<', 'LR40535566LBN9805275M35051931001480283<<<<92']);
  });
});

describe('holdsDocumentText', () => {
  // The back of an ID card read on a device: its three MRZ rows (one read in two pieces), its Arabic print unread
  const idBack = [
    line('IDLBN0012345678<<<<<<<<<<<<<<<', 0.05, 0.7, 0.9),
    line('9001017M3001014LBN<<<<<<<<<<<', 0.05, 0.78, 0.9),
    line('EL<HAYEK<<ROY<<<<', 0.05, 0.86, 0.5),
    line('<<<<<<<<<<<<<', 0.56, 0.861, 0.39),
  ];

  it('takes a side holding an MRZ, its other print unread', () => {
    expect(holdsDocumentText(idBack.slice(0, 3), 4)).toBe(true);
    expect(holdsDocumentText(idBack, 4)).toBe(true);
  });

  it('takes a side with enough lines of text', () => {
    expect(holdsDocumentText([line('Republic of Lebanon', 0.1, 0.1), line('EL HAYEK', 0.1, 0.3), line('ROY', 0.1, 0.4), line('1990', 0.1, 0.5)], 4)).toBe(true);
  });

  it('drops a door, a screen or a page with a word or two', () => {
    expect(holdsDocumentText([], 4)).toBe(false);
    expect(holdsDocumentText([line('EXIT', 0.3, 0.3), line('PUSH', 0.3, 0.5)], 4)).toBe(false);
    // One row of fillers and capitals isn't an MRZ
    expect(holdsDocumentText([line('ABCDEFGHIJKLMNOPQRSTUVWXYZ<<<', 0.05, 0.5, 0.9)], 4)).toBe(false);
  });
});
