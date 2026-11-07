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
} from 'react-native-fast-opencv';
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
const DEBUG_LOGGING = __DEV__ ?? false;

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
 * Converts a VisionCamera frame into a small BGR buffer for {@link detectDocumentWithOpenCV} and liveness detection.
 *
 * The frame output must stream `'rgb'` (`rgb-bgra-8-bit` on iOS, `rgb-rgba-8-bit` on Android). Rows padded past the
 * frame's width are repacked first, then the frame is scaled so its longer side is `targetLongSide`.
 *
 * @returns null when the frame has no CPU-readable RGB pixels
 */
export function frameToProcessingBuffer(frame: Frame, targetLongSide: number = 480): ProcessingBuffer | null {
  'worklet';

  const { width, height, bytesPerRow, pixelFormat } = frame;
  if (!frame.hasPixelBuffer || frame.isPlanar || width === 0 || height === 0) {
    return null;
  }
  if (pixelFormat !== 'rgb-bgra-8-bit' && pixelFormat !== 'rgb-rgba-8-bit') {
    return null;
  }

  const rowBytes = width * RGB_CHANNELS;
  const raw = new Uint8Array(frame.getPixelBuffer());
  let packed = raw;
  if (bytesPerRow !== rowBytes) {
    packed = new Uint8Array(rowBytes * height);
    for (let row = 0; row < height; row++) {
      packed.set(raw.subarray(row * bytesPerRow, row * bytesPerRow + rowBytes), row * rowBytes);
    }
  }

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
  config: Partial<DetectionConfig> = {}
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
      RetrievalModes.RETR_EXTERNAL,
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

      // Get minimum area rotated rectangle (always produces 4 corners)
      const rotatedRect = OpenCV.minAreaRect(contour);

      // Extract rotated rectangle properties (x/y is the centre)
      const { x: centerX, y: centerY, width: rectWidth, height: rectHeight, angle } = rotatedRect;

      // Calculate corners from rotated rectangle
      const corners = getRotatedRectCorners(centerX, centerY, rectWidth, rectHeight, angle);

      // Scale corners to original frame resolution
      const scaledCorners = scaleCorners(corners, scaleX, scaleY);
      const orderedCorners = orderPoints(scaledCorners);

      // Validate the detected shape is a reasonable document
      if (!isValidDocumentShape(orderedCorners, originalWidth, originalHeight)) {
        if (DEBUG_LOGGING) {
          console.log(`[OpenCV] Contour ${i}: Invalid shape - skipping`);
        }
        continue;
      }

      // Calculate aspect ratio
      const aspectRatio = getContourAspectRatio(rectWidth, rectHeight, docType);
      const ratioError = Math.abs(aspectRatio - expectedRatio) / expectedRatio;

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
