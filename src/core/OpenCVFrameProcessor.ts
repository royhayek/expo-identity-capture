/**
 * OpenCV-based Document Detection Frame Processor
 *
 * Performs real-time document edge detection using OpenCV operations:
 * - Grayscale conversion
 * - Gaussian blur for noise reduction
 * - Canny edge detection
 * - Morphological dilation to close edge gaps
 * - Contour detection with minAreaRect for reliable corner extraction
 *
 * @module OpenCVFrameProcessor
 */

import {
  OpenCV,
  DataTypes,
  ColorConversionCodes,
  RetrievalModes,
  ContourApproximationModes,
  MorphShapes,
  BorderTypes,
  InterpolationFlags,
  RotateFlags,
} from 'react-native-fast-opencv';
import { Platform } from 'react-native';
import type { Frame } from 'react-native-vision-camera';
import type { VerifiedDocType } from '../types/extraction';

// ============================================================================
// Types & Interfaces
// ============================================================================

/** Represents the four corners of a detected document */
export interface DetectedDocumentCorners {
  topLeft: Point;
  topRight: Point;
  bottomLeft: Point;
  bottomRight: Point;
}

/** A 2D point coordinate */
interface Point {
  x: number;
  y: number;
}

/** Result of document detection analysis */
export interface DocumentDetectionResult {
  /** Whether a valid document was detected */
  isDetected: boolean;
  /** Corner coordinates of the detected document (scaled to original frame size) */
  corners: DetectedDocumentCorners | null;
  /** Detection confidence score (0-1) */
  confidence: number;
  /** Calculated aspect ratio of the detected document */
  aspectRatio: number;
  /** Area of the detected document in pixels */
  area: number;
}

/** Configuration for document detection */
interface DetectionConfig {
  /** Minimum area ratio relative to frame (0-1) */
  minAreaRatio: number;
  /** Maximum area ratio relative to frame (0-1) */
  maxAreaRatio: number;
  /** Minimum confidence threshold for detection */
  minConfidence: number;
  /** Canny edge detection low threshold */
  cannyLowThreshold: number;
  /** Canny edge detection high threshold */
  cannyHighThreshold: number;
  /** Gaussian blur kernel size */
  blurKernelSize: number;
  /** Morphological dilation kernel size */
  dilationKernelSize: number;
  /** Number of dilation iterations */
  dilationIterations: number;
  /**
   * How much of its rotated rectangle the outline fills (0-1): a card or a passport fills it even with rounded corners,
   * a thumb over an edge or a booklet's curve; a blob of clutter doesn't
   */
  minRectangularity: number;
  /** The furthest the width/height ratio may be from the document's (relative): further is not that document */
  maxRatioError: number;
}

