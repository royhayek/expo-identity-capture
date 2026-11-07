import { rowsOf } from '../src/core/DocumentTextRecognizer';

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
