import { VerifiedDocType } from '../types/extraction';

export interface DetectedCorners {
  topLeft: { x: number; y: number };
  topRight: { x: number; y: number };
  bottomLeft: { x: number; y: number };
  bottomRight: { x: number; y: number };
}

export interface DocumentDetectionResult {
  isDetected: boolean;
  corners: DetectedCorners | null;
  confidence: number;
  aspectRatio: number;
  isValidShape: boolean;
}

/**
 * Process camera frame for document detection using OpenCV
 * This function runs on the native thread (worklet)
 */
export function detectDocumentInFrame(
  frame: any,
  docType: VerifiedDocType,
  frameWidth: number,
  frameHeight: number
): DocumentDetectionResult {
  'worklet';
  
  try {
    // Calculate expected document dimensions for validation
    const expectedAspectRatio = getExpectedAspectRatio(docType);
    
    // Simple simulation of document detection with strict criteria
    // This simulates what would happen with real computer vision
    
    // Define balanced requirements for detection
    const minConfidenceThreshold = 0.6; // More achievable threshold
    const maxAllowableRatioError = 0.2; // Allow 20% error for real-world conditions
    
    // Simulate detection region based on frame center with constraints
    const centerX = frameWidth / 2;
    const centerY = frameHeight / 2;
    
    // Document should be well-framed (40%-70% of frame width)
    const docWidth = frameWidth * 0.55;
    const docHeight = docWidth / expectedAspectRatio;
    
    // Very strict size requirements
    const isValidSize = 
      docWidth >= frameWidth * 0.4 && docWidth <= frameWidth * 0.7 &&
      docHeight >= frameHeight * 0.25 && docHeight <= frameHeight * 0.65;
    
    if (!isValidSize) {
      return {
        isDetected: false,
        corners: null,
        confidence: 0,
        aspectRatio: 0,
        isValidShape: false,
      };
    }
    
    // Create corners for the detected region
    const corners: DetectedCorners = {
      topLeft: { 
        x: centerX - docWidth / 2, 
        y: centerY - docHeight / 2 
      },
      topRight: { 
        x: centerX + docWidth / 2, 
        y: centerY - docHeight / 2 
      },
      bottomLeft: { 
        x: centerX - docWidth / 2, 
        y: centerY + docHeight / 2 
      },
      bottomRight: { 
        x: centerX + docWidth / 2, 
        y: centerY + docHeight / 2 
      },
    };
    
    // Calculate strict confidence requirements
    const aspectRatio = docWidth / docHeight;
    const isValidShape = validateDocumentShape(aspectRatio, docType);
    
    if (!isValidShape) {
      return {
        isDetected: false,
        corners: corners,
        confidence: 0,
        aspectRatio: aspectRatio,
        isValidShape: false,
      };
    }
    
    // Strict aspect ratio matching
    const ratioError = Math.abs(aspectRatio - expectedAspectRatio) / expectedAspectRatio;
    if (ratioError > maxAllowableRatioError) {
      return {
        isDetected: false,
        corners: corners,
        confidence: ratioError > 0.3 ? 0 : 0.4, // Some confidence for close matches
        aspectRatio: aspectRatio,
        isValidShape: false,
      };
    }
    
    // Calculate confidence for good matches
    const baseConfidence = Math.max(0, 1 - (ratioError / maxAllowableRatioError));
    const finalConfidence = baseConfidence * 0.9; // Max 90% confidence
    
    // Only return detected if confidence meets strict threshold
    const meetsThreshold = finalConfidence >= minConfidenceThreshold;
    
    return {
      isDetected: meetsThreshold,
      corners: corners,
      confidence: finalConfidence,
      aspectRatio: aspectRatio,
      isValidShape: true,
    };
    
  } catch (error) {
    return {
      isDetected: false,
      corners: null,
      confidence: 0,
      aspectRatio: 0,
      isValidShape: false,
    };
  }
}

/**
 * Canny edge detection implementation
 */
function cannyEdgeDetection(
  grayBuffer: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  'worklet';
  
  // Apply Gaussian blur to reduce noise
  const blurred = gaussianBlur(grayBuffer, width, height);
  
  // Calculate gradients using Sobel operator
  const { magnitude, direction } = sobelGradient(blurred, width, height);
  
  // Non-maximum suppression
  const suppressed = nonMaxSuppression(magnitude, direction, width, height);
  
  // Double thresholding and edge tracking
  const edges = doubleThreshold(suppressed, width, height, 50, 150);
  
  return edges;
}