/** Expected aspect ratios for different document types */
interface AspectRatioConfig {
  [key: string]: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default detection configuration - optimized for document scanning */
const DEFAULT_CONFIG: DetectionConfig = {
  minAreaRatio: 0.10,           // Document must cover at least 10% of frame
  maxAreaRatio: 0.95,           // Document must not cover more than 95% of frame
  minConfidence: 0.55,          // Reasonable confidence threshold
  cannyLowThreshold: 25,        // Edge detection thresholds
  cannyHighThreshold: 80,
  blurKernelSize: 5,
  dilationKernelSize: 3,
  dilationIterations: 2,        // More dilation to connect edge gaps
  minRectangularity: 0.75,
  maxRatioError: 0.3,
};

/**
 * Expected aspect ratios for supported document types
 *
 * Standard ID Card (ID-1/CR80 format):
 * - Dimensions: 85.60mm × 53.98mm (3.375" × 2.125")
 * - Aspect ratio: 85.60 / 53.98 = 1.586 (width / height)
 * - Used for: civil_id, army_card, residence_permit
 *
 * Passport:
 * - Typically held vertically for scanning
 * - Aspect ratio < 1 (height > width)
 */
const ASPECT_RATIOS: AspectRatioConfig = {
  passport: 0.714,         // Passport page ~125mm × 88mm = 0.704, but held vertically
  civil_id: 1.586,         // Standard ID card (ISO/IEC 7810 ID-1: 85.60mm × 53.98mm)
  army_card: 1.586,        // Standard ID card format
  residence_permit: 1.586, // Standard ID card format
  civil_register: 1.414,   // A4-like format (√2 ≈ 1.414)
  default: 1.586,          // Default to standard ID card
};

/** Empty result for failed detection */
const EMPTY_RESULT: DocumentDetectionResult = {
  isDetected: false,
  corners: null,
  confidence: 0,
  aspectRatio: 0,
  area: 0,
};

// Enable debug logging (set to false for production)
// Every contour of every processed frame: too much even for development builds, turned on by hand to tune detection
const DEBUG_LOGGING = false;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Gets the expected aspect ratio for a document type
 */
function getExpectedAspectRatio(docType: VerifiedDocType): number {
  'worklet';
  return ASPECT_RATIOS[docType] ?? ASPECT_RATIOS.default;
}

/**
 * Orders 4 points into a consistent corner arrangement:
 * topLeft, topRight, bottomLeft, bottomRight
 *
 * Algorithm:
 * 1. Sort all points by Y coordinate (top to bottom)
 * 2. Take top 2 points, sort by X (left to right) -> topLeft, topRight
 * 3. Take bottom 2 points, sort by X (left to right) -> bottomLeft, bottomRight
 */
function orderPoints(points: Point[]): DetectedDocumentCorners {
  'worklet';

  if (points.length !== 4) {
    return {
      topLeft: { x: 0, y: 0 },
      topRight: { x: 0, y: 0 },
      bottomLeft: { x: 0, y: 0 },
      bottomRight: { x: 0, y: 0 },
    };
  }

  // Sort by Y coordinate (ascending - top to bottom)
  const sortedByY = [...points].sort((a, b) => a.y - b.y);

  // Top two points (sorted by X - left to right)
  const topPoints = sortedByY.slice(0, 2).sort((a, b) => a.x - b.x);

  // Bottom two points (sorted by X - left to right)
  const bottomPoints = sortedByY.slice(2, 4).sort((a, b) => a.x - b.x);

  return {
    topLeft: topPoints[0],
    topRight: topPoints[1],
    bottomLeft: bottomPoints[0],
    bottomRight: bottomPoints[1],
  };
}

/**
 * Calculates polygon area using the Shoelace formula
 * https://en.wikipedia.org/wiki/Shoelace_formula
 */
function calculatePolygonArea(corners: DetectedDocumentCorners): number {
  'worklet';

  const points = [
    corners.topLeft,
    corners.topRight,
    corners.bottomRight,
    corners.bottomLeft,
  ];

  let area = 0;
  const n = points.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }

  return Math.abs(area) / 2;
}

/**
 * Calculates the Euclidean distance between two points
 */
function distance(p1: Point, p2: Point): number {
  'worklet';
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculates aspect ratio from corner coordinates
 * Returns width/height ratio
 */
function calculateAspectRatio(corners: DetectedDocumentCorners): number {
  'worklet';

  const topWidth = distance(corners.topLeft, corners.topRight);
  const bottomWidth = distance(corners.bottomLeft, corners.bottomRight);
  const avgWidth = (topWidth + bottomWidth) / 2;

  const leftHeight = distance(corners.topLeft, corners.bottomLeft);
  const rightHeight = distance(corners.topRight, corners.bottomRight);
  const avgHeight = (leftHeight + rightHeight) / 2;

  return avgHeight > 0 ? avgWidth / avgHeight : 0;
}

/**
 * Calculates corner coordinates from a rotated rectangle
 *
 * @param centerX - Center X coordinate
 * @param centerY - Center Y coordinate
 * @param width - Rectangle width
 * @param height - Rectangle height
 * @param angleDegrees - Rotation angle in degrees
 */
function getRotatedRectCorners(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  angleDegrees: number
): Point[] {
  'worklet';

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const angleRadians = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);

  // Calculate 4 corners using rotation matrix transformation
  return [
    { x: centerX + (-halfWidth * cos - (-halfHeight) * sin), y: centerY + (-halfWidth * sin + (-halfHeight) * cos) },
    { x: centerX + (halfWidth * cos - (-halfHeight) * sin), y: centerY + (halfWidth * sin + (-halfHeight) * cos) },
    { x: centerX + (halfWidth * cos - halfHeight * sin), y: centerY + (halfWidth * sin + halfHeight * cos) },
    { x: centerX + (-halfWidth * cos - halfHeight * sin), y: centerY + (-halfWidth * sin + halfHeight * cos) },
  ];
}

