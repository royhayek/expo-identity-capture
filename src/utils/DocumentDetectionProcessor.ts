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
    // TODO: Replace with actual OpenCV processing
    // For now, this is a placeholder that would be replaced with:
    // 1. Convert frame to OpenCV Mat
    // 2. Apply Gaussian blur to reduce noise
    // 3. Convert to grayscale
    // 4. Apply Canny edge detection
    // 5. Find contours
    // 6. Filter contours by area and shape
    // 7. Find the largest rectangular contour
    // 8. Validate aspect ratio based on document type
    
    // Simulate OpenCV processing with actual logic structure
    const mockDetection = simulateDocumentDetection(docType, frameWidth, frameHeight);
    
    return mockDetection;
    
  } catch (error) {
    console.error('Frame processing error:', error);
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
 * Simulate document detection until OpenCV is fully integrated
 * This mimics the actual detection logic but with mock data
 */
function simulateDocumentDetection(
  docType: VerifiedDocType,
  frameWidth: number,
  frameHeight: number
): DocumentDetectionResult {
  'worklet';
  
  // Mock detection that varies over time to simulate real detection
  const now = Date.now();
  const variance = Math.sin(now / 1000) * 0.3 + 0.7; // Creates variation between 0.4 and 1.0
  
  // Calculate expected aspect ratios for different document types
  const expectedAspectRatio = getExpectedAspectRatio(docType);
  
  // Simulate finding a rectangular region in the frame
  const centerX = frameWidth / 2;
  const centerY = frameHeight / 2;
  
  // Calculate document dimensions based on expected aspect ratio
  const docWidth = frameWidth * 0.8 * variance; // Varies based on "detection quality"
  const docHeight = docWidth / expectedAspectRatio;
  
  // Calculate corners
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
  
  // Calculate actual aspect ratio
  const actualAspectRatio = docWidth / docHeight;
  
  // Validate shape based on document type
  const isValidShape = validateDocumentShape(actualAspectRatio, docType);
  
  // Confidence based on how close the aspect ratio is to expected
  const aspectRatioDiff = Math.abs(actualAspectRatio - expectedAspectRatio);
  const confidence = Math.max(0, 1 - aspectRatioDiff * 2) * variance;
  
  // Detection is successful if confidence is high and shape is valid
  const isDetected = confidence > 0.7 && isValidShape && variance > 0.6;
  
  return {
    isDetected,
    corners: isDetected ? corners : null,
    confidence,
    aspectRatio: actualAspectRatio,
    isValidShape,
  };
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
      return 1.6; // Horizontal rectangle (width/height > 1)
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
      // Other documents should be horizontal (aspect ratio > 1)
      return aspectRatio >= 1.2 && aspectRatio <= 2.0;
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