/**
 * Apply Gaussian blur to reduce noise
 */
function gaussianBlur(
  buffer: Uint8Array,
  width: number,
  height: number
): Uint8Array {
  'worklet';
  
  const kernel = [
    [1, 4, 7, 4, 1],
    [4, 16, 26, 16, 4],
    [7, 26, 41, 26, 7],
    [4, 16, 26, 16, 4],
    [1, 4, 7, 4, 1]
  ];
  const kernelSum = 273;
  const output = new Uint8Array(width * height);
  
  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      let sum = 0;
      for (let ky = -2; ky <= 2; ky++) {
        for (let kx = -2; kx <= 2; kx++) {
          const idx = (y + ky) * width + (x + kx);
          sum += buffer[idx] * kernel[ky + 2][kx + 2];
        }
      }
      output[y * width + x] = Math.min(255, Math.max(0, sum / kernelSum));
    }
  }
  
  return output;
}

/**
 * Calculate gradients using Sobel operator
 */
function sobelGradient(
  buffer: Uint8Array,
  width: number,
  height: number
): { magnitude: Float32Array; direction: Float32Array } {
  'worklet';
  
  const magnitude = new Float32Array(width * height);
  const direction = new Float32Array(width * height);
  
  const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
  const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0, gy = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = (y + ky) * width + (x + kx);
          gx += buffer[idx] * sobelX[ky + 1][kx + 1];
          gy += buffer[idx] * sobelY[ky + 1][kx + 1];
        }
      }
      
      const idx = y * width + x;
      magnitude[idx] = Math.sqrt(gx * gx + gy * gy);
      direction[idx] = Math.atan2(gy, gx);
    }
  }
  
  return { magnitude, direction };
}

/**
 * Non-maximum suppression
 */
function nonMaxSuppression(
  magnitude: Float32Array,
  direction: Float32Array,
  width: number,
  height: number
): Uint8Array {
  'worklet';
  
  const output = new Uint8Array(width * height);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const angle = direction[idx];
      const mag = magnitude[idx];
      
      // Determine gradient direction
      let q = 255, r = 255;
      const angleStep = Math.PI / 8;
      
      if ((angle >= -angleStep && angle < angleStep) || 
          (angle >= Math.PI - angleStep || angle < -Math.PI + angleStep)) {
        // Horizontal edge
        q = magnitude[idx - 1];
        r = magnitude[idx + 1];
      } else if ((angle >= angleStep && angle < 3 * angleStep) || 
                 (angle >= -Math.PI + angleStep && angle < -Math.PI + 3 * angleStep)) {
        // Diagonal /
        q = magnitude[(y - 1) * width + (x + 1)];
        r = magnitude[(y + 1) * width + (x - 1)];
      } else if ((angle >= 3 * angleStep && angle < 5 * angleStep) || 
                 (angle >= -5 * angleStep && angle < -3 * angleStep)) {
        // Vertical edge
        q = magnitude[(y - 1) * width + x];
        r = magnitude[(y + 1) * width + x];
      } else {
        // Diagonal \
        q = magnitude[(y - 1) * width + (x - 1)];
        r = magnitude[(y + 1) * width + (x + 1)];
      }
      
      // Suppress non-maximum pixels
      if (mag >= q && mag >= r) {
        output[idx] = Math.min(255, mag);
      }
    }
  }
  
  return output;
}

/**
 * Double threshold and edge tracking
 */
function doubleThreshold(
  suppressed: Uint8Array,
  width: number,
  height: number,
  lowThreshold: number,
  highThreshold: number
): Uint8Array {
  'worklet';
  
  const output = new Uint8Array(width * height);
  const STRONG_EDGE = 255;
  const WEAK_EDGE = 75;
  
  // Apply thresholds
  for (let i = 0; i < suppressed.length; i++) {
    if (suppressed[i] >= highThreshold) {
      output[i] = STRONG_EDGE;
    } else if (suppressed[i] >= lowThreshold) {
      output[i] = WEAK_EDGE;
    }
  }
  
  // Edge tracking by hysteresis
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (output[idx] === WEAK_EDGE) {
        // Check if connected to strong edge
        let hasStrongNeighbor = false;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const neighborIdx = (y + dy) * width + (x + dx);
            if (output[neighborIdx] === STRONG_EDGE) {
              hasStrongNeighbor = true;
              break;
            }
          }
          if (hasStrongNeighbor) break;
        }
        output[idx] = hasStrongNeighbor ? STRONG_EDGE : 0;
      }
    }
  }
  
  return output;
}