/**
 * Scales corner coordinates from processing resolution to original frame size
 */
function scaleCorners(
  corners: Point[],
  scaleX: number,
  scaleY: number
): Point[] {
  'worklet';
  return corners.map(p => ({
    x: p.x * scaleX,
    y: p.y * scaleY,
  }));
}

/**
 * Calculates confidence score based on area and aspect ratio metrics
 *
 * @param areaRatio - Ratio of contour area to total frame area
 * @param ratioError - Deviation from expected aspect ratio (0-1)
 */
function calculateConfidence(areaRatio: number, ratioError: number): number {
  'worklet';

  // Area score: prefer documents covering 15-80% of frame
  let areaScore: number;
  if (areaRatio >= 0.15 && areaRatio <= 0.80) {
    areaScore = 1.0;
  } else if (areaRatio >= 0.10 && areaRatio <= 0.90) {
    areaScore = 0.7;
  } else {
    areaScore = 0.4;
  }

  // Aspect ratio score: allow reasonable tolerance for camera angle/perspective
  // Standard ID card is 1.586 - allow up to 25% error for perspective distortion
  let ratioScore: number;
  if (ratioError <= 0.15) {
    ratioScore = 1.0;   // Excellent match
  } else if (ratioError <= 0.25) {
    ratioScore = 0.8;   // Good match - some perspective distortion
  } else if (ratioError <= 0.35) {
    ratioScore = 0.6;   // Acceptable - significant angle
  } else {
    ratioScore = 0.3;   // Poor match
  }

  // Weighted combination
  return areaScore * 0.4 + ratioScore * 0.6;
}

/**
 * Calculates aspect ratio for a contour, handling document orientation
 * For standard ID cards (civil_id, army_card, residence_permit):
 * - Expected ratio is 1.586 (width > height when horizontal)
 * - Always returns the larger/smaller ratio to normalize orientation
 */
function getContourAspectRatio(
  rectWidth: number,
  rectHeight: number,
  docType: VerifiedDocType
): number {
  'worklet';

  // Passports are vertical (height > width), so we want smaller/larger
  if (docType === 'passport') {
    return Math.min(rectWidth, rectHeight) / Math.max(rectWidth, rectHeight);
  }

  // For standard ID cards, always return larger/smaller to get ratio > 1
  // This normalizes the ratio regardless of how the card is oriented in the frame
  const ratio = Math.max(rectWidth, rectHeight) / Math.min(rectWidth, rectHeight);

  if (DEBUG_LOGGING) {
    console.log(`[OpenCV] Aspect ratio calc: rectW=${rectWidth.toFixed(0)}, rectH=${rectHeight.toFixed(0)}, ratio=${ratio.toFixed(3)}`);
  }

  return ratio;
}

/**
 * Validates that detected corners are within frame bounds
 * Other validations (aspect ratio, area) are handled in the main detection logic
 */
