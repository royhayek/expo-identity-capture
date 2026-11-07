import { readingFromText } from '../src/services/DocumentReader';

const read = (...lines: string[]) => readingFromText(lines.join('\n'));
const SPECIMEN = ['P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<', 'L898902C36UTO7408122F1204159ZE184226B<<<<<10'];
const LINE2 = 'LR40535566LBN9805275M35051931001480283<<<<92';
/** What the phone printed around the MRZ on a Lebanese passport (field logs) */
const PRINTED = ['Republic of Lebanon / Republique Libanaise', 'LR4053556', 'EL HAYEK', 'ROY', 'NICOLAS', 'LEBANESE', 'SAIDA'];
const PASSPORT = {
  isValid: true,
  issuingCountry: 'LBN',
  nationality: 'LBN',
  surname: 'EL HAYEK',
  givenNames: 'ROY',
  dateOfBirth: '1998-05-27',
  sex: 'M',
  documentNumber: 'LR4053556',
  dateOfExpiry: '2035-05-19',
};

describe('MRZ reading (ICAO 9303 TD3)', () => {
  it('reads a well-read MRZ', () => {
    expect(read(...SPECIMEN)).toMatchObject({ isValid: true, issuingCountry: 'UTO', surname: 'ERIKSSON', givenNames: 'ANNA MARIA', documentNumber: 'L898902C3' });
  });

  it('restores trailing filler the recognizer dropped: 9 of them (field log, native reader)', () => {
    expect(read(...PRINTED, 'P<LBNEL<HAYEK<<ROY<<<<<<<<<<<<<<<<<', LINE2)).toMatchObject(PASSPORT);
  });

  it('restores dropped filler and the << read as <C, from the printed names (field log, expo-text-extractor)', () => {
    expect(read(...PRINTED, 'PALBNEL<HAYEK<CROY<<<<<<<<<<<<<<<<<<<<<<<', LINE2)).toMatchObject(PASSPORT);
  });

  it('trims filler read too long, and a K read in the filler', () => {
    expect(read('P<UTOERIKSSON<<ANNA<MARIA<<<<<K<<<<<<<<<<<<<<<<', SPECIMEN[1])).toMatchObject({ isValid: true, givenNames: 'ANNA MARIA' });
  });

  it('never takes a K for filler at the end of a name', () => {
    expect(read('P<UTOERIKSSON<<ERIK<<<<<<<<<<<<<<<<<<<<<<<<<<', SPECIMEN[1])).toMatchObject({ givenNames: 'ERIK' });
  });

  it('repairs a look-alike in the document number when exactly one swap passes its check digit', () => {
    // L898902C3 read as L8989O2C3: an O where its check digit wants a 0
    expect(read(SPECIMEN[0], 'L8989O2C36UTO7408122F1204159ZE184226B<<<<<10')).toMatchObject({ isValid: true, documentNumber: 'L898902C3' });
  });

  it('refuses an MRZ whose check digits fail', () => {
    expect(read(SPECIMEN[0], 'L898902C36UTO7408123F1204159ZE184226B<<<<<10').isValid).toBe(false);
  });

  it('ignores lines with filler that sit nowhere near the MRZ', () => {
    expect(read('ABC<<', 'Republic of Lebanon', SPECIMEN[1]).isValid).toBe(false);
  });

  it('dates: a birth never in the future, an expiry up to 20 years ahead', () => {
    expect(read(...PRINTED, 'P<LBNEL<HAYEK<<ROY<<<<<<<<<<<<<<<<<<<<<<<<<<', LINE2)).toMatchObject({ dateOfBirth: '1998-05-27', dateOfExpiry: '2035-05-19' });
    expect(read(...SPECIMEN)).toMatchObject({ dateOfBirth: '1974-08-12', dateOfExpiry: '2012-04-15' });
  });
});

describe('MRZ reading (TD1 ID cards)', () => {
  // ICAO 9303 part 5 specimen
  const TD1 = ['I<UTOD231458907<<<<<<<<<<<<<<<', '7408122F1204159UTO<<<<<<<<<<<6', 'ERIKSSON<<ANNA<MARIA<<<<<<<<<<'];

  it('reads the three lines of an ID card', () => {
    expect(read(...TD1)).toMatchObject({ isValid: true, issuingCountry: 'UTO', surname: 'ERIKSSON', givenNames: 'ANNA MARIA', documentNumber: 'D23145890' });
  });

  it('restores the names line short of filler', () => {
    expect(read(TD1[0], TD1[1], 'ERIKSSON<<ANNA<MARIA<<<')).toMatchObject({ isValid: true, givenNames: 'ANNA MARIA' });
  });
});