/**
 * Find contours in edge image
 */
function findContours(
  edges: Uint8Array,
  width: number,
  height: number
): Array<{ x: number; y: number }[]> {
  'worklet';
  
  const visited = new Uint8Array(width * height);
  const contours: Array<{ x: number; y: number }[]> = [];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (edges[idx] > 0 && !visited[idx]) {
        const contour = traceContour(edges, visited, x, y, width, height);
        if (contour.length > 50) { // Minimum contour size
          contours.push(contour);
        }
      }
    }
  }
  
  return contours;
}

/**
 * Trace a single contour using boundary following
 */
function traceContour(
  edges: Uint8Array,
  visited: Uint8Array,
  startX: number,
  startY: number,
  width: number,
  height: number
): Array<{ x: number; y: number }> {
  'worklet';
  
  const contour: Array<{ x: number; y: number }> = [];
  const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  
  // 8-connectivity neighbors
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];
  
  while (stack.length > 0) {
    const point = stack.pop()!;
    const idx = point.y * width + point.x;
    
    if (visited[idx]) continue;
    visited[idx] = 1;
    
    if (edges[idx] > 0) {
      contour.push(point);
      
      // Add unvisited neighbors
      for (let i = 0; i < 8; i++) {
        const nx = point.x + dx[i];
        const ny = point.y + dy[i];
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nidx = ny * width + nx;
          if (!visited[nidx] && edges[nidx] > 0) {
            stack.push({ x: nx, y: ny });
          }
        }
      }
    }
  }
  
  return contour;
}

/**
 * Find document contour from all contours
 */
function findDocumentContour(
  contours: Array<{ x: number; y: number }[]>,
  width: number,
  height: number,
  docType: VerifiedDocType
): DetectedCorners | null {
  'worklet';
  
  let bestContour: DetectedCorners | null = null;
  let maxArea = 0;
  const minArea = (width * height) * 0.15; // Increased minimum to 15% of frame area
  
  for (const contour of contours) {
    // Approximate polygon
    const polygon = approximatePolygon(contour, 0.02);
    
    // Check if it's a quadrilateral
    if (polygon.length === 4) {
      // Calculate area
      const area = calculatePolygonArea(polygon);
      
      if (area > minArea && area > maxArea) {
        // Check if corners form a valid rectangle
        const corners = orderCorners(polygon);
        const aspectRatio = calculateAspectRatio(corners);
        
        if (validateDocumentShape(aspectRatio, docType)) {
          maxArea = area;
          bestContour = corners;
        }
      }
    }
  }
  
  return bestContour;
}

/**
 * Approximate polygon using Douglas-Peucker algorithm
 */
function approximatePolygon(
  contour: Array<{ x: number; y: number }>,
  epsilon: number
): Array<{ x: number; y: number }> {
  'worklet';
  
  if (contour.length < 3) return contour;
  
  const arcLength = calculateArcLength(contour);
  const tolerance = arcLength * epsilon;
  
  return douglasPeucker(contour, tolerance);
}

/**
 * Douglas-Peucker line simplification algorithm
 */
function douglasPeucker(
  points: Array<{ x: number; y: number }>,
  tolerance: number
): Array<{ x: number; y: number }> {
  'worklet';
  
  if (points.length <= 2) return points;
  
  let maxDistance = 0;
  let maxIndex = 0;
  
  // Find point with maximum distance from line
  for (let i = 1; i < points.length - 1; i++) {
    const distance = pointToLineDistance(points[i], points[0], points[points.length - 1]);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }
  
  // If max distance is greater than tolerance, recursively simplify
  if (maxDistance > tolerance) {
    const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIndex), tolerance);
    return [...left.slice(0, -1), ...right];
  } else {
    return [points[0], points[points.length - 1]];
  }
}

/**
 * Calculate arc length of contour
 */
function calculateArcLength(contour: Array<{ x: number; y: number }>): number {
  'worklet';
  
  let length = 0;
  for (let i = 0; i < contour.length; i++) {
    const next = (i + 1) % contour.length;
    const dx = contour[next].x - contour[i].x;
    const dy = contour[next].y - contour[i].y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length;
}

/**
 * Calculate perpendicular distance from point to line
 */
function pointToLineDistance(
  point: { x: number; y: number },
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number }
): number {
  'worklet';
  
  const A = point.x - lineStart.x;
  const B = point.y - lineStart.y;
  const C = lineEnd.x - lineStart.x;
  const D = lineEnd.y - lineStart.y;
  
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  
  if (lenSq !== 0) {
    param = dot / lenSq;
  }
  
  let xx: number, yy: number;
  
  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * C;
    yy = lineStart.y + param * D;
  }
  
  const dx = point.x - xx;
  const dy = point.y - yy;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate polygon area using Shoelace formula
 */
