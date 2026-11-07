/**
 * Document Guide
 *
 * The frame guide of the document camera, and its mapping into the photo: pure geometry, shared by the camera views.
 *
 * @module guide
 */

import type { VerifiedDocType } from '../types/extraction';

/** Width / height of the guide: ID-1 card (85.6 × 54 mm), passport page held upright (88 × 125 mm) */
const GUIDE_RATIO = { card: 1.586, passport: 0.704 };
/** Space between the guide and the viewport's edge */
const GUIDE_INSET = 28;
/** Corner radius of the guide as drawn */
export const GUIDE_RADIUS = 16;
/** Extra room kept around the guide when cropping, for the preview and the photo framing differently */
const CROP_MARGIN = 0.06;
interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The guide inside a viewport of the given size */
export function guideBox(viewWidth: number, viewHeight: number, docType: VerifiedDocType): Box {
  const ratio = docType === 'passport' ? GUIDE_RATIO.passport : GUIDE_RATIO.card;
  let width = viewWidth - GUIDE_INSET * 2;
  let height = width / ratio;
  if (height > viewHeight - GUIDE_INSET * 2) {
    height = viewHeight - GUIDE_INSET * 2;
    width = height * ratio;
  }
  return { x: (viewWidth - width) / 2, y: (viewHeight - height) / 2, width, height };
}

/**
 * The guide, in the photo's pixels: the preview fills the viewport ("cover"), so the photo is scaled until it
 * covers the viewport and centred; the guide maps back through that, with a margin, kept inside the photo.
 */
export function cropForGuide(photoWidth: number, photoHeight: number, viewWidth: number, viewHeight: number, guide: Box): Box {
  const scale = Math.max(viewWidth / photoWidth, viewHeight / photoHeight);
  const offsetX = (viewWidth - photoWidth * scale) / 2;
  const offsetY = (viewHeight - photoHeight * scale) / 2;
  const marginX = guide.width * CROP_MARGIN;
  const marginY = guide.height * CROP_MARGIN;
  const x = Math.max(0, (guide.x - marginX - offsetX) / scale);
  const y = Math.max(0, (guide.y - marginY - offsetY) / scale);
  const width = Math.min(photoWidth - x, (guide.width + marginX * 2) / scale);
  const height = Math.min(photoHeight - y, (guide.height + marginY * 2) / scale);
  return { x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) };
}