function isValidDocumentShape(
  corners: DetectedDocumentCorners,
  frameWidth: number,
  frameHeight: number
): boolean {
  'worklet';

  const { topLeft, topRight, bottomLeft, bottomRight } = corners;
  const allCorners = [topLeft, topRight, bottomLeft, bottomRight];

  // Check all corners are within frame bounds (with very generous margin)
  // Allow 20% outside frame to handle perspective distortion
  const margin = Math.max(frameWidth, frameHeight) * 0.2;

  for (const corner of allCorners) {
    if (
      corner.x < -margin ||
      corner.x > frameWidth + margin ||
      corner.y < -margin ||
      corner.y > frameHeight + margin
    ) {
      return false;
    }
  }

  // Basic sanity check - corners should not be at the same position
  const minDistance = Math.min(frameWidth, frameHeight) * 0.02; // 2% minimum
  if (
    distance(topLeft, topRight) < minDistance ||
    distance(bottomLeft, bottomRight) < minDistance ||
    distance(topLeft, bottomLeft) < minDistance ||
    distance(topRight, bottomRight) < minDistance
  ) {
    return false;
  }

  return true;
}

/** The on-screen guide the frame's outlines must sit in: the frame's quarter turn, the view and the guide's size */
export interface GuideFrame {
  sideways: boolean;
  view: { width: number; height: number };
  guide: { width: number; height: number };
}

/** How far from the guide's centre a document may sit (share of the guide's size), and how large it may be against it */
const GUIDE_FIT = { offset: 0.25, minArea: 0.45, maxArea: 1.6 };

/**
 * Whether a detected outline sits in the guide, as the customer sees it: the photo is cropped to the guide, so an
 * outline elsewhere (or outside the visible part of the frame) would be taken, then dropped by the check, again and
 * again. The frame's corners are in its stored orientation; a quarter turn only swaps the axes, so the test, symmetric
 * about the centre, needs nothing else from the orientation.
 */
export function sitsInGuide(
  corners: DetectedDocumentCorners,
  frameWidth: number,
  frameHeight: number,
  { sideways, view, guide }: GuideFrame
): boolean {
  'worklet';
  const uprightWidth = sideways ? frameHeight : frameWidth;
  const uprightHeight = sideways ? frameWidth : frameHeight;
  // The preview covers the view: the frame scaled up until it fills it, centred
  const scale = Math.max(view.width / uprightWidth, view.height / uprightHeight);
  const guideWidth = guide.width / scale;
  const guideHeight = guide.height / scale;
  const { topLeft, topRight, bottomLeft, bottomRight } = corners;
  const centreX = (topLeft.x + topRight.x + bottomLeft.x + bottomRight.x) / 4 - frameWidth / 2;
  const centreY = (topLeft.y + topRight.y + bottomLeft.y + bottomRight.y) / 4 - frameHeight / 2;
  const offsetX = Math.abs(sideways ? centreY : centreX);
  const offsetY = Math.abs(sideways ? centreX : centreY);
  const area =
    Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y) * Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y);
  const ratio = area / (guideWidth * guideHeight);
  return (
    offsetX <= guideWidth * GUIDE_FIT.offset &&
    offsetY <= guideHeight * GUIDE_FIT.offset &&
    ratio >= GUIDE_FIT.minArea &&
    ratio <= GUIDE_FIT.maxArea
  );
}

// ============================================================================
// Frame Conversion
// ============================================================================

/** A camera frame scaled down and repacked as 3-channel BGR, the input of the detectors */
export interface ProcessingBuffer {
  buffer: Uint8Array;
  width: number;
  height: number;
}

/** Bytes per pixel of the 8-bit RGB formats a frame output streams in `'rgb'` mode */
const RGB_CHANNELS = 4;

/**
 * Android hands a frame's pixels over from its plane: the frame's own buffer is a HardwareBuffer there, which Nitro
 * can only wrap in apps built for Android 8 at least (minSdk 26), and threw on every frame otherwise, so no document
 * was ever detected. The plane wraps the same pixels as a plain buffer. iOS reads the frame's buffer as it is
 */
const PIXELS_FROM_PLANE = Platform.OS === 'android';