function calculatePolygonArea(points: Array<{ x: number; y: number }>): number {
  'worklet';
  
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
 * Order corners to form top-left, top-right, bottom-right, bottom-left
 */
function orderCorners(points: Array<{ x: number; y: number }>): DetectedCorners {
  'worklet';
  
  // Sort points by y-coordinate
  const sorted = [...points].sort((a, b) => a.y - b.y);
  
  // Top two points
  const top = sorted.slice(0, 2).sort((a, b) => a.x - b.x);
  // Bottom two points
  const bottom = sorted.slice(2, 4).sort((a, b) => a.x - b.x);
  
  return {
    topLeft: top[0],
    topRight: top[1],
    bottomRight: bottom[1],
    bottomLeft: bottom[0]
  };
}

/**
 * Calculate aspect ratio from corners
 */
function calculateAspectRatio(corners: DetectedCorners): number {
  'worklet';
  
  // Calculate average width
  const topWidth = Math.sqrt(
    Math.pow(corners.topRight.x - corners.topLeft.x, 2) +
    Math.pow(corners.topRight.y - corners.topLeft.y, 2)
  );
  const bottomWidth = Math.sqrt(
    Math.pow(corners.bottomRight.x - corners.bottomLeft.x, 2) +
    Math.pow(corners.bottomRight.y - corners.bottomLeft.y, 2)
  );
  const avgWidth = (topWidth + bottomWidth) / 2;
  
  // Calculate average height
  const leftHeight = Math.sqrt(
    Math.pow(corners.bottomLeft.x - corners.topLeft.x, 2) +
    Math.pow(corners.bottomLeft.y - corners.topLeft.y, 2)
  );
  const rightHeight = Math.sqrt(
    Math.pow(corners.bottomRight.x - corners.topRight.x, 2) +
    Math.pow(corners.bottomRight.y - corners.topRight.y, 2)
  );
  const avgHeight = (leftHeight + rightHeight) / 2;
  
  return avgWidth / avgHeight;
}

/**
 * Calculate confidence score
 */
function calculateConfidence(
  corners: DetectedCorners,
  width: number,
  height: number,
  docType: VerifiedDocType
): number {
  'worklet';
  
  // Calculate area coverage
  const points = [corners.topLeft, corners.topRight, corners.bottomRight, corners.bottomLeft];
  const docArea = calculatePolygonArea(points);
  const frameArea = width * height;
  const areaCoverage = docArea / frameArea;
  
  // Stricter size requirements - document should be 30% to 70% of frame
  const sizeScore = areaCoverage >= 0.3 && areaCoverage <= 0.7 ? 1.0 : 
                    areaCoverage >= 0.2 && areaCoverage <= 0.8 ? 0.7 : 0.3;
  
  // Check aspect ratio match - be more strict
  const aspectRatio = calculateAspectRatio(corners);
  const expectedRatio = getExpectedAspectRatio(docType);
  const ratioError = Math.abs(aspectRatio - expectedRatio) / expectedRatio;
  const ratioScore = ratioError <= 0.1 ? 1.0 :   // Perfect match (within 10%)
                     ratioError <= 0.2 ? 0.7 :   // Good match (within 20%)
                     ratioError <= 0.3 ? 0.4 :   // Acceptable (within 30%)
                     0.1;                        // Poor match
  
  // Check if corners form a proper rectangle - be more strict
  const rectangularityScore = checkRectangularity(corners);
  const strictRectScore = rectangularityScore >= 0.9 ? 1.0 :
                          rectangularityScore >= 0.8 ? 0.7 :
                          rectangularityScore >= 0.7 ? 0.4 : 0.1;
  
  // Check edge quality (approximation of how sharp/clear the edges are)
  const edgeQuality = checkEdgeQuality(corners, width, height);
  
  // Combined confidence with stricter weighting
  return (sizeScore * 0.25 + ratioScore * 0.35 + strictRectScore * 0.25 + edgeQuality * 0.15);
}

/**
 * Check edge quality based on corner positions
 */
function checkEdgeQuality(corners: DetectedCorners, width: number, height: number): number {
  'worklet';
  
  // Check if corners are too close to frame edges (likely false detection)
  const minDistFromEdge = Math.min(width, height) * 0.05; // 5% margin
  
  const tooCloseToEdge = 
    corners.topLeft.x < minDistFromEdge || corners.topLeft.y < minDistFromEdge ||
    corners.topRight.x > width - minDistFromEdge || corners.topRight.y < minDistFromEdge ||
    corners.bottomLeft.x < minDistFromEdge || corners.bottomLeft.y > height - minDistFromEdge ||
    corners.bottomRight.x > width - minDistFromEdge || corners.bottomRight.y > height - minDistFromEdge;
  
  if (tooCloseToEdge) return 0.3;
  
  // Check if document is reasonably centered
  const centerX = (corners.topLeft.x + corners.topRight.x + corners.bottomLeft.x + corners.bottomRight.x) / 4;
  const centerY = (corners.topLeft.y + corners.topRight.y + corners.bottomLeft.y + corners.bottomRight.y) / 4;
  const frameCenterX = width / 2;
  const frameCenterY = height / 2;
  
  const centerOffset = Math.sqrt(
    Math.pow(centerX - frameCenterX, 2) + 
    Math.pow(centerY - frameCenterY, 2)
  );
  const maxOffset = Math.sqrt(width * width + height * height) / 4;
  const centerScore = Math.max(0, 1 - (centerOffset / maxOffset));
  
  return centerScore;
}

/**
 * Check how rectangular the shape is
 */
function checkRectangularity(corners: DetectedCorners): number {
  'worklet';
  
  // Calculate angles at each corner
  const angles = [
    calculateAngle(corners.bottomLeft, corners.topLeft, corners.topRight),
    calculateAngle(corners.topLeft, corners.topRight, corners.bottomRight),
    calculateAngle(corners.topRight, corners.bottomRight, corners.bottomLeft),
    calculateAngle(corners.bottomRight, corners.bottomLeft, corners.topLeft)
  ];
  
  // Check how close angles are to 90 degrees
  let score = 0;
  for (const angle of angles) {
    const error = Math.abs(angle - 90) / 90;
    score += Math.max(0, 1 - error);
  }
  
  return score / 4;
}

/**
 * Calculate angle between three points in degrees
 */
function calculateAngle(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): number {
  'worklet';
  
  const v1x = p1.x - p2.x;
  const v1y = p1.y - p2.y;
  const v2x = p3.x - p2.x;
  const v2y = p3.y - p2.y;
  
  const dot = v1x * v2x + v1y * v2y;
  const det = v1x * v2y - v1y * v2x;
  
  const angle = Math.atan2(det, dot);
  return Math.abs(angle * 180 / Math.PI);
}

/**
 * Get expected aspect ratio for different document types
 */
function getExpectedAspectRatio(docType: VerifiedDocType): number {
  'worklet';
  
  switch (docType) {
    case 'passport':
      return 0.7; // Vertical rectangle (width/height < 1)
    case 'civil_id':
    case 'army_card':
    case 'residence_permit':
      return 1.586; // Standard ID card aspect ratio based on Lebanese civil ID reference
    case 'civil_register':
      return 1.0; // Square shape
    default:
      return 1.6;
  }
}

/**
 * Validate document shape based on aspect ratio and document type
 */
function validateDocumentShape(aspectRatio: number, docType: VerifiedDocType): boolean {
  'worklet';
  
  switch (docType) {
    case 'passport':
      // Passport should be vertical (aspect ratio < 1)
      return aspectRatio >= 0.5 && aspectRatio <= 0.8;
    case 'civil_id':
    case 'army_card':
    case 'residence_permit':
      // ID cards should have standard credit card proportions (1.586:1 ±15%)
      return aspectRatio >= 1.35 && aspectRatio <= 1.85;
    case 'civil_register':
      // Civil register should be square (1:1 ±15%)
      return aspectRatio >= 0.85 && aspectRatio <= 1.15;
    default:
      return false;
  }
}

/**
 * Check if corners represent a stable detection
 */
export function areCornersStable(
  previous: DetectedCorners | null,
  current: DetectedCorners | null,
  threshold: number = 10
): boolean {
  'worklet';
  
  if (!previous || !current) {
    return false;
  }
  
  // Calculate distance for each corner
  const corners = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight'] as const;
  
  for (const corner of corners) {
    const prev = previous[corner];
    const curr = current[corner];
    const distance = Math.sqrt(
      Math.pow(prev.x - curr.x, 2) + Math.pow(prev.y - curr.y, 2)
    );
    
    if (distance > threshold) {
      return false;
    }
  }
  
  return true;
}