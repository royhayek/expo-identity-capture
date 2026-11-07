import type { HybridObject } from 'react-native-nitro-modules';

/** Part of an image, relative to it upright (0-1, origin top-left) */
export interface TextRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One line of text found in a photo, its box relative to the whole image upright (0-1, origin top-left) */
export interface RecognizedTextLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0-1, as the platform's recognizer reports it */
  confidence: number;
}

/**
 * Reads the text of a document photo on the device, set up for documents rather than prose: Apple Vision on iOS
 * (accurate, without language correction, which rewrites an MRZ), ML Kit through Google Play services on Android.
 */
export interface DocumentTextRecognizer extends HybridObject<{ ios: 'swift'; android: 'kotlin' }> {
  /**
   * The lines in the photo at `path` (a file:// URI or a path), or only in `region` of it: read there at a higher
   * resolution, for small print such as an MRZ.
   */
  recognize(path: string, region?: TextRegion): Promise<RecognizedTextLine[]>;
}