/** A non-planar frame's pixels and the bytes of each of its rows, read where the platform hands them over */
function framePixels(frame: Frame): { pixels: ArrayBuffer; bytesPerRow: number } {
  'worklet';
  if (PIXELS_FROM_PLANE) {
    const [plane] = frame.getPlanes();
    if (plane) return { pixels: plane.getPixelBuffer(), bytesPerRow: plane.bytesPerRow };
  }
  return { pixels: frame.getPixelBuffer(), bytesPerRow: frame.bytesPerRow };
}

/** A frame's pixels without the padding some rows carry past its width */
function packedPixels(pixels: ArrayBuffer, width: number, height: number, bytesPerRow: number): Uint8Array {
  'worklet';
  const rowBytes = width * RGB_CHANNELS;
  const raw = new Uint8Array(pixels);
  if (bytesPerRow === rowBytes) return raw;
  const packed = new Uint8Array(rowBytes * height);
  for (let row = 0; row < height; row++) {
    packed.set(raw.subarray(row * bytesPerRow, row * bytesPerRow + rowBytes), row * rowBytes);
  }
  return packed;
}

/** The guide's part of a frame, upright: 4-channel pixels, to save as an image and read */
export interface GuidePixels {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  pixelFormat: 'BGRA' | 'RGBA';
}

/**
 * The part of the frame inside the guide (with `margin` around it, a share of the guide), turned upright: what the
 * photo will hold, read before it is taken. The guide is centred in the view and the preview covers it, so the crop is
 * centred in the frame too, whatever its quarter turn.
 *
 * @returns null when the frame has no CPU-readable RGB pixels
 */
export function frameGuidePixels(
  frame: Frame,
  { view, guide }: Pick<GuideFrame, 'view' | 'guide'>,
  margin: number,
  clockwise: 'left' | 'right'
): GuidePixels | null {
  'worklet';

  const { width, height, pixelFormat, orientation } = frame;
  if (!frame.hasPixelBuffer || frame.isPlanar || width === 0 || height === 0) return null;
  if (pixelFormat !== 'rgb-bgra-8-bit' && pixelFormat !== 'rgb-rgba-8-bit') return null;

  const sideways = orientation === 'left' || orientation === 'right';
  const uprightWidth = sideways ? height : width;
  const uprightHeight = sideways ? width : height;
  const scale = Math.max(view.width / uprightWidth, view.height / uprightHeight);
  const cropWidth = Math.min(uprightWidth, (guide.width * (1 + margin * 2)) / scale);
  const cropHeight = Math.min(uprightHeight, (guide.height * (1 + margin * 2)) / scale);
  const bufferWidth = Math.floor(sideways ? cropHeight : cropWidth);
  const bufferHeight = Math.floor(sideways ? cropWidth : cropHeight);

  const { pixels, bytesPerRow } = framePixels(frame);
  const all = OpenCV.Mat.createFromBuffer('uint8', height, width, RGB_CHANNELS, packedPixels(pixels, width, height, bytesPerRow));
  const cropped = OpenCV.Mat.create(0, 0, DataTypes.CV_8UC4);
  OpenCV.crop(
    all,
    cropped,
    OpenCV.Rect.create(Math.floor((width - bufferWidth) / 2), Math.floor((height - bufferHeight) / 2), bufferWidth, bufferHeight)
  );
  all.release();
  // A quarter turn off: `clockwise` is the flag of pixels upright once turned clockwise, which the platforms name apart
  // (Android: CameraX's 90° of rotation, read as `left`); the other quarter turn the other way
  let upright = cropped;
  if (orientation !== 'up') {
    upright = OpenCV.Mat.create(0, 0, DataTypes.CV_8UC4);
    OpenCV.rotate(
      cropped,
      upright,
      orientation === 'down'
        ? RotateFlags.ROTATE_180
        : orientation === clockwise
          ? RotateFlags.ROTATE_90_CLOCKWISE
          : RotateFlags.ROTATE_90_COUNTERCLOCKWISE
    );
    cropped.release();
  }
  const { buffer, cols, rows } = upright.toBuffer('uint8');
  upright.release();
  return {
    buffer: buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer,
    width: cols,
    height: rows,
    pixelFormat: pixelFormat === 'rgb-bgra-8-bit' ? 'BGRA' : 'RGBA',
  };
}

