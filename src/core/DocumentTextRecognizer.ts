/**
 * Document Text Recognizer
 *
 * The native text recognition of document photos (src/specs/DocumentText.nitro.ts): Apple Vision on iOS, ML Kit
 * (Google Play services) on Android, set up for documents.
 *
 * @module DocumentTextRecognizer
 */

import { NitroModules } from 'react-native-nitro-modules';

import type { DocumentTextRecognizer, RecognizedTextLine } from '../specs/DocumentText.nitro';

let recognizer: DocumentTextRecognizer | null | undefined;

/** The native recognizer, or null in a build made before it was added (the app's native code not rebuilt yet) */
export function documentTextRecognizer(): DocumentTextRecognizer | null {
  if (recognizer === undefined) {
    try {
      recognizer = NitroModules.createHybridObject<DocumentTextRecognizer>('DocumentTextRecognizer');
    } catch {
      recognizer = null;
    }
  }
  return recognizer;
}

/** Characters an MRZ is made of, with the spaces OCR puts in it */
const MRZ_FRAGMENT = /^[A-Z0-9<«\s]+$/;

/**
 * The lines as rows, top to bottom: pieces of an MRZ line read apart (recognizers break a line at a long run of '<')
 * are joined back, left to right and without spaces; any other line stays a row of its own.
 */
export function rowsOf(lines: readonly RecognizedTextLine[]): string[] {
  const sorted = [...lines].sort((a, b) => a.y + a.height / 2 - (b.y + b.height / 2));
  const rows: RecognizedTextLine[][] = [];
  for (const line of sorted) {
    const row = rows[rows.length - 1];
    const last = row?.[row.length - 1];
    const sameRow =
      last !== undefined &&
      Math.abs(last.y + last.height / 2 - (line.y + line.height / 2)) < Math.min(last.height, line.height) * 0.6;
    const mrzPieces =
      last !== undefined && MRZ_FRAGMENT.test(last.text) && MRZ_FRAGMENT.test(line.text) && (last.text + line.text).includes('<');
    if (row && sameRow && mrzPieces) row.push(line);
    else rows.push([line]);
  }
  return rows.map((row) =>
    row.length === 1
      ? row[0].text
      : [...row].sort((a, b) => a.x - b.x).map((piece) => piece.text.replace(/\s/g, '')).join('')
  );
}

export type { DocumentTextRecognizer, RecognizedTextLine, TextRegion } from '../specs/DocumentText.nitro';