/**
 * Converts a VisionCamera frame into a small BGR buffer for {@link detectDocumentWithOpenCV} and liveness detection.
 *
 * The frame output must stream `'rgb'` (`rgb-bgra-8-bit` on iOS, `rgb-rgba-8-bit` on Android). Rows padded past the
 * frame's width are repacked first, then the frame is scaled so its longer side is `targetLongSide`.
 *
 * @returns null when the frame has no CPU-readable RGB pixels
 */
export function frameToProcessingBuffer(frame: Frame, targetLongSide: number = 480): ProcessingBuffer | null {
  'worklet';

  const { width, height, pixelFormat } = frame;
  if (!frame.hasPixelBuffer || frame.isPlanar || width === 0 || height === 0) {
    return null;
  }
  if (pixelFormat !== 'rgb-bgra-8-bit' && pixelFormat !== 'rgb-rgba-8-bit') {
    return null;
  }

  const { pixels, bytesPerRow } = framePixels(frame);
  const packed = packedPixels(pixels, width, height, bytesPerRow);

  const scale = Math.min(1, targetLongSide / Math.max(width, height));
  const outWidth = Math.floor(width * scale);
  const outHeight = Math.floor(height * scale);

  const rgba = OpenCV.Mat.createFromBuffer('uint8', height, width, RGB_CHANNELS, packed);
  const resized = OpenCV.Mat.create(0, 0, DataTypes.CV_8UC4);
  OpenCV.resize(rgba, resized, OpenCV.Size.create(outWidth, outHeight), 0, 0, InterpolationFlags.INTER_AREA);
  const bgr = OpenCV.Mat.create(0, 0, DataTypes.CV_8UC3);
  OpenCV.cvtColor(
    resized,
    bgr,
    pixelFormat === 'rgb-bgra-8-bit' ? ColorConversionCodes.COLOR_BGRA2BGR : ColorConversionCodes.COLOR_RGBA2BGR
  );
  const { buffer } = bgr.toBuffer('uint8');

  rgba.release();
  resized.release();
  bgr.release();

  return { buffer, width: outWidth, height: outHeight };
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Processes a frame buffer for document detection using OpenCV
 *
 * Pipeline:
 * 1. Convert to grayscale
 * 2. Apply Gaussian blur for noise reduction
 * 3. Canny edge detection
 * 4. Morphological dilation to close gaps
 * 5. Find external contours
 * 6. For each valid contour, compute minAreaRect
 * 7. Select best candidate based on confidence score
 *
 * @param resizedFrameBuffer - RGB/BGR frame data as Uint8Array
 * @param width - Width of the resized frame (processing resolution)
 * @param height - Height of the resized frame (processing resolution)
 * @param originalWidth - Original frame width (for coordinate scaling)
 * @param originalHeight - Original frame height (for coordinate scaling)
 * @param docType - Expected document type for aspect ratio validation
 * @param config - Optional detection configuration
 */
export function detectDocumentWithOpenCV(
  resizedFrameBuffer: Uint8Array,
  width: number,
  height: number,
  originalWidth: number,
  originalHeight: number,
  docType: VerifiedDocType,
  config: Partial<DetectionConfig> = {},
  guideFrame?: GuideFrame
): DocumentDetectionResult {
  'worklet';

  const cfg = { ...DEFAULT_CONFIG, ...config };
  const frameArea = width * height;

  // Validate input buffer size
  const expectedSize = frameArea * 3; // 3 channels (RGB/BGR)
  if (resizedFrameBuffer.length !== expectedSize) {
    if (DEBUG_LOGGING) {
      console.log(`[OpenCV] Buffer size mismatch: expected ${expectedSize}, got ${resizedFrameBuffer.length}`);
    }
    return EMPTY_RESULT;
  }

  try {
    // ========================================================================
    // Image Preprocessing Pipeline
    // ========================================================================

    // Create Mat from frame buffer
    const src = OpenCV.Mat.createFromBuffer('uint8', height, width, 3, resizedFrameBuffer);

    // Convert to grayscale
    const gray = OpenCV.Mat.create(0, 0, DataTypes.CV_8U);
    OpenCV.cvtColor(src, gray, ColorConversionCodes.COLOR_BGR2GRAY);

    // Apply Gaussian blur for noise reduction
    const blurred = OpenCV.Mat.create(0, 0, DataTypes.CV_8U);
    const blurKernel = OpenCV.Size.create(cfg.blurKernelSize, cfg.blurKernelSize);
    OpenCV.GaussianBlur(gray, blurred, blurKernel, 0);

    // Apply Canny edge detection
    const edges = OpenCV.Mat.create(0, 0, DataTypes.CV_8U);
    OpenCV.Canny(blurred, edges, cfg.cannyLowThreshold, cfg.cannyHighThreshold);

    // The edges of colour too: a light card on a light desk is as bright as the desk, but grey against its wood (measured
    // on a frame: the card's lower edge read nowhere in brightness, along its whole length in saturation)
    const hsv = OpenCV.Mat.create(0, 0, DataTypes.CV_8UC3);
    OpenCV.cvtColor(src, hsv, ColorConversionCodes.COLOR_BGR2HSV);
    const saturation = OpenCV.Mat.create(0, 0, DataTypes.CV_8U);
    OpenCV.extractChannel(hsv, saturation, 1);
    const saturationBlurred = OpenCV.Mat.create(0, 0, DataTypes.CV_8U);
    OpenCV.GaussianBlur(saturation, saturationBlurred, blurKernel, 0);
    const colourEdges = OpenCV.Mat.create(0, 0, DataTypes.CV_8U);
    OpenCV.Canny(saturationBlurred, colourEdges, cfg.cannyLowThreshold, cfg.cannyHighThreshold);
    OpenCV.bitwise_or(edges, colourEdges, edges);
    hsv.release();
    saturation.release();
    saturationBlurred.release();
    colourEdges.release();

    // Dilate edges to close gaps
    const dilationKernel = OpenCV.getStructuringElement(
      MorphShapes.MORPH_RECT,
      OpenCV.Size.create(cfg.dilationKernelSize, cfg.dilationKernelSize)
    );
    const dilated = OpenCV.Mat.create(0, 0, DataTypes.CV_8U);
    const anchor = OpenCV.Point.create(-1, -1);
    const borderValue = OpenCV.Scalar.create(0, 0, 0, 0);
    OpenCV.dilate(
      edges,
      dilated,
      dilationKernel,
      anchor,
      cfg.dilationIterations,
      BorderTypes.BORDER_CONSTANT,
      borderValue
    );

    // ========================================================================
    // Contour Detection
    // ========================================================================

    const contours = OpenCV.MatVector.create();
    OpenCV.findContours(
      dilated,
      contours,
      // Every outline, inner ones too: a card whose edge touches the table's or a hand's merges into one outer outline,
      // its own outline is still there inside
      RetrievalModes.RETR_LIST,
      ContourApproximationModes.CHAIN_APPROX_SIMPLE
    );

    const contourCount = contours.length;

    if (DEBUG_LOGGING) {
      console.log(`[OpenCV] Found ${contourCount} contours`);
    }

    // ========================================================================
    // Contour Analysis & Selection
    // ========================================================================

    let bestContour: DetectedDocumentCorners | null = null;
    let bestArea = 0;
    let bestConfidence = 0;

    const minArea = frameArea * cfg.minAreaRatio;
    const maxArea = frameArea * cfg.maxAreaRatio;
    const scaleX = originalWidth / width;
    const scaleY = originalHeight / height;
    const expectedRatio = getExpectedAspectRatio(docType);

    for (let i = 0; i < contourCount; i++) {
      const contour = contours.get(i);

      // Calculate contour area
      const area = OpenCV.contourArea(contour, false).value;

      // Skip contours outside valid area range
      if (area < minArea || area > maxArea) {
        continue;
      }

      // Get minimum area rotated rectangle
      const rotatedRect = OpenCV.minAreaRect(contour);

      // Extract rotated rectangle properties (x/y is the centre)
      const { x: centerX, y: centerY, width: rectWidth, height: rectHeight, angle } = rotatedRect;

      // A document fills its rectangle: a trapezoid of furniture or a shadow's corner doesn't. What it holds is checked
      // on the photo (DocumentScanView): an MRZ, or a document's text
      if (area / Math.max(1, rectWidth * rectHeight) < cfg.minRectangularity) {
        continue;
      }

      // Calculate corners from rotated rectangle
      const corners = getRotatedRectCorners(centerX, centerY, rectWidth, rectHeight, angle);

      // Scale corners to original frame resolution
      const scaledCorners = scaleCorners(corners, scaleX, scaleY);
      const orderedCorners = orderPoints(scaledCorners);

      // Validate the detected shape is a reasonable document
      // Only an outline in the guide: the photo is cropped to it, and the largest outline (an open passport's two pages,
      // the table) is not the document the customer placed there
      if (guideFrame && !sitsInGuide(orderedCorners, originalWidth, originalHeight, guideFrame)) {
        continue;
      }
      if (!isValidDocumentShape(orderedCorners, originalWidth, originalHeight)) {
        if (DEBUG_LOGGING) {
          console.log(`[OpenCV] Contour ${i}: Invalid shape - skipping`);
        }
        continue;
      }

      // Calculate aspect ratio
      const aspectRatio = getContourAspectRatio(rectWidth, rectHeight, docType);
      const ratioError = Math.abs(aspectRatio - expectedRatio) / expectedRatio;
      // Not the document's shape: a scored-down match is still a door or a screen
      if (ratioError > cfg.maxRatioError) {
        continue;
      }

      // Calculate confidence score
      const areaRatio = area / frameArea;
      const confidence = calculateConfidence(areaRatio, ratioError);

      if (DEBUG_LOGGING) {
        console.log(
          `[OpenCV] Contour ${i}: area=${area.toFixed(0)}, ` +
          `ratio=${aspectRatio.toFixed(2)} (expected=${expectedRatio.toFixed(2)}, error=${(ratioError * 100).toFixed(0)}%), ` +
          `confidence=${confidence.toFixed(2)}`
        );
      }

      // Select best candidate (prioritize confidence, then area)
      if (confidence > bestConfidence && area > bestArea * 0.8) {
        bestArea = area;
        bestConfidence = confidence;
        bestContour = orderedCorners;
      }
    }

    // Free the native buffers now rather than waiting for the worklet runtime's GC: this runs on every processed frame
    src.release();
    gray.release();
    blurred.release();
    edges.release();
    dilationKernel.release();
    dilated.release();
    contours.release();

    // ========================================================================
    // Return Result
    // ========================================================================

    if (bestContour !== null && bestConfidence >= cfg.minConfidence) {
      const finalArea = calculatePolygonArea(bestContour);
      const finalAspectRatio = calculateAspectRatio(bestContour);

      if (DEBUG_LOGGING) {
        console.log(`[OpenCV] Document detected with confidence ${bestConfidence.toFixed(2)}`);
      }

      return {
        isDetected: true,
        corners: bestContour,
        confidence: bestConfidence,
        aspectRatio: finalAspectRatio,
        area: finalArea,
      };
    }

    if (DEBUG_LOGGING) {
      console.log(`[OpenCV] No document detected (best confidence=${bestConfidence.toFixed(2)})`);
    }

    return EMPTY_RESULT;

  } catch (error) {
    if (DEBUG_LOGGING) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`[OpenCV] Detection error: ${errorMessage}`);
    }

    return EMPTY_RESULT;
  }
}

export default detectDocumentWithOpenCV;